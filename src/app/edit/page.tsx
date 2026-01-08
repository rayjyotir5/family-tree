'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Header } from '@/components/ui/Header';
import { useFamilyTree } from '@/contexts/FamilyTreeContext';

export default function EditPage() {
  const { data, getAllIndividuals, searchIndividuals, exportData } = useFamilyTree();
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);

  const individuals = searchQuery.length > 1
    ? searchIndividuals(searchQuery)
    : getAllIndividuals().slice(0, 50);

  const handleExport = () => {
    const jsonData = exportData();
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'family-tree.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-warm-50">
        <Header />

        <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
            <h1 className="text-2xl font-bold text-warm-800">Edit Family Tree</h1>
            <div className="flex gap-2">
              <Link
                href="/edit/person/new"
                className="flex-1 sm:flex-initial px-4 py-2.5 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors text-center"
              >
                + Add Person
              </Link>
              <button
                onClick={() => setShowExportModal(true)}
                className="flex-1 sm:flex-initial px-4 py-2.5 border border-warm-300 text-warm-700 rounded-xl font-medium hover:bg-warm-100 transition-colors"
              >
                Export
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-warm-200">
              <p className="text-2xl sm:text-3xl font-bold text-primary-600">{data.meta.totalIndividuals}</p>
              <p className="text-sm text-warm-500">People</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-warm-200">
              <p className="text-2xl sm:text-3xl font-bold text-accent-600">{data.meta.totalFamilies}</p>
              <p className="text-sm text-warm-500">Families</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-warm-200">
              <p className="text-2xl sm:text-3xl font-bold text-warm-600">{data.indexes.deceased.length}</p>
              <p className="text-sm text-warm-500">Deceased</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-warm-200">
              <p className="text-2xl sm:text-3xl font-bold text-amber-600">
                {Object.keys(data.indexes.byLastName).length}
              </p>
              <p className="text-sm text-warm-500">Surnames</p>
            </div>
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <input
                type="text"
                placeholder="Search people..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 pl-11 bg-white border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800 placeholder-warm-400"
              />
              <svg className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* People List - Desktop Table */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-warm-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-warm-50 border-b border-warm-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-warm-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-warm-500 uppercase tracking-wide">Born</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-warm-500 uppercase tracking-wide">Died</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-warm-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-100">
                {individuals.map((person) => (
                  <tr key={person.id} className="hover:bg-warm-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`
                          w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                          ${person.sex === 'M' ? 'bg-amber-100 text-amber-700' : ''}
                          ${person.sex === 'F' ? 'bg-rose-100 text-rose-700' : ''}
                          ${person.sex === 'U' ? 'bg-warm-200 text-warm-600' : ''}
                        `}>
                          {person.name.given[0]}
                        </span>
                        <span className="font-medium text-warm-800">{person.name.full}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-warm-600">
                      {person.birth?.dateDisplay || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-warm-600">
                      {person.death?.dateDisplay || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/edit/person/${person.id}`}
                        className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {individuals.length === 0 && (
              <p className="text-center py-8 text-warm-500">No results found</p>
            )}

            {!searchQuery && individuals.length === 50 && (
              <p className="text-center py-4 text-sm text-warm-500 border-t border-warm-100">
                Showing first 50 people. Use search to find more.
              </p>
            )}
          </div>

          {/* People List - Mobile Cards */}
          <div className="md:hidden space-y-3">
            {individuals.map((person) => (
              <Link
                key={person.id}
                href={`/edit/person/${person.id}`}
                className="block bg-white rounded-xl shadow-sm border border-warm-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <span className={`
                    w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0
                    ${person.sex === 'M' ? 'bg-amber-100 text-amber-700' : ''}
                    ${person.sex === 'F' ? 'bg-rose-100 text-rose-700' : ''}
                    ${person.sex === 'U' ? 'bg-warm-200 text-warm-600' : ''}
                  `}>
                    {person.name.given[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-warm-800 truncate">{person.name.full}</p>
                    <p className="text-sm text-warm-500">
                      {person.birth?.dateDisplay || 'Unknown'}
                      {person.death && ` - ${person.death.dateDisplay}`}
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-warm-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}

            {individuals.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-warm-200 p-8 text-center">
                <p className="text-warm-500">No results found</p>
              </div>
            )}

            {!searchQuery && individuals.length === 50 && (
              <p className="text-center py-4 text-sm text-warm-500">
                Showing first 50 people. Use search to find more.
              </p>
            )}
          </div>
        </main>

        {/* Export Modal */}
        {showExportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
              <h2 className="text-lg font-bold text-warm-800 mb-4">Export Family Tree</h2>
              <p className="text-warm-600 mb-6">
                Download the family tree data as a JSON file. You can edit this file manually and
                replace the <code className="bg-warm-100 px-1.5 py-0.5 rounded text-sm">family-tree.json</code> file
                to update the tree.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 px-4 py-2.5 border border-warm-300 text-warm-700 rounded-xl font-medium hover:bg-warm-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  className="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors"
                >
                  Download
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
