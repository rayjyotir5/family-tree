'use client';

import React from 'react';
import type { Individual } from '@/lib/types';

interface PersonNodeProps {
  person: Individual;
  relationship: string;
  isRoot?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  onViewAs?: () => void;
}

export function PersonNode({
  person,
  relationship,
  isRoot = false,
  isSelected = false,
  onClick,
  onViewAs
}: PersonNodeProps) {
  const primaryPhoto = person.photos.find(p => p.isPrimary) || person.photos[0];
  const isDeceased = !!person.death;

  const formatLifespan = () => {
    const birthYear = person.birth?.date?.substring(0, 4);
    const deathYear = person.death?.date?.substring(0, 4);

    if (birthYear && deathYear) return `${birthYear} - ${deathYear}`;
    if (birthYear) return `b. ${birthYear}`;
    return '';
  };

  const handleViewAs = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewAs?.();
  };

  return (
    <div
      className={`
        relative p-3 bg-white rounded-xl shadow-sm border-2 cursor-pointer
        transition-all duration-200 hover:shadow-md hover:scale-[1.02]
        w-40 sm:w-44 md:w-48 group
        ${isRoot ? 'border-primary-400 ring-2 ring-primary-100 shadow-md' : 'border-warm-200 hover:border-warm-300'}
        ${isSelected ? 'ring-2 ring-accent-400' : ''}
        ${isDeceased ? 'bg-warm-50' : ''}
      `}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Photo */}
        <div className="flex-shrink-0">
          {primaryPhoto ? (
            <img
              src={primaryPhoto.url}
              alt={person.name.full}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-warm-200"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div className={`${primaryPhoto ? 'hidden' : ''} w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-lg font-semibold ${
            person.sex === 'M'
              ? 'bg-amber-100 text-amber-700'
              : person.sex === 'F'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-warm-200 text-warm-600'
          }`}>
            {person.name.given[0] || '?'}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-warm-800 text-sm truncate leading-tight">
            {person.name.given}
          </p>
          <p className="text-xs text-warm-500 truncate">
            {person.name.surname}
          </p>
          <p className="text-xs text-primary-600 font-medium mt-1 truncate">
            {relationship}
          </p>
        </div>
      </div>

      {/* Lifespan */}
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-warm-400">
          {formatLifespan()}
          {isDeceased && <span className="ml-1">✝</span>}
        </p>

        {/* Quick View As button - shows on hover (desktop) or always visible (mobile) */}
        {!isRoot && onViewAs && (
          <button
            onClick={handleViewAs}
            className="opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium flex items-center gap-1"
            title={`View as ${person.name.given}`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="hidden sm:inline">View</span>
          </button>
        )}
      </div>

      {/* Gender indicator */}
      <div className={`
        absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium border-2 border-white shadow-sm
        ${person.sex === 'M'
          ? 'bg-amber-100 text-amber-700'
          : person.sex === 'F'
            ? 'bg-rose-100 text-rose-700'
            : 'bg-warm-200 text-warm-600'}
      `}>
        {person.sex === 'M' ? '♂' : person.sex === 'F' ? '♀' : '?'}
      </div>
    </div>
  );
}
