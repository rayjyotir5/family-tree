'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useFamilyTree } from '@/contexts/FamilyTreeContext';
import type { Individual } from '@/lib/types';

export default function IdentifyPage() {
  const [query, setQuery] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<Individual | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isEntering, setIsEntering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { isAuthenticated, isLoading: authLoading, setUserIdentity, userIdentity } = useAuth();
  const { getAllIndividuals, setRootPersonId, isLoading: dataLoading } = useFamilyTree();
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Redirect to home if already identified
  useEffect(() => {
    if (!authLoading && isAuthenticated && userIdentity) {
      router.push('/');
    }
  }, [isAuthenticated, authLoading, userIdentity, router]);

  // Focus input on mount
  useEffect(() => {
    if (!authLoading && !dataLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [authLoading, dataLoading]);

  // Search individuals by name or nickname
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase().trim();
    const individuals = getAllIndividuals();

    return individuals.filter(person => {
      const fullName = person.name.full.toLowerCase();
      const givenName = person.name.given.toLowerCase();
      const surname = person.name.surname.toLowerCase();
      const nickname = person.name.nickname?.toLowerCase() || '';

      return (
        fullName.includes(lowerQuery) ||
        givenName.includes(lowerQuery) ||
        surname.includes(lowerQuery) ||
        nickname.includes(lowerQuery) ||
        `${givenName} ${surname}`.includes(lowerQuery)
      );
    }).slice(0, 6); // Limit to 6 suggestions
  }, [query, getAllIndividuals]);

  // Reset highlighted index when suggestions change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [suggestions]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
    } else if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      handleSelectPerson(suggestions[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleSelectPerson = (person: Individual) => {
    setSelectedPerson(person);
    setQuery(person.name.full);
    setShowSuggestions(false);
  };

  const handleContinue = async () => {
    if (!selectedPerson) return;

    setIsEntering(true);

    // Set the user identity and root person
    setUserIdentity(selectedPerson.id);
    await setRootPersonId(selectedPerson.id);

    // Small delay for animation
    setTimeout(() => {
      router.push('/');
    }, 300);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedPerson(null);
    setShowSuggestions(value.trim().length > 0);
  };

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 via-accent-500 to-primary-600">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          <p className="text-white/80 text-sm">Loading family data...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen flex flex-col transition-opacity duration-300 ${
        isEntering ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Colorful gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary-400 via-accent-500 to-primary-600">
        {/* Decorative shapes */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-accent-400/20 rounded-full blur-3xl translate-x-1/4 translate-y-1/4"></div>
        <div className="absolute top-1/2 left-1/2 w-72 h-72 bg-primary-300/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      </div>

      {/* Main content - centered */}
      <div className="relative flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-2xl">
          {/* Question number indicator (typeform style) */}
          <div className="flex items-center gap-3 mb-8">
            <span className="inline-flex items-center justify-center w-8 h-8 bg-white text-primary-600 text-sm font-bold rounded-lg shadow-lg">
              1
            </span>
            <div className="h-px flex-1 bg-white/30"></div>
          </div>

          {/* Main question */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-4 leading-tight drop-shadow-lg">
            Who are you?
          </h1>

          <p className="text-white/80 text-xl mb-12">
            Start typing your name to find yourself in the family tree
          </p>

          {/* Input area - white card */}
          <div className="relative">
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-6 sm:p-8">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                onFocus={() => query.trim() && setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                placeholder="Type your name..."
                className="w-full text-2xl sm:text-3xl font-light text-warm-800 bg-transparent border-b-2 border-warm-200 focus:border-primary-500 outline-none pb-3 placeholder-warm-300 transition-colors"
                autoComplete="off"
                spellCheck={false}
              />

              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="mt-4 rounded-xl border border-warm-100 overflow-hidden"
                >
                  {suggestions.map((person, index) => (
                    <button
                      key={person.id}
                      onClick={() => handleSelectPerson(person)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`w-full text-left px-5 py-4 flex items-center gap-4 transition-all ${
                        index === highlightedIndex
                          ? 'bg-gradient-to-r from-primary-50 to-accent-50'
                          : 'hover:bg-warm-50'
                      }`}
                    >
                      {/* Avatar */}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0 shadow-md ${
                        person.sex === 'M'
                          ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                          : person.sex === 'F'
                          ? 'bg-gradient-to-br from-rose-400 to-pink-500 text-white'
                          : 'bg-gradient-to-br from-warm-400 to-warm-500 text-white'
                      }`}>
                        {person.name.given.charAt(0)}
                      </div>

                      {/* Name info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-warm-800 text-lg truncate">
                          {person.name.full}
                        </div>
                        {person.name.nickname && (
                          <div className="text-warm-500 text-sm truncate">
                            "{person.name.nickname}"
                          </div>
                        )}
                      </div>

                      {/* Arrow indicator when highlighted */}
                      {index === highlightedIndex && (
                        <svg
                          className="w-6 h-6 text-primary-500 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* No results message */}
              {showSuggestions && query.trim() && suggestions.length === 0 && (
                <div className="mt-4 p-6 text-center bg-warm-50 rounded-xl">
                  <div className="text-warm-600 font-medium mb-1">
                    No one found with that name
                  </div>
                  <div className="text-warm-400 text-sm">
                    Make sure you're in the family tree, or try a different spelling
                  </div>
                </div>
              )}

              {/* Continue button - shows when a person is selected */}
              {selectedPerson && (
                <div className="mt-6 animate-fade-in">
                  <button
                    onClick={handleContinue}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:from-primary-600 hover:to-primary-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  >
                    Continue as {selectedPerson.name.given}
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="relative p-6 text-center">
        <p className="text-white/60 text-sm">
          Press <kbd className="px-2 py-1 bg-white/20 rounded text-white font-mono text-xs">Enter</kbd> to select
        </p>
      </div>

      {/* Custom animation styles */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
