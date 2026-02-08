'use client';

import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { Sun, Moon, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Header() {
  const { theme, toggleTheme, venue } = useTheme();
  const { venue: authVenue } = useAuth();
  const [isOnline, setIsOnline] = useState(true);

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

  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
        <Link href="/" className="flex items-center gap-2">
          {(authVenue?.logo_url || venue.logoUrl) ? (
            <img src={authVenue?.logo_url || venue.logoUrl || ''} alt={authVenue?.name || venue.name || ''} className="w-7 h-7 rounded" />
          ) : (
            <div
              className="w-7 h-7 rounded flex items-center justify-center text-white font-bold text-xs"
              style={{ backgroundColor: 'var(--accent-color)' }}
            >
              BB
            </div>
          )}
          <span className="font-bold text-gray-900 dark:text-white text-sm">
            {authVenue?.name || venue.name || 'Bar Room Buddies'}
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {!isOnline && (
            <div className="flex items-center gap-1 text-yellow-500 text-xs">
              <WifiOff className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Offline</span>
            </div>
          )}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            ) : (
              <Moon className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}