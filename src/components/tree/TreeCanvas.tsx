'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useFamilyTree } from '@/contexts/FamilyTreeContext';
import { PersonNode } from './PersonNode';
import type { Individual } from '@/lib/types';

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
  const { rootPersonId, setRootPersonId, getRelationshipWithChain, getIndividual, getFamily } = useFamilyTree();
  const [viewMode, setViewMode] = useState<'ancestors' | 'descendants' | 'both'>('both');
  const [maxGenerations, setMaxGenerations] = useState(2);

  const rootPerson = getIndividual(rootPersonId);

  // Build tree structure including aunts/uncles and cousins
  const treeData = useMemo(() => {
    if (!rootPerson) return {
      ancestors: [],
      descendants: [],
      siblings: [],
      spouses: [],
      auntsUncles: [],
      cousins: [],
      niblings: [], // nieces and nephews
      root: null
    };

    const ancestors: TreePerson[][] = [];
    const descendants: TreePerson[][] = [];
    const addedIds = new Set<string>([rootPersonId]);

    // Get ancestors
    const getAncestors = (personId: string, level: number) => {
      if (level > maxGenerations) return;

      const person = getIndividual(personId);
      if (!person?.familyAsChild) return;

      const family = getFamily(person.familyAsChild);
      if (!family) return;

      if (!ancestors[level]) ancestors[level] = [];

      if (family.husband && !addedIds.has(family.husband)) {
        const father = getIndividual(family.husband);
        if (father) {
          addedIds.add(family.husband);
          ancestors[level].push({
            person: father,
            relationship: getRelationshipWithChain(rootPersonId, family.husband),
            level,
            position: ancestors[level].length
          });
          getAncestors(family.husband, level + 1);
        }
      }

      if (family.wife && !addedIds.has(family.wife)) {
        const mother = getIndividual(family.wife);
        if (mother) {
          addedIds.add(family.wife);
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
          if (addedIds.has(childId)) continue;
          const child = getIndividual(childId);
          if (child) {
            addedIds.add(childId);
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
        if (siblingId === rootPersonId || addedIds.has(siblingId)) continue;
        const sibling = getIndividual(siblingId);
        if (sibling) {
          addedIds.add(siblingId);
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
        if (spouseId && !addedIds.has(spouseId)) {
          const spouse = getIndividual(spouseId);
          if (spouse) {
            addedIds.add(spouseId);
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

    // Get aunts and uncles (parents' siblings)
    const getAuntsUncles = (): TreePerson[] => {
      const auntsUncles: TreePerson[] = [];
      if (!rootPerson.familyAsChild) return auntsUncles;

      const myParentFamily = getFamily(rootPerson.familyAsChild);
      if (!myParentFamily) return auntsUncles;

      const parentIds = [myParentFamily.husband, myParentFamily.wife].filter(Boolean) as string[];

      for (const parentId of parentIds) {
        const parent = getIndividual(parentId);
        if (!parent?.familyAsChild) continue;

        const grandparentFamily = getFamily(parent.familyAsChild);
        if (!grandparentFamily) continue;

        for (const siblingOfParentId of grandparentFamily.children) {
          if (siblingOfParentId === parentId || addedIds.has(siblingOfParentId)) continue;
          const auntUncle = getIndividual(siblingOfParentId);
          if (auntUncle) {
            addedIds.add(siblingOfParentId);
            auntsUncles.push({
              person: auntUncle,
              relationship: getRelationshipWithChain(rootPersonId, siblingOfParentId),
              level: 0,
              position: auntsUncles.length
            });

            // Also add their spouses
            for (const familyId of auntUncle.familyAsSpouse) {
              const family = getFamily(familyId);
              if (!family) continue;
              const spouseId = family.husband === siblingOfParentId ? family.wife : family.husband;
              if (spouseId && !addedIds.has(spouseId)) {
                const spouse = getIndividual(spouseId);
                if (spouse) {
                  addedIds.add(spouseId);
                  auntsUncles.push({
                    person: spouse,
                    relationship: getRelationshipWithChain(rootPersonId, spouseId),
                    level: 0,
                    position: auntsUncles.length
                  });
                }
              }
            }
          }
        }
      }

      return auntsUncles;
    };

    // Get cousins (children of aunts and uncles)
    const getCousins = (auntsUncles: TreePerson[]): TreePerson[] => {
      const cousins: TreePerson[] = [];

      for (const auntUncle of auntsUncles) {
        for (const familyId of auntUncle.person.familyAsSpouse) {
          const family = getFamily(familyId);
          if (!family) continue;

          for (const cousinId of family.children) {
            if (addedIds.has(cousinId)) continue;
            const cousin = getIndividual(cousinId);
            if (cousin) {
              addedIds.add(cousinId);
              cousins.push({
                person: cousin,
                relationship: getRelationshipWithChain(rootPersonId, cousinId),
                level: 0,
                position: cousins.length
              });
            }
          }
        }
      }

      return cousins;
    };

    // Get nieces and nephews (siblings' children)
    const getNiblings = (siblings: TreePerson[]): TreePerson[] => {
      const niblings: TreePerson[] = [];

      for (const sibling of siblings) {
        for (const familyId of sibling.person.familyAsSpouse) {
          const family = getFamily(familyId);
          if (!family) continue;

          for (const niblingId of family.children) {
            if (addedIds.has(niblingId)) continue;
            const nibling = getIndividual(niblingId);
            if (nibling) {
              addedIds.add(niblingId);
              niblings.push({
                person: nibling,
                relationship: getRelationshipWithChain(rootPersonId, niblingId),
                level: 0,
                position: niblings.length
              });
            }
          }
        }
      }

      return niblings;
    };

    getAncestors(rootPersonId, 1);
    getDescendants(rootPersonId, 1);
    const siblings = getSiblings();
    const auntsUncles = getAuntsUncles();
    const cousins = getCousins(auntsUncles);
    const niblings = getNiblings(siblings);

    return {
      ancestors,
      descendants,
      siblings,
      spouses: getSpouses(),
      auntsUncles,
      cousins,
      niblings,
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

  const handleViewAs = useCallback((personId: string) => {
    setRootPersonId(personId);
  }, [setRootPersonId]);

  if (!rootPerson) {
    return (
      <div className="flex items-center justify-center h-full text-warm-500">
        <p>No person selected</p>
      </div>
    );
  }

  const hasAncestors = treeData.ancestors.some(level => level.length > 0);
  const hasDescendants = treeData.descendants.some(level => level.length > 0);

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
            onChange={(e) => setMaxGenerations(parseInt(e.target.value) || 2)}
            className="w-14 px-2 py-2 border border-warm-300 rounded-xl text-center focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </label>
      </div>

      {/* Tree View */}
      <div className="flex flex-col items-center gap-6 sm:gap-8">
        {/* Ancestors */}
        {(viewMode === 'ancestors' || viewMode === 'both') && treeData.ancestors.slice().reverse().map((level, reverseIdx) => {
          if (level.length === 0) return null;
          const idx = treeData.ancestors.length - 1 - reverseIdx;
          return (
            <div key={`ancestors-${idx}`} className="w-full">
              <div className="text-xs font-semibold text-accent-600 text-center mb-3 uppercase tracking-wider">
                {idx === 1 ? 'Parents' : idx === 2 ? 'Grandparents' : `${idx} Generations Back`}
              </div>
              <div className="flex flex-wrap gap-3 sm:gap-4 justify-center">
                {level.map((item) => (
                  <PersonNode
                    key={item.person.id}
                    person={item.person}
                    relationship={item.relationship}
                    isSelected={selectedPersonId === item.person.id}
                    onClick={() => handlePersonClick(item.person.id)}
                    onViewAs={() => handleViewAs(item.person.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Connector */}
        {hasAncestors && (viewMode === 'ancestors' || viewMode === 'both') && (
          <div className="w-0.5 h-6 bg-warm-300 rounded-full" />
        )}

        {/* Aunts, Uncles & Cousins Section */}
        {(viewMode === 'ancestors' || viewMode === 'both') && (treeData.auntsUncles.length > 0 || treeData.cousins.length > 0) && (
          <div className="w-full bg-accent-50/50 rounded-2xl p-4 sm:p-6 border border-accent-100">
            {/* Aunts & Uncles */}
            {treeData.auntsUncles.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-accent-600 text-center mb-3 uppercase tracking-wider">
                  Aunts & Uncles
                </div>
                <div className="flex flex-wrap gap-3 sm:gap-4 justify-center">
                  {treeData.auntsUncles.map((item) => (
                    <PersonNode
                      key={item.person.id}
                      person={item.person}
                      relationship={item.relationship}
                      isSelected={selectedPersonId === item.person.id}
                      onClick={() => handlePersonClick(item.person.id)}
                      onViewAs={() => handleViewAs(item.person.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Cousins */}
            {treeData.cousins.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-accent-600 text-center mb-3 uppercase tracking-wider">
                  Cousins
                </div>
                <div className="flex flex-wrap gap-3 sm:gap-4 justify-center">
                  {treeData.cousins.map((item) => (
                    <PersonNode
                      key={item.person.id}
                      person={item.person}
                      relationship={item.relationship}
                      isSelected={selectedPersonId === item.person.id}
                      onClick={() => handlePersonClick(item.person.id)}
                      onViewAs={() => handleViewAs(item.person.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Root Person + Siblings + Spouse */}
        <div className="w-full bg-primary-50/50 rounded-2xl p-4 sm:p-6 border border-primary-100">
          <div className="text-xs font-semibold text-primary-600 text-center mb-3 uppercase tracking-wider">
            You & Siblings
          </div>
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-center">
            {/* Siblings */}
            {treeData.siblings.map((item) => (
              <PersonNode
                key={item.person.id}
                person={item.person}
                relationship={item.relationship}
                isSelected={selectedPersonId === item.person.id}
                onClick={() => handlePersonClick(item.person.id)}
                onViewAs={() => handleViewAs(item.person.id)}
              />
            ))}

            {/* Root */}
            {treeData.root && (
              <PersonNode
                person={treeData.root.person}
                relationship="You"
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
                  onViewAs={() => handleViewAs(item.person.id)}
                />
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Nieces & Nephews */}
        {(viewMode === 'descendants' || viewMode === 'both') && treeData.niblings.length > 0 && (
          <div className="w-full bg-amber-50/50 rounded-2xl p-4 sm:p-6 border border-amber-100">
            <div className="text-xs font-semibold text-amber-600 text-center mb-3 uppercase tracking-wider">
              Nieces & Nephews
            </div>
            <div className="flex flex-wrap gap-3 sm:gap-4 justify-center">
              {treeData.niblings.map((item) => (
                <PersonNode
                  key={item.person.id}
                  person={item.person}
                  relationship={item.relationship}
                  isSelected={selectedPersonId === item.person.id}
                  onClick={() => handlePersonClick(item.person.id)}
                  onViewAs={() => handleViewAs(item.person.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Connector */}
        {hasDescendants && (viewMode === 'descendants' || viewMode === 'both') && (
          <div className="w-0.5 h-6 bg-warm-300 rounded-full" />
        )}

        {/* Descendants */}
        {(viewMode === 'descendants' || viewMode === 'both') && treeData.descendants.map((level, idx) => {
          if (level.length === 0) return null;
          return (
            <div key={`descendants-${idx}`} className="w-full">
              <div className="text-xs font-semibold text-accent-600 text-center mb-3 uppercase tracking-wider">
                {idx === 0 ? 'Children' : idx === 1 ? 'Grandchildren' : `${idx + 1} Generations`}
              </div>
              <div className="flex flex-wrap gap-3 sm:gap-4 justify-center">
                {level.map((item) => (
                  <PersonNode
                    key={item.person.id}
                    person={item.person}
                    relationship={item.relationship}
                    isSelected={selectedPersonId === item.person.id}
                    onClick={() => handlePersonClick(item.person.id)}
                    onViewAs={() => handleViewAs(item.person.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-8 text-center text-sm text-warm-500">
        <p>Tap to view details</p>
      </div>
    </div>
  );
}
