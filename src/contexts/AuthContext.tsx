'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// Simple password - change this to your family's secret password
const FAMILY_PASSWORD = 'poribar';
const SESSION_KEY = 'family-tree-session';
const IDENTITY_KEY = 'family-tree-identity';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userIdentity: string | null; // Person ID of the current user
  login: (password: string) => boolean;
  logout: () => void;
  setUserIdentity: (personId: string) => void;
  clearIdentity: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userIdentity, setUserIdentityState] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing session and identity
    const session = localStorage.getItem(SESSION_KEY);
    const identity = localStorage.getItem(IDENTITY_KEY);

    if (session === 'authenticated') {
      setIsAuthenticated(true);
    }
    if (identity) {
      setUserIdentityState(identity);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((password: string): boolean => {
    if (password === FAMILY_PASSWORD) {
      localStorage.setItem(SESSION_KEY, 'authenticated');
      setIsAuthenticated(true);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(IDENTITY_KEY);
    setIsAuthenticated(false);
    setUserIdentityState(null);
  }, []);

  const setUserIdentity = useCallback((personId: string) => {
    localStorage.setItem(IDENTITY_KEY, personId);
    setUserIdentityState(personId);
  }, []);

  const clearIdentity = useCallback(() => {
    localStorage.removeItem(IDENTITY_KEY);
    setUserIdentityState(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      isLoading,
      userIdentity,
      login,
      logout,
      setUserIdentity,
      clearIdentity,
    }}>
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
