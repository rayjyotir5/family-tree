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
      <div className="min-h-screen flex items-center justify-center bg-warm-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          <p className="text-warm-500 text-sm">Loading family data...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen flex flex-col transition-opacity duration-300 ${
        isEntering ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ backgroundColor: '#fafaf9' }}
    >
      {/* Main content - centered */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-2xl">
          {/* Question number indicator (typeform style) */}
          <div className="flex items-center gap-2 mb-6">
            <span className="inline-flex items-center justify-center w-6 h-6 bg-primary-500 text-white text-xs font-medium rounded">
              1
            </span>
            <div className="h-px flex-1 bg-warm-200"></div>
          </div>

          {/* Main question */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-light text-warm-800 mb-3 leading-tight">
            Who are you?
          </h1>

          <p className="text-warm-500 text-lg mb-10">
            Start typing your name to find yourself in the family tree
          </p>

          {/* Input area */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => query.trim() && setShowSuggestions(true)}
              onKeyDown={handleKeyDown}
              placeholder="Type your name..."
              className="w-full text-2xl sm:text-3xl font-light text-warm-800 bg-transparent border-b-2 border-warm-300 focus:border-primary-500 outline-none pb-3 placeholder-warm-300 transition-colors"
              autoComplete="off"
              spellCheck={false}
            />

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-warm-200 overflow-hidden z-10"
              >
                {suggestions.map((person, index) => (
                  <button
                    key={person.id}
                    onClick={() => handleSelectPerson(person)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full text-left px-5 py-4 flex items-center gap-4 transition-colors ${
                      index === highlightedIndex
                        ? 'bg-primary-50'
                        : 'hover:bg-warm-50'
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium flex-shrink-0 ${
                      person.sex === 'M'
                        ? 'bg-amber-100 text-amber-700'
                        : person.sex === 'F'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-warm-100 text-warm-700'
                    }`}>
                      {person.name.given.charAt(0)}
                    </div>

                    {/* Name info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-warm-800 text-lg truncate">
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
                        className="w-5 h-5 text-primary-500 flex-shrink-0"
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
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-warm-200 p-6 text-center">
                <div className="text-warm-500 mb-2">
                  No one found with that name
                </div>
                <div className="text-warm-400 text-sm">
                  Make sure you're in the family tree, or try a different spelling
                </div>
              </div>
            )}
          </div>

          {/* Continue button - shows when a person is selected */}
          {selectedPerson && (
            <div className="mt-10 animate-fade-in">
              <button
                onClick={handleContinue}
                className="inline-flex items-center gap-3 bg-primary-500 text-white px-8 py-4 rounded-xl text-lg font-medium hover:bg-primary-600 active:bg-primary-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
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

      {/* Footer hint */}
      <div className="p-6 text-center">
        <p className="text-warm-400 text-sm">
          Press <kbd className="px-2 py-1 bg-warm-100 rounded text-warm-600 font-mono text-xs">Enter</kbd> to select
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
