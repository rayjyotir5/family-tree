'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useFamilyTree } from '@/contexts/FamilyTreeContext';

export function Header() {
  const { logout } = useAuth();
  const { rootPersonId, getIndividual, searchIndividuals, setRootPersonId } = useFamilyTree();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const rootPerson = getIndividual(rootPersonId);
  const searchResults = searchQuery.length > 1 ? searchIndividuals(searchQuery).slice(0, 8) : [];

  const navLinks = [
    { href: '/', label: 'Tree' },
    { href: '/path', label: 'Path' },
    { href: '/events', label: 'Events' },
    { href: '/edit', label: 'Edit' },
  ];

  return (
    <header className="bg-white border-b border-warm-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <span className="text-2xl flex-shrink-0">🌳</span>
            <span className="font-bold text-xl text-warm-800 truncate">Family Tree</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-warm-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors font-medium"
              >
                {link.label}
              </Link>
            ))}

            {/* Search Button */}
            <div className="relative ml-2">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="p-2 text-warm-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                aria-label="Search"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              {showSearch && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-warm-200 overflow-hidden">
                  <input
                    type="text"
                    placeholder="Search people..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-3 border-b border-warm-100 focus:outline-none text-warm-800 placeholder-warm-400"
                    autoFocus
                  />
                  {searchResults.length > 0 && (
                    <ul className="max-h-64 overflow-auto">
                      {searchResults.map((person) => (
                        <li key={person.id}>
                          <button
                            onClick={() => {
                              setRootPersonId(person.id);
                              setShowSearch(false);
                              setSearchQuery('');
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-warm-50 flex items-center gap-3 transition-colors"
                          >
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                              person.sex === 'M' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                              {person.name.given[0]}
                            </span>
                            <span className="text-warm-700">{person.name.full}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {searchQuery.length > 1 && searchResults.length === 0 && (
                    <p className="px-4 py-3 text-warm-500 text-sm">No results found</p>
                  )}
                </div>
              )}
            </div>

            {/* Current View Person */}
            {rootPerson && (
              <span className="ml-3 text-sm text-warm-500 bg-warm-100 px-3 py-1.5 rounded-full hidden lg:inline-block">
                Viewing as <strong className="text-warm-700">{rootPerson.name.given}</strong>
              </span>
            )}

            {/* Logout */}
            <button
              onClick={logout}
              className="ml-3 px-4 py-2 text-warm-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors text-sm font-medium"
            >
              Logout
            </button>
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-warm-600 hover:bg-warm-100 rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-2 border-t border-warm-100 pt-4">
            {/* Mobile Search */}
            <div className="mb-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search people..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-3 bg-warm-50 border border-warm-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-warm-800 placeholder-warm-400"
                />
                <svg className="w-5 h-5 absolute right-3 top-1/2 transform -translate-y-1/2 text-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {searchResults.length > 0 && (
                <ul className="mt-2 bg-white rounded-xl border border-warm-200 overflow-hidden max-h-48 overflow-auto">
                  {searchResults.map((person) => (
                    <li key={person.id}>
                      <button
                        onClick={() => {
                          setRootPersonId(person.id);
                          setSearchQuery('');
                          setMobileMenuOpen(false);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-warm-50 flex items-center gap-3"
                      >
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          person.sex === 'M' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {person.name.given[0]}
                        </span>
                        <span className="text-warm-700">{person.name.full}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Current View Person - Mobile */}
            {rootPerson && (
              <div className="mb-4 px-4 py-3 bg-primary-50 rounded-xl text-sm text-primary-700">
                Viewing tree as <strong>{rootPerson.name.full}</strong>
              </div>
            )}

            {/* Nav Links */}
            <nav className="space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-3 text-warm-700 hover:bg-primary-50 hover:text-primary-700 rounded-xl transition-colors font-medium"
                >
                  {link.label}
                </Link>
              ))}
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-3 text-warm-500 hover:bg-warm-100 rounded-xl transition-colors font-medium"
              >
                Logout
              </button>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
