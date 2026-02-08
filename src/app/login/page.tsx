'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp, isAuthenticated } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');

  // Sign In form state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Sign Up form state
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [venueName, setVenueName] = useState('');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [signInEmailError, setSignInEmailError] = useState('');
  const [signInPasswordError, setSignInPasswordError] = useState('');
  const [signUpEmailError, setSignUpEmailError] = useState('');
  const [signUpPasswordError, setSignUpPasswordError] = useState('');
  const [displayNameError, setDisplayNameError] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  // Validate email format
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Handle sign in
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setSignInEmailError('');
    setSignInPasswordError('');
    setError('');

    // Validate
    let hasError = false;
    if (!signInEmail) {
      setSignInEmailError('Email is required');
      hasError = true;
    } else if (!isValidEmail(signInEmail)) {
      setSignInEmailError('Please enter a valid email');
      hasError = true;
    }

    if (!signInPassword) {
      setSignInPasswordError('Password is required');
      hasError = true;
    } else if (signInPassword.length < 6) {
      setSignInPasswordError('Password must be at least 6 characters');
      hasError = true;
    }

    if (hasError) return;

    setIsLoading(true);
    try {
      const { error: authError } = await signIn(signInEmail, signInPassword);
      if (authError) {
        setError(authError);
      }
      // Router push will happen automatically via useEffect when isAuthenticated changes
    } finally {
      setIsLoading(false);
    }
  };

  // Handle sign up
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setSignUpEmailError('');
    setSignUpPasswordError('');
    setDisplayNameError('');
    setError('');

    // Validate
    let hasError = false;
    if (!signUpEmail) {
      setSignUpEmailError('Email is required');
      hasError = true;
    } else if (!isValidEmail(signUpEmail)) {
      setSignUpEmailError('Please enter a valid email');
      hasError = true;
    }

    if (!signUpPassword) {
      setSignUpPasswordError('Password is required');
      hasError = true;
    } else if (signUpPassword.length < 6) {
      setSignUpPasswordError('Password must be at least 6 characters');
      hasError = true;
    }

    if (!displayName.trim()) {
      setDisplayNameError('Display name is required');
      hasError = true;
    } else if (displayName.trim().length < 2) {
      setDisplayNameError('Display name must be at least 2 characters');
      hasError = true;
    }

    if (hasError) return;

    setIsLoading(true);
    try {
      const { error: authError } = await signUp(
        signUpEmail,
        signUpPassword,
        displayName.trim(),
        venueName.trim() || undefined
      );
      if (authError) {
        setError(authError);
      }
      // Router push will happen automatically via useEffect when isAuthenticated changes
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 dark:bg-gray-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 bg-green-600 rounded-xl flex items-center justify-center">
              <span className="text-2xl font-bold text-white">BB</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Bar Room Buddies</h1>
          <p className="text-gray-400">Your game companion for the bar</p>
        </div>

        {/* Card Container */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                setActiveTab('signin');
                setError('');
              }}
              className={`flex-1 py-4 px-4 font-medium transition-colors text-center ${
                activeTab === 'signin'
                  ? 'text-green-600 border-b-2 border-green-600 dark:text-green-500 dark:border-green-500'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setActiveTab('signup');
                setError('');
              }}
              className={`flex-1 py-4 px-4 font-medium transition-colors text-center ${
                activeTab === 'signup'
                  ? 'text-green-600 border-b-2 border-green-600 dark:text-green-500 dark:border-green-500'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form Container */}
          <div className="p-6">
            {/* Error Alert */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Sign In Tab */}
            {activeTab === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <Input
                  id="signin-email"
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={signInEmail}
                  onChange={(e) => {
                    setSignInEmail(e.target.value);
                    setSignInEmailError('');
                  }}
                  error={signInEmailError}
                  autoFocus
                  disabled={isLoading}
                />

                <Input
                  id="signin-password"
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  value={signInPassword}
                  onChange={(e) => {
                    setSignInPassword(e.target.value);
                    setSignInPasswordError('');
                  }}
                  error={signInPasswordError}
                  disabled={isLoading}
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full mt-6"
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>

                <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('signup');
                      setError('');
                    }}
                    className="text-green-600 dark:text-green-500 hover:text-green-700 dark:hover:text-green-400 font-medium"
                  >
                    Sign up
                  </button>
                </p>
              </form>
            )}

            {/* Sign Up Tab */}
            {activeTab === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-4">
                <Input
                  id="signup-email"
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={signUpEmail}
                  onChange={(e) => {
                    setSignUpEmail(e.target.value);
                    setSignUpEmailError('');
                  }}
                  error={signUpEmailError}
                  autoFocus
                  disabled={isLoading}
                />

                <Input
                  id="signup-password"
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  value={signUpPassword}
                  onChange={(e) => {
                    setSignUpPassword(e.target.value);
                    setSignUpPasswordError('');
                  }}
                  error={signUpPasswordError}
                  disabled={isLoading}
                />

                <Input
                  id="display-name"
                  label="Display Name"
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setDisplayNameError('');
                  }}
                  error={displayNameError}
                  disabled={isLoading}
                />

                <Input
                  id="venue-name"
                  label="Venue Name (Optional)"
                  type="text"
                  placeholder="Your bar or venue"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  disabled={isLoading}
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full mt-6"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </Button>

                <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('signin');
                      setError('');
                    }}
                    className="text-green-600 dark:text-green-500 hover:text-green-700 dark:hover:text-green-400 font-medium"
                  >
                    Sign in
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>

        {/* Footer Text */}
        <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}