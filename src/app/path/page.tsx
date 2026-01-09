'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Header } from '@/components/ui/Header';
import { useFamilyTree } from '@/contexts/FamilyTreeContext';
import { PersonNode } from '@/components/tree/PersonNode';

function PersonSearchSelect({
  value,
  onChange,
  label,
  excludeId
}: {
  value: string;
  onChange: (id: string) => void;
  label: string;
  excludeId?: string;
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const { searchIndividuals, getIndividual } = useFamilyTree();

  const results = useMemo(() => {
    if (!search || search.length < 2) return [];
    return searchIndividuals(search)
      .filter(p => p.id !== excludeId)
      .slice(0, 10);
  }, [search, searchIndividuals, excludeId]);

  const selectedPerson = value ? getIndividual(value) : null;

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-warm-700 mb-1.5">{label}</label>
      {selectedPerson ? (
        <div className="flex items-center gap-3 px-4 py-3 border border-warm-300 rounded-xl bg-warm-50">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            selectedPerson.sex === 'M' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
          }`}>
            {selectedPerson.name.given[0]}
          </span>
          <span className="flex-1 text-warm-800 font-medium">{selectedPerson.name.full}</span>
          <button
            onClick={() => onChange('')}
            className="p-1 text-warm-400 hover:text-warm-600 hover:bg-warm-200 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Search by name..."
            className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800 placeholder-warm-400"
          />
          {isOpen && results.length > 0 && (
            <div className="absolute z-10 w-full mt-2 bg-white border border-warm-200 rounded-xl shadow-lg max-h-60 overflow-auto">
              {results.map((person) => (
                <button
                  key={person.id}
                  onClick={() => {
                    onChange(person.id);
                    setSearch('');
                    setIsOpen(false);
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
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getStepRelationship(
  fromId: string,
  toId: string,
  data: ReturnType<typeof useFamilyTree>['data']
): string {
  const from = data.individuals[fromId];
  const to = data.individuals[toId];
  if (!from || !to) return 'Related';

  if (from.familyAsChild) {
    const family = data.families[from.familyAsChild];
    if (family) {
      if (family.husband === toId) return to.sex === 'M' ? 'Father' : 'Parent';
      if (family.wife === toId) return to.sex === 'F' ? 'Mother' : 'Parent';
    }
  }

  for (const familyId of from.familyAsSpouse) {
    const family = data.families[familyId];
    if (family && family.children.includes(toId)) {
      return to.sex === 'M' ? 'Son' : to.sex === 'F' ? 'Daughter' : 'Child';
    }
  }

  if (from.familyAsChild && to.familyAsChild && from.familyAsChild === to.familyAsChild) {
    return to.sex === 'M' ? 'Brother' : to.sex === 'F' ? 'Sister' : 'Sibling';
  }

  for (const familyId of from.familyAsSpouse) {
    const family = data.families[familyId];
    if (family) {
      if (family.husband === toId || family.wife === toId) {
        return to.sex === 'M' ? 'Husband' : to.sex === 'F' ? 'Wife' : 'Spouse';
      }
    }
  }

  return 'Related';
}

function PathView() {
  const searchParams = useSearchParams();
  const { findRelationshipPath, getIndividual, getRelationshipWithChain, rootPersonId, setRootPersonId, isLoading, data } = useFamilyTree();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  useEffect(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    if (fromParam) {
      setFromId(fromParam);
    } else if (rootPersonId && !fromId) {
      setFromId(rootPersonId);
    }

    if (toParam) {
      setToId(toParam);
    }
  }, [searchParams, rootPersonId]);

  const path = useMemo(() => {
    if (!fromId || !toId) return [];
    return findRelationshipPath(fromId, toId);
  }, [fromId, toId, findRelationshipPath]);

  const overallRelationship = useMemo(() => {
    if (!fromId || !toId) return '';
    return getRelationshipWithChain(fromId, toId);
  }, [fromId, toId, getRelationshipWithChain]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-warm-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-warm-600">Loading family tree...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 bg-warm-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold text-warm-800 mb-6">Find Relationship Path</h1>

        {/* Selection Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-warm-200 p-4 sm:p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <PersonSearchSelect
              value={fromId}
              onChange={setFromId}
              label="From Person"
              excludeId={toId}
            />
            <PersonSearchSelect
              value={toId}
              onChange={setToId}
              label="To Person"
              excludeId={fromId}
            />
          </div>

          {fromId && toId && (
            <div className="mt-4 p-4 bg-primary-50 rounded-xl text-center">
              <p className="text-sm text-warm-600">Overall Relationship:</p>
              <p className="text-xl font-bold text-primary-700">{overallRelationship}</p>
            </div>
          )}
        </div>

        {/* Path Display */}
        {path.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-warm-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-warm-800 mb-6">
              Connection Path ({path.length} people)
            </h2>

            <div className="flex flex-col items-center gap-2">
              {path.map((personId, index) => {
                const person = getIndividual(personId);
                if (!person) return null;

                const isStart = index === 0;
                const isEnd = index === path.length - 1;
                const stepRelationship = index > 0
                  ? getStepRelationship(path[index - 1], personId, data)
                  : 'Start';

                return (
                  <React.Fragment key={personId}>
                    {/* Connection Arrow */}
                    {index > 0 && (
                      <div className="flex flex-col items-center text-warm-400">
                        <div className="w-0.5 h-4 bg-warm-300 rounded-full" />
                        <div className="px-3 py-1.5 bg-warm-100 rounded-full text-xs font-medium text-warm-600">
                          {stepRelationship}
                        </div>
                        <div className="w-0.5 h-4 bg-warm-300 rounded-full" />
                        <svg className="w-4 h-4 text-warm-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}

                    {/* Person Node */}
                    <div className={`relative ${isStart || isEnd ? 'ring-2 ring-primary-200 rounded-xl' : ''}`}>
                      {isStart && (
                        <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 text-xs font-semibold text-primary-600 bg-primary-100 px-2.5 py-1 rounded-full">
                          START
                        </div>
                      )}
                      {isEnd && (
                        <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 text-xs font-semibold text-accent-600 bg-accent-100 px-2.5 py-1 rounded-full">
                          END
                        </div>
                      )}
                      <PersonNode
                        person={person}
                        relationship={isStart ? 'Start' : isEnd ? overallRelationship : stepRelationship}
                        isRoot={isStart}
                        isSelected={selectedPersonId === personId}
                        onClick={() => setSelectedPersonId(personId)}
                        onDoubleClick={() => setRootPersonId(personId)}
                      />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            <p className="text-sm text-warm-500 text-center mt-6">
              Double-tap any person to set them as the tree root
            </p>
          </div>
        ) : fromId && toId ? (
          <div className="bg-white rounded-2xl shadow-sm border border-warm-200 p-8 text-center">
            <p className="text-warm-500">No connection found between these two people.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-warm-200 p-8 text-center">
            <p className="text-warm-500">Select two people to see their relationship path.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PathViewFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-warm-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
        <p className="mt-4 text-warm-600">Loading...</p>
      </div>
    </div>
  );
}

export default function PathPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen flex flex-col bg-warm-50">
        <Header />
        <Suspense fallback={<PathViewFallback />}>
          <PathView />
        </Suspense>
      </div>
    </ProtectedRoute>
  );
}
