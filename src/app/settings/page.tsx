'use client';

import { useState } from 'react';
import Link from 'next/link';
import { User, Palette, Store, LogIn, LogOut, Moon, Sun, Info, Shield, ChevronRight, Wifi, WifiOff } from 'lucide-react';
import PageWrapper from '@/components/layout/PageWrapper';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useEffect } from 'react';

export default function SettingsPage() {
  const { user, profile, isAuthenticated, signUp, signIn, signOut } = useAuth();
  const { theme, toggleTheme, venue } = useTheme();
  const [showAuth, setShowAuth] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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

  const handleAuth = async () => {
    setAuthError('');
    setIsLoading(true);

    if (isSignUp) {
      if (!displayName.trim()) {
        setAuthError('Please enter a display name');
        setIsLoading(false);
        return;
      }
      const { error } = await signUp(email, password, displayName.trim());
      if (error) setAuthError(error);
      else setShowAuth(false);
    } else {
      const { error } = await signIn(email, password);
      if (error) setAuthError(error);
      else setShowAuth(false);
    }

    setIsLoading(false);
  };

  return (
    <PageWrapper title="Settings">
      {/* Account Section */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Account</h2>
        <Card padding="none">
          {isAuthenticated ? (
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
              <Button variant="ghost" size="sm" className="w-full text-red-500" onClick={signOut}>
                <LogOut className="w-4 h-4 mr-1" /> Sign Out
              </Button>
            </div>
          ) : (
            <div className="p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Sign in to sync your stats across devices and claim your player profile.
              </p>
              <div className="flex gap-2">
                <Button variant="primary" size="sm" className="flex-1" onClick={() => { setIsSignUp(false); setShowAuth(true); }}>
                  <LogIn className="w-4 h-4 mr-1" /> Sign In
                </Button>
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => { setIsSignUp(true); setShowAuth(true); }}>
                  Sign Up
                </Button>
              </div>
            </div>
          )}
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
                <p className="text-xs text-gray-500">{venue.name || 'Not configured'}</p>
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

      {/* Auth Modal */}
      <Modal isOpen={showAuth} onClose={() => { setShowAuth(false); setAuthError(''); }} title={isSignUp ? 'Create Account' : 'Sign In'}>
        <div className="space-y-4">
          {isSignUp && (
            <Input
              label="Display Name"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoFocus
            />
          )}
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus={!isSignUp}
          />
          <Input
            label="Password"
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
          />
          {authError && <p className="text-sm text-red-500">{authError}</p>}
          <Button variant="accent" className="w-full" onClick={handleAuth} disabled={isLoading}>
            {isLoading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
          </Button>
          <button
            onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }}
            className="w-full text-xs text-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </Modal>
    </PageWrapper>
  );
}
