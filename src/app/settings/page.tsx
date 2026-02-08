'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Store, LogOut, Moon, Sun, Info, ChevronRight, Wifi, WifiOff } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, signOut, venue } = useAuth();
  const { theme, toggleTheme } = useTheme();
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

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
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