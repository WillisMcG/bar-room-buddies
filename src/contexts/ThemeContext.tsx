'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ThemeMode } from '@/types';

interface VenueBranding {
  name: string | null;
  logoUrl: string | null;
  accentColor: string;
}

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  venue: VenueBranding;
  setVenueBranding: (branding: Partial<VenueBranding>) => void;
  clearVenueBranding: () => void;
  accentColor: string;
}

const DEFAULT_ACCENT = '#22c55e';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [venue, setVenueState] = useState<VenueBranding>({
    name: null,
    logoUrl: null,
    accentColor: DEFAULT_ACCENT,
  });

  useEffect(() => {
    // Load saved theme
    const saved = window.localStorage.getItem('brb_theme') as ThemeMode | null;
    if (saved) {
      setThemeState(saved);
    }

    // Load saved venue branding
    const savedVenue = window.localStorage.getItem('brb_venue');
    if (savedVenue) {
      try {
        setVenueState(JSON.parse(savedVenue));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('brb_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  const setVenueBranding = (branding: Partial<VenueBranding>) => {
    setVenueState((prev) => {
      const updated = { ...prev, ...branding };
      window.localStorage.setItem('brb_venue', JSON.stringify(updated));
      return updated;
    });
  };

  const clearVenueBranding = () => {
    const cleared = { name: null, logoUrl: null, accentColor: DEFAULT_ACCENT };
    setVenueState(cleared);
    window.localStorage.removeItem('brb_venue');
  };

  // Apply accent color as CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', venue.accentColor || DEFAULT_ACCENT);
  }, [venue.accentColor]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme,
        venue,
        setVenueBranding,
        clearVenueBranding,
        accentColor: venue.accentColor || DEFAULT_ACCENT,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
