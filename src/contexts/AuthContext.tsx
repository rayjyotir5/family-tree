'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { verifyPassword, isPasswordSet } from '@/lib/auth/password';
import { createSession, checkSession, clearSession } from '@/lib/auth/session';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isFirstTime: boolean;
  login: (password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstTime, setIsFirstTime] = useState(false);

  useEffect(() => {
    // Check for existing session
    const hasSession = checkSession();
    setIsAuthenticated(hasSession);
    setIsFirstTime(!isPasswordSet());
    setIsLoading(false);
  }, []);

  const login = useCallback((password: string) => {
    if (verifyPassword(password)) {
      createSession();
      setIsAuthenticated(true);
      setIsFirstTime(false);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, isFirstTime, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
