'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Store, LogOut, Moon, Sun, Info, ChevronRight, Wifi, WifiOff, Trash2 } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { db } from '@/lib/db/dexie';
import { createClient } from '@/lib/supabase/client';

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, signOut, venue } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isOnline, setIsOnline] = useState(true);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const handleResetData = async () => {
    setResetting(true);
    try {
      // 1. Clear Supabase data via RPC (keeps profile + venue)
      if (user) {
        const supabase = createClient();
        const { error } = await supabase.rpc('reset_account_data');
        if (error) {
          console.error('Supabase reset failed:', error);
        }
      }

      // 2. Clear all local IndexedDB tables
      await db.matches.clear();
      await db.games.clear();
      await db.sessions.clear();
      await db.sessionGames.clear();
      await db.tournaments.clear();
      await db.tournamentParticipants.clear();
      await db.tournamentMatches.clear();
      await db.tournamentGames.clear();
      await db.teams.clear();
      await db.profiles.clear();
      await db.syncMeta.clear();

      setShowResetModal(false);
      router.push('/');
    } catch (err) {
      console.error('Failed to reset data:', err);
    } finally {
      setResetting(false);
    }
  };

  return (
    <PageWrapper title="Settings">
      {/* Account Section */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Account</h2>
        <Card padding="none">
          <div className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <User className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{profile?.display_name}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <Badge variant="success" className="ml-auto">Signed In</Badge>
            </div>
            <Button variant="ghost" size="sm" className="w-full text-red-500" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-1" /> Sign Out
            </Button>
          </div>
        </Card>
      </div>

      {/* Appearance */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Appearance</h2>
        <Card padding="none">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              {theme === 'dark' ? <Moon className="w-5 h-5 text-blue-400" /> : <Sun className="w-5 h-5 text-yellow-500" />}
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Theme</p>
                <p className="text-xs text-gray-500">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
              </div>
            </div>
            <div className="w-12 h-6 rounded-full bg-gray-200 dark:bg-green-600 relative transition-colors">
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </div>
          </button>
        </Card>
      </div>

      {/* Venue Branding */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Venue</h2>
        <Card padding="none">
          <Link href="/venue" className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <div className="flex items-center gap-3">
              <Store className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Venue Branding</p>
                <p className="text-xs text-gray-500">{venue?.name || 'Not configured'}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
        </Card>
      </div>

      {/* Status */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Status</h2>
        <Card padding="none">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              {isOnline ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-yellow-500" />}
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Connection</p>
                <p className="text-xs text-gray-500">{isOnline ? 'Online - syncing enabled' : 'Offline - data saved locally'}</p>
              </div>
            </div>
            <Badge variant={isOnline ? 'success' : 'warning'}>{isOnline ? 'Online' : 'Offline'}</Badge>
          </div>
        </Card>
      </div>

      {/* Danger Zone */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Data</h2>
        <Card padding="none">
          <button
            onClick={() => setShowResetModal(true)}
            className="w-full flex items-center justify-between p-4 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-5 h-5 text-red-500" />
              <div className="text-left">
                <p className="text-sm font-medium text-red-500">Reset All Data</p>
                <p className="text-xs text-gray-500">Delete all players, matches, and stats</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </Card>
      </div>

      {/* Reset Confirmation Modal */}
      <Modal isOpen={showResetModal} onClose={() => setShowResetModal(false)} title="Reset All Data?">
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          This will permanently delete all local players, matches, sessions, tournaments, and teams. Your account and venue settings will be kept.
        </p>
        <p className="text-sm font-medium text-red-500 mb-4">This cannot be undone.</p>
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => setShowResetModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1 !bg-red-600 hover:!bg-red-700"
            onClick={handleResetData}
            disabled={resetting}
          >
            {resetting ? 'Resetting...' : 'Reset Everything'}
          </Button>
        </div>
      </Modal>

      {/* About */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">About</h2>
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Bar Room Buddies</p>
              <p className="text-xs text-gray-500">Version 0.1.0 MVP</p>
            </div>
          </div>
        </Card>
      </div>

    </PageWrapper>
  );
}