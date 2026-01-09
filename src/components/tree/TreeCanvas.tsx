'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useFamilyTree } from '@/contexts/FamilyTreeContext';
import { PersonNode } from './PersonNode';
import type { Individual, Family } from '@/lib/types';

interface TreeCanvasProps {
  onPersonSelect?: (personId: string) => void;
  selectedPersonId?: string;
}

interface TreePerson {
  person: Individual;
  relationship: string;
  level: number;
  position: number;
}

export function TreeCanvas({ onPersonSelect, selectedPersonId }: TreeCanvasProps) {
  const { data, rootPersonId, setRootPersonId, getRelationshipWithChain, getIndividual, getFamily } = useFamilyTree();
  const [viewMode, setViewMode] = useState<'ancestors' | 'descendants' | 'both'>('both');
  const [maxGenerations, setMaxGenerations] = useState(3);

  const rootPerson = getIndividual(rootPersonId);

  // Build tree structure
  const treeData = useMemo(() => {
    if (!rootPerson) return { ancestors: [], descendants: [], siblings: [], spouses: [], root: null };

    const ancestors: TreePerson[][] = [];
    const descendants: TreePerson[][] = [];

    // Get ancestors
    const getAncestors = (personId: string, level: number) => {
      if (level > maxGenerations) return;

      const person = getIndividual(personId);
      if (!person?.familyAsChild) return;

      const family = getFamily(person.familyAsChild);
      if (!family) return;

      if (!ancestors[level]) ancestors[level] = [];

      if (family.husband) {
        const father = getIndividual(family.husband);
        if (father) {
          ancestors[level].push({
            person: father,
            relationship: getRelationshipWithChain(rootPersonId, family.husband),
            level,
            position: ancestors[level].length
          });
          getAncestors(family.husband, level + 1);
        }
      }

      if (family.wife) {
        const mother = getIndividual(family.wife);
        if (mother) {
          ancestors[level].push({
            person: mother,
            relationship: getRelationshipWithChain(rootPersonId, family.wife),
            level,
            position: ancestors[level].length
          });
          getAncestors(family.wife, level + 1);
        }
      }
    };

    // Get descendants
    const getDescendants = (personId: string, level: number) => {
      if (level > maxGenerations) return;

      const person = getIndividual(personId);
      if (!person) return;

      for (const familyId of person.familyAsSpouse) {
        const family = getFamily(familyId);
        if (!family) continue;

        if (!descendants[level]) descendants[level] = [];

        for (const childId of family.children) {
          const child = getIndividual(childId);
          if (child) {
            descendants[level].push({
              person: child,
              relationship: getRelationshipWithChain(rootPersonId, childId),
              level,
              position: descendants[level].length
            });
            getDescendants(childId, level + 1);
          }
        }
      }
    };

    // Get siblings
    const getSiblings = (): TreePerson[] => {
      const siblings: TreePerson[] = [];
      if (!rootPerson.familyAsChild) return siblings;

      const family = getFamily(rootPerson.familyAsChild);
      if (!family) return siblings;

      for (const siblingId of family.children) {
        if (siblingId === rootPersonId) continue;
        const sibling = getIndividual(siblingId);
        if (sibling) {
          siblings.push({
            person: sibling,
            relationship: getRelationshipWithChain(rootPersonId, siblingId),
            level: 0,
            position: siblings.length
          });
        }
      }

      return siblings;
    };

    // Get spouse(s)
    const getSpouses = (): TreePerson[] => {
      const spouses: TreePerson[] = [];

      for (const familyId of rootPerson.familyAsSpouse) {
        const family = getFamily(familyId);
        if (!family) continue;

        const spouseId = family.husband === rootPersonId ? family.wife : family.wife === rootPersonId ? family.husband : null;
        if (spouseId) {
          const spouse = getIndividual(spouseId);
          if (spouse) {
            spouses.push({
              person: spouse,
              relationship: getRelationshipWithChain(rootPersonId, spouseId),
              level: 0,
              position: spouses.length
            });
          }
        }
      }

      return spouses;
    };

    getAncestors(rootPersonId, 1);
    getDescendants(rootPersonId, 1);

    return {
      ancestors,
      descendants,
      siblings: getSiblings(),
      spouses: getSpouses(),
      root: {
        person: rootPerson,
        relationship: 'Self',
        level: 0,
        position: 0
      }
    };
  }, [rootPersonId, rootPerson, maxGenerations, getIndividual, getFamily, getRelationshipWithChain]);

  const handlePersonClick = useCallback((personId: string) => {
    onPersonSelect?.(personId);
  }, [onPersonSelect]);

  const handlePersonDoubleClick = useCallback((personId: string) => {
    setRootPersonId(personId);
  }, [setRootPersonId]);

  if (!rootPerson) {
    return (
      <div className="flex items-center justify-center h-full text-warm-500">
        <p>No person selected</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gradient-to-b from-warm-50 to-warm-100 p-4 sm:p-6 lg:p-8">
      {/* Controls */}
      <div className="mb-6 flex flex-wrap gap-3 items-center justify-center">
        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value as 'ancestors' | 'descendants' | 'both')}
          className="px-3 py-2 border border-warm-300 rounded-xl bg-white text-sm text-warm-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="both">Show All</option>
          <option value="ancestors">Ancestors Only</option>
          <option value="descendants">Descendants Only</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-warm-600">
          <span className="hidden sm:inline">Generations:</span>
          <span className="sm:hidden">Gen:</span>
          <input
            type="number"
            min={1}
            max={10}
            value={maxGenerations}
            onChange={(e) => setMaxGenerations(parseInt(e.target.value) || 3)}
            className="w-14 px-2 py-2 border border-warm-300 rounded-xl text-center focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </label>
      </div>

      {/* Tree View */}
      <div className="flex flex-col items-center gap-6 sm:gap-8">
        {/* Ancestors */}
        {(viewMode === 'ancestors' || viewMode === 'both') && treeData.ancestors.slice().reverse().map((level, reverseIdx) => {
          const idx = treeData.ancestors.length - 1 - reverseIdx;
          return (
            <div key={`ancestors-${idx}`} className="flex flex-wrap gap-3 sm:gap-4 justify-center">
              <div className="text-xs font-medium text-accent-600 w-full text-center mb-2 uppercase tracking-wide">
                {idx === 1 ? 'Parents' : idx === 2 ? 'Grandparents' : `${idx} Generations Back`}
              </div>
              {level.map((item) => (
                <PersonNode
                  key={item.person.id}
                  person={item.person}
                  relationship={item.relationship}
                  isSelected={selectedPersonId === item.person.id}
                  onClick={() => handlePersonClick(item.person.id)}
                  onDoubleClick={() => handlePersonDoubleClick(item.person.id)}
                />
              ))}
            </div>
          );
        })}

        {/* Connector */}
        {treeData.ancestors.length > 0 && (viewMode === 'ancestors' || viewMode === 'both') && (
          <div className="w-0.5 h-6 bg-warm-300 rounded-full" />
        )}

        {/* Root Person + Siblings + Spouse */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-center">
          {/* Siblings */}
          {treeData.siblings.map((item) => (
            <PersonNode
              key={item.person.id}
              person={item.person}
              relationship={item.relationship}
              isSelected={selectedPersonId === item.person.id}
              onClick={() => handlePersonClick(item.person.id)}
              onDoubleClick={() => handlePersonDoubleClick(item.person.id)}
            />
          ))}

          {/* Root */}
          {treeData.root && (
            <PersonNode
              person={treeData.root.person}
              relationship="Self"
              isRoot={true}
              isSelected={selectedPersonId === treeData.root.person.id}
              onClick={() => handlePersonClick(treeData.root!.person.id)}
            />
          )}

          {/* Spouses */}
          {treeData.spouses.map((item) => (
            <React.Fragment key={item.person.id}>
              <div className="text-primary-400 text-xl sm:text-2xl">♥</div>
              <PersonNode
                person={item.person}
                relationship={item.relationship}
                isSelected={selectedPersonId === item.person.id}
                onClick={() => handlePersonClick(item.person.id)}
                onDoubleClick={() => handlePersonDoubleClick(item.person.id)}
              />
            </React.Fragment>
          ))}
        </div>

        {/* Connector */}
        {treeData.descendants.length > 0 && (viewMode === 'descendants' || viewMode === 'both') && (
          <div className="w-0.5 h-6 bg-warm-300 rounded-full" />
        )}

        {/* Descendants */}
        {(viewMode === 'descendants' || viewMode === 'both') && treeData.descendants.map((level, idx) => (
          <div key={`descendants-${idx}`} className="flex flex-wrap gap-3 sm:gap-4 justify-center">
            <div className="text-xs font-medium text-accent-600 w-full text-center mb-2 uppercase tracking-wide">
              {idx === 0 ? 'Children' : idx === 1 ? 'Grandchildren' : `${idx + 1} Generations`}
            </div>
            {level.map((item) => (
              <PersonNode
                key={item.person.id}
                person={item.person}
                relationship={item.relationship}
                isSelected={selectedPersonId === item.person.id}
                onClick={() => handlePersonClick(item.person.id)}
                onDoubleClick={() => handlePersonDoubleClick(item.person.id)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-8 text-center text-sm text-warm-500">
        <p>Tap to select &bull; Double-tap to center view</p>
      </div>
    </div>
  );
}
