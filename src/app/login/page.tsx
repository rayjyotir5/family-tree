'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isAuthenticated, isLoading, isFirstTime } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password.trim()) {
      setError('Please enter a password');
      return;
    }

    if (login(password)) {
      router.push('/');
    } else {
      setError('Incorrect password');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-warm-50 via-primary-50 to-accent-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-warm-50 via-primary-50 to-accent-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-md border border-warm-200">
        <div className="text-center mb-8">
          {/* Tree Icon */}
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-accent-100 to-accent-200 rounded-2xl flex items-center justify-center shadow-sm">
            <svg className="w-9 h-9 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-warm-800">Family Tree</h1>
          <p className="text-warm-500 mt-2">
            {isFirstTime
              ? 'Set a password to protect your family tree'
              : 'Enter the family password to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-warm-700 mb-1.5">
              {isFirstTime ? 'Create Password' : 'Password'}
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isFirstTime ? 'Create a family password' : 'Enter password'}
              className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-warm-800 placeholder-warm-400 transition-colors"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-primary-500 text-white py-3 rounded-xl font-medium hover:bg-primary-600 active:bg-primary-700 transition-colors shadow-sm"
          >
            {isFirstTime ? 'Set Password & Enter' : 'Enter'}
          </button>
        </form>

        {isFirstTime && (
          <p className="text-xs text-warm-500 mt-5 text-center leading-relaxed">
            This password will be stored locally in your browser. You can change it later in settings.
          </p>
        )}
      </div>
    </div>
  );
}
