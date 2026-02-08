'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { db, getDeviceId } from '@/lib/db/dexie';
import type { Profile } from '@/types';
import type { LocalVenue } from '@/lib/db/dexie';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  venue: LocalVenue | null;
  venueId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signUp: (email: string, password: string, displayName: string, venueName?: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [venue, setVenue] = useState<LocalVenue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const fetchVenue = useCallback(async (profileId: string) => {
    try {
      const { data } = await supabase
        .from('venues')
        .select('*')
        .eq('owner_id', profileId)
        .single();

      if (data) {
        setVenue(data as LocalVenue);
        // Cache in local DB
        await db.venues.put({
          ...data,
          logo_blob: null,
          synced: true,
        });
      }
    } catch (error) {
      // User might not have a venue yet, which is fine
      console.debug('Venue fetch info:', error);
    }
  }, [supabase]);

  const fetchProfile = useCallback(async (authUser: User) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .single();

    if (data) {
      setProfile(data as Profile);
      // Also cache in local DB
      await db.profiles.put({
        ...data,
        avatar_blob: null,
        synced: true,
      });
      // Fetch associated venue
      await fetchVenue(data.id);
    }
  }, [supabase, fetchVenue]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user);
        }
      } catch (error) {
        console.error('Auth init error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user);
        } else {
          setUser(null);
          setProfile(null);
          setVenue(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile]);

  const signUp = async (email: string, password: string, displayName: string, venueName?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) return { error: error.message };

      if (data.user) {
        // Create profile via SECURITY DEFINER RPC (bypasses RLS for signup)
        const { data: profileData, error: profileError } = await supabase
          .rpc('create_profile_for_user', {
            p_auth_user_id: data.user.id,
            p_email: email,
            p_display_name: displayName,
            p_device_id: getDeviceId(),
          });

        if (profileError) return { error: profileError.message };

        // Create venue if venueName is provided
        if (venueName && profileData) {
          const { error: venueError } = await supabase
            .rpc('create_venue_for_profile', {
              p_profile_id: profileData.id,
              p_name: venueName,
            });

          if (venueError) return { error: venueError.message };
        }
      }

      return { error: null };
    } catch (err) {
      return { error: 'An unexpected error occurred' };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { error: error.message };
      return { error: null };
    } catch (err) {
      return { error: 'An unexpected error occurred' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setVenue(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        venue,
        venueId: venue?.id ?? null,
        isLoading,
        isAuthenticated: !!user,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}