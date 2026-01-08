'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Header } from '@/components/ui/Header';
import { useFamilyTree } from '@/contexts/FamilyTreeContext';
import type { Individual } from '@/lib/types';

function generateId(): string {
  return `I${Date.now()}`;
}

type RelationType = 'parent' | 'child' | 'spouse' | 'sibling';

interface PendingRelationship {
  relatedPersonId: string;
  relationType: RelationType;
}

function PersonSearchSelect({
  onSelect,
  excludeIds = [],
  placeholder = 'Search for a person...'
}: {
  onSelect: (personId: string) => void;
  excludeIds?: string[];
  placeholder?: string;
}) {
  const { searchIndividuals } = useFamilyTree();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const results = query.length > 1
    ? searchIndividuals(query).filter(p => !excludeIds.includes(p.id)).slice(0, 6)
    : [];

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800 placeholder-warm-400"
      />
      {isOpen && results.length > 0 && (
        <ul className="absolute z-10 w-full mt-2 bg-white border border-warm-200 rounded-xl shadow-lg max-h-48 overflow-auto">
          {results.map(person => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(person.id);
                  setQuery('');
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EditPersonClient() {
  const params = useParams();
  const router = useRouter();
  const {
    getIndividual,
    updateIndividual,
    addIndividual,
    linkRelationship,
    getFamily
  } = useFamilyTree();

  const isNew = params.id === 'new';
  const existingPerson = isNew ? null : getIndividual(params.id as string);

  const [formData, setFormData] = useState<Partial<Individual>>({
    id: isNew ? generateId() : (params.id as string),
    name: { full: '', given: '', surname: '' },
    sex: 'U',
    birth: { date: '', dateDisplay: '', place: '' },
    death: undefined,
    contact: { email: '', phone: '' },
    photos: [],
    familyAsSpouse: [],
    familyAsChild: undefined,
    notes: ''
  });

  const [showDeathFields, setShowDeathFields] = useState(false);
  const [pendingRelationships, setPendingRelationships] = useState<PendingRelationship[]>([]);
  const [selectedRelationType, setSelectedRelationType] = useState<RelationType>('parent');

  useEffect(() => {
    if (existingPerson) {
      setFormData(existingPerson);
      setShowDeathFields(!!existingPerson.death);
    }
  }, [existingPerson]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => {
      const fields = field.split('.');
      if (fields.length === 1) {
        return { ...prev, [field]: value };
      }

      const [parent, child] = fields;
      return {
        ...prev,
        [parent]: {
          ...(prev as Record<string, Record<string, string>>)[parent],
          [child]: value
        }
      };
    });
  };

  const handleAddRelationship = (relatedPersonId: string) => {
    if (pendingRelationships.some(r => r.relatedPersonId === relatedPersonId)) {
      return;
    }
    setPendingRelationships(prev => [...prev, { relatedPersonId, relationType: selectedRelationType }]);
  };

  const handleRemoveRelationship = (relatedPersonId: string) => {
    setPendingRelationships(prev => prev.filter(r => r.relatedPersonId !== relatedPersonId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const fullName = `${formData.name?.given || ''} ${formData.name?.surname || ''}`.trim();

    const personData: Individual = {
      id: formData.id || generateId(),
      name: {
        full: fullName,
        given: formData.name?.given || '',
        surname: formData.name?.surname || '',
        maidenName: formData.name?.maidenName,
        nickname: formData.name?.nickname
      },
      sex: (formData.sex as 'M' | 'F' | 'U') || 'U',
      birth: formData.birth?.date ? {
        date: formData.birth.date,
        dateDisplay: formData.birth.dateDisplay || formData.birth.date,
        place: formData.birth.place
      } : undefined,
      death: showDeathFields && formData.death?.date ? {
        date: formData.death.date,
        dateDisplay: formData.death.dateDisplay || formData.death.date,
        place: formData.death.place
      } : undefined,
      contact: (formData.contact?.email || formData.contact?.phone) ? {
        email: formData.contact.email || undefined,
        phone: formData.contact.phone || undefined
      } : undefined,
      photos: formData.photos || [],
      familyAsSpouse: formData.familyAsSpouse || [],
      familyAsChild: formData.familyAsChild,
      notes: formData.notes || undefined
    };

    if (isNew) {
      addIndividual(personData);
    } else {
      updateIndividual(params.id as string, personData);
    }

    const personId = personData.id;
    pendingRelationships.forEach(rel => {
      linkRelationship(personId, rel.relatedPersonId, rel.relationType);
    });

    router.push('/edit');
  };

  const parentFamily = formData.familyAsChild ? getFamily(formData.familyAsChild) : null;
  const father = parentFamily?.husband ? getIndividual(parentFamily.husband) : null;
  const mother = parentFamily?.wife ? getIndividual(parentFamily.wife) : null;

  const existingRelationships: Array<{ person: Individual; relation: string }> = [];

  if (father) existingRelationships.push({ person: father, relation: 'Father' });
  if (mother) existingRelationships.push({ person: mother, relation: 'Mother' });

  if (parentFamily) {
    parentFamily.children.forEach(siblingId => {
      if (siblingId !== formData.id) {
        const sibling = getIndividual(siblingId);
        if (sibling) {
          existingRelationships.push({
            person: sibling,
            relation: sibling.sex === 'M' ? 'Brother' : sibling.sex === 'F' ? 'Sister' : 'Sibling'
          });
        }
      }
    });
  }

  formData.familyAsSpouse?.forEach(familyId => {
    const family = getFamily(familyId);
    if (family) {
      const spouseId = family.husband === formData.id ? family.wife : family.husband;
      if (spouseId) {
        const spouse = getIndividual(spouseId);
        if (spouse) {
          existingRelationships.push({
            person: spouse,
            relation: spouse.sex === 'M' ? 'Husband' : spouse.sex === 'F' ? 'Wife' : 'Spouse'
          });
        }
      }
      family.children.forEach(childId => {
        const child = getIndividual(childId);
        if (child) {
          existingRelationships.push({
            person: child,
            relation: child.sex === 'M' ? 'Son' : child.sex === 'F' ? 'Daughter' : 'Child'
          });
        }
      });
    }
  });

  const excludeIds = [
    formData.id || '',
    ...existingRelationships.map(r => r.person.id),
    ...pendingRelationships.map(r => r.relatedPersonId)
  ].filter(Boolean);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-warm-50">
        <Header />

        <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/edit" className="p-2 text-warm-500 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-warm-800">
              {isNew ? 'Add New Person' : `Edit ${existingPerson?.name.full || 'Person'}`}
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-warm-200 p-4 sm:p-6 space-y-6">
            {/* Basic Info */}
            <div>
              <h2 className="font-semibold text-warm-800 mb-4">Basic Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1.5">
                    Given Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name?.given || ''}
                    onChange={(e) => handleChange('name.given', e.target.value)}
                    className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1.5">
                    Surname *
                  </label>
                  <input
                    type="text"
                    value={formData.name?.surname || ''}
                    onChange={(e) => handleChange('name.surname', e.target.value)}
                    className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1.5">
                    Maiden Name
                  </label>
                  <input
                    type="text"
                    value={formData.name?.maidenName || ''}
                    onChange={(e) => handleChange('name.maidenName', e.target.value)}
                    className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1.5">
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={formData.name?.nickname || ''}
                    onChange={(e) => handleChange('name.nickname', e.target.value)}
                    className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-warm-700 mb-2">
                  Gender
                </label>
                <div className="flex flex-wrap gap-3">
                  {[
                    { value: 'M', label: 'Male', color: 'amber' },
                    { value: 'F', label: 'Female', color: 'rose' },
                    { value: 'U', label: 'Unknown', color: 'warm' }
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`
                        flex items-center gap-2 px-4 py-2.5 border-2 rounded-xl cursor-pointer transition-all
                        ${formData.sex === option.value
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-warm-200 hover:border-warm-300 text-warm-600'}
                      `}
                    >
                      <input
                        type="radio"
                        name="sex"
                        value={option.value}
                        checked={formData.sex === option.value}
                        onChange={(e) => handleChange('sex', e.target.value)}
                        className="sr-only"
                      />
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                        option.value === 'M' ? 'bg-amber-100 text-amber-700' :
                        option.value === 'F' ? 'bg-rose-100 text-rose-700' : 'bg-warm-200 text-warm-600'
                      }`}>
                        {option.value === 'M' ? '♂' : option.value === 'F' ? '♀' : '?'}
                      </span>
                      <span className="font-medium">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Birth */}
            <div className="pt-4 border-t border-warm-100">
              <h2 className="font-semibold text-warm-800 mb-4">Birth</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={formData.birth?.date || ''}
                    onChange={(e) => handleChange('birth.date', e.target.value)}
                    className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1.5">
                    Place
                  </label>
                  <input
                    type="text"
                    value={formData.birth?.place || ''}
                    onChange={(e) => handleChange('birth.place', e.target.value)}
                    className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800"
                    placeholder="City, State, Country"
                  />
                </div>
              </div>
            </div>

            {/* Death */}
            <div className="pt-4 border-t border-warm-100">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDeathFields}
                  onChange={(e) => setShowDeathFields(e.target.checked)}
                  className="w-5 h-5 rounded border-warm-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="font-semibold text-warm-800">Deceased</span>
              </label>

              {showDeathFields && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1.5">
                      Date
                    </label>
                    <input
                      type="date"
                      value={formData.death?.date || ''}
                      onChange={(e) => handleChange('death.date', e.target.value)}
                      className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-warm-700 mb-1.5">
                      Place
                    </label>
                    <input
                      type="text"
                      value={formData.death?.place || ''}
                      onChange={(e) => handleChange('death.place', e.target.value)}
                      className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800"
                      placeholder="City, State, Country"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Contact */}
            <div className="pt-4 border-t border-warm-100">
              <h2 className="font-semibold text-warm-800 mb-4">Contact</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.contact?.email || ''}
                    onChange={(e) => handleChange('contact.email', e.target.value)}
                    className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1.5">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.contact?.phone || ''}
                    onChange={(e) => handleChange('contact.phone', e.target.value)}
                    className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800"
                  />
                </div>
              </div>
            </div>

            {/* Existing Relationships */}
            {existingRelationships.length > 0 && (
              <div className="pt-4 border-t border-warm-100">
                <h2 className="font-semibold text-warm-800 mb-4">Current Relationships</h2>
                <div className="space-y-2">
                  {existingRelationships.map(rel => (
                    <div
                      key={rel.person.id}
                      className="flex items-center gap-3 bg-warm-50 rounded-xl px-4 py-3"
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        rel.person.sex === 'M' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {rel.person.name.given[0]}
                      </span>
                      <span className="flex-1">
                        <strong className="text-warm-800">{rel.person.name.full}</strong>
                        <span className="text-warm-500 ml-2">({rel.relation})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add New Relationships */}
            <div className="pt-4 border-t border-warm-100">
              <h2 className="font-semibold text-warm-800 mb-4">
                {isNew ? 'Link to Family Members' : 'Add New Relationships'}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-warm-700 mb-1.5">
                    Relationship Type
                  </label>
                  <select
                    value={selectedRelationType}
                    onChange={(e) => setSelectedRelationType(e.target.value as RelationType)}
                    className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800 bg-white"
                  >
                    <option value="parent">This person is my PARENT</option>
                    <option value="child">This person is my CHILD</option>
                    <option value="spouse">This person is my SPOUSE</option>
                    <option value="sibling">This person is my SIBLING</option>
                  </select>
                </div>

                <PersonSearchSelect
                  onSelect={handleAddRelationship}
                  excludeIds={excludeIds}
                  placeholder="Search to add a family member..."
                />

                {pendingRelationships.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-warm-500">Relationships to add:</p>
                    {pendingRelationships.map(rel => {
                      const person = getIndividual(rel.relatedPersonId);
                      if (!person) return null;
                      return (
                        <div
                          key={rel.relatedPersonId}
                          className="flex items-center justify-between bg-accent-50 border border-accent-200 rounded-xl px-4 py-3"
                        >
                          <span className="flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                              person.sex === 'M' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                              {person.name.given[0]}
                            </span>
                            <span>
                              <strong className="text-warm-800">{person.name.full}</strong>
                              <span className="text-accent-700 ml-2">
                                ({rel.relationType === 'parent' ? 'Parent' :
                                  rel.relationType === 'child' ? 'Child' :
                                  rel.relationType === 'spouse' ? 'Spouse' : 'Sibling'})
                              </span>
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRelationship(rel.relatedPersonId)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="pt-4 border-t border-warm-100">
              <h2 className="font-semibold text-warm-800 mb-4">Notes</h2>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={4}
                className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-warm-800 resize-none"
                placeholder="Additional notes about this person..."
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-warm-100">
              <Link
                href="/edit"
                className="px-6 py-3 border border-warm-300 text-warm-700 rounded-xl font-medium hover:bg-warm-50 transition-colors text-center"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="px-6 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors"
              >
                {isNew ? 'Add Person' : 'Save Changes'}
              </button>
            </div>
          </form>
        </main>
      </div>
    </ProtectedRoute>
  );
}
