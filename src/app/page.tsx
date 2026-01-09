'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Header } from '@/components/ui/Header';
import { TreeCanvas } from '@/components/tree/TreeCanvas';
import { useFamilyTree } from '@/contexts/FamilyTreeContext';

function PersonDetailPanel({ personId, onClose }: { personId: string; onClose: () => void }) {
  const { getIndividual, getRelationshipWithChain, rootPersonId, setRootPersonId } = useFamilyTree();
  const person = getIndividual(personId);

  if (!person) return null;

  const relationship = getRelationshipWithChain(rootPersonId, personId);
  const primaryPhoto = person.photos.find(p => p.isPrimary) || person.photos[0];

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 md:hidden"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:relative md:z-auto md:w-80 md:flex-shrink-0">
        <div className="bg-white border-t border-warm-200 md:border-t-0 md:border-l md:h-full rounded-t-2xl md:rounded-none shadow-xl md:shadow-none overflow-hidden">
          {/* Mobile handle */}
          <div className="md:hidden flex justify-center py-2">
            <div className="w-12 h-1 bg-warm-300 rounded-full" />
          </div>

          <div className="p-4 max-h-[70vh] md:max-h-full overflow-auto">
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <h2 className="font-bold text-lg text-warm-800">{person.name.full}</h2>
              <button
                onClick={onClose}
                className="p-1 text-warm-400 hover:text-warm-600 hover:bg-warm-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Photo */}
            {primaryPhoto && (
              <img
                src={primaryPhoto.url}
                alt={person.name.full}
                className="w-full h-48 object-cover rounded-xl mb-4"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            )}

            {/* Relationship */}
            <div className="bg-primary-50 text-primary-700 px-4 py-2.5 rounded-xl text-center font-medium mb-4">
              {relationship}
            </div>

            {/* Details */}
            <dl className="space-y-3 text-sm">
              {person.birth && (
                <div className="flex flex-col">
                  <dt className="text-warm-500 text-xs uppercase tracking-wide">Born</dt>
                  <dd className="font-medium text-warm-800">
                    {person.birth.dateDisplay}
                    {person.birth.place && <span className="text-warm-500 block text-sm">{person.birth.place}</span>}
                  </dd>
                </div>
              )}

              {person.death && (
                <div className="flex flex-col">
                  <dt className="text-warm-500 text-xs uppercase tracking-wide">Died</dt>
                  <dd className="font-medium text-warm-800">
                    {person.death.dateDisplay}
                    {person.death.place && <span className="text-warm-500 block text-sm">{person.death.place}</span>}
                  </dd>
                </div>
              )}

              {person.contact?.email && (
                <div className="flex flex-col">
                  <dt className="text-warm-500 text-xs uppercase tracking-wide">Email</dt>
                  <dd className="font-medium text-warm-800 break-all">{person.contact.email}</dd>
                </div>
              )}

              {person.contact?.phone && (
                <div className="flex flex-col">
                  <dt className="text-warm-500 text-xs uppercase tracking-wide">Phone</dt>
                  <dd className="font-medium text-warm-800">{person.contact.phone}</dd>
                </div>
              )}
            </dl>

            {/* Actions */}
            <div className="mt-6 space-y-2">
              <button
                onClick={() => setRootPersonId(personId)}
                className="w-full px-4 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors"
              >
                View from {person.name.given}'s Perspective
              </button>

              {personId !== rootPersonId && (
                <Link
                  href={`/path?from=${rootPersonId}&to=${personId}`}
                  className="block w-full px-4 py-3 bg-accent-500 text-white rounded-xl text-center font-medium hover:bg-accent-600 transition-colors"
                >
                  View Path to {person.name.given}
                </Link>
              )}

              <Link
                href={`/edit/person/${personId}`}
                className="block w-full px-4 py-3 border border-warm-300 text-warm-700 rounded-xl text-center font-medium hover:bg-warm-50 transition-colors"
              >
                Edit Details
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function MainContent() {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const { isLoading } = useFamilyTree();

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
    <div className="flex-1 flex overflow-hidden relative">
      {/* Tree Canvas */}
      <div className="flex-1">
        <TreeCanvas
          onPersonSelect={setSelectedPersonId}
          selectedPersonId={selectedPersonId || undefined}
        />
      </div>

      {/* Side Panel */}
      {selectedPersonId && (
        <PersonDetailPanel
          personId={selectedPersonId}
          onClose={() => setSelectedPersonId(null)}
        />
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen flex flex-col bg-warm-50">
        <Header />
        <MainContent />
      </div>
    </ProtectedRoute>
  );
}
