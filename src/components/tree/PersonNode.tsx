'use client';

import React from 'react';
import type { Individual } from '@/lib/types';

interface PersonNodeProps {
  person: Individual;
  relationship: string;
  isRoot?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function PersonNode({
  person,
  relationship,
  isRoot = false,
  isSelected = false,
  onClick,
  onDoubleClick
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

  return (
    <div
      className={`
        relative p-3 bg-white rounded-xl shadow-sm border-2 cursor-pointer
        transition-all duration-200 hover:shadow-md hover:scale-[1.02]
        w-40 sm:w-44 md:w-48
        ${isRoot ? 'border-primary-400 ring-2 ring-primary-100 shadow-md' : 'border-warm-200'}
        ${isSelected ? 'ring-2 ring-accent-400' : ''}
        ${isDeceased ? 'bg-warm-50' : ''}
      `}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
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
      <p className="text-xs text-warm-400 mt-2 text-right">
        {formatLifespan()}
        {isDeceased && <span className="ml-1 text-warm-400">✝</span>}
      </p>

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
