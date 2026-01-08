'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo, useEffect } from 'react';
import type { FamilyTreeData, Individual, Family } from '@/lib/types';
import { RelationshipCalculator, createRelationshipCalculator } from '@/lib/relationships/calculator';

// Default empty data
const emptyData: FamilyTreeData = {
  meta: { version: '1.0', exportDate: '', source: '', totalIndividuals: 0, totalFamilies: 0 },
  individuals: {},
  families: {},
  indexes: { byLastName: {}, deceased: [], rootPerson: '' }
};

type RelationType = 'parent' | 'child' | 'spouse' | 'sibling';

interface FamilyTreeContextType {
  data: FamilyTreeData;
  isLoading: boolean;
  rootPersonId: string;
  setRootPersonId: (id: string) => void;
  getIndividual: (id: string) => Individual | undefined;
  getFamily: (id: string) => Family | undefined;
  getRelationship: (fromId: string, toId: string) => string;
  getAllIndividuals: () => Individual[];
  searchIndividuals: (query: string) => Individual[];
  calculator: RelationshipCalculator | null;
  updateIndividual: (id: string, updates: Partial<Individual>) => void;
  addIndividual: (individual: Individual) => void;
  updateFamily: (id: string, updates: Partial<Family>) => void;
  addFamily: (family: Family) => void;
  linkRelationship: (personId: string, relatedPersonId: string, relationType: RelationType) => void;
  findRelationshipPath: (fromId: string, toId: string) => string[];
  exportData: () => string;
}

const FamilyTreeContext = createContext<FamilyTreeContextType | null>(null);

export function FamilyTreeProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FamilyTreeData>(emptyData);
  const [isLoading, setIsLoading] = useState(true);
  const [rootPersonId, setRootPersonId] = useState<string>('I500001');

  // Load data from public folder
  useEffect(() => {
    // Use basePath for GitHub Pages deployment
    const basePath = process.env.NODE_ENV === 'production' ? '/family-tree' : '';
    fetch(`${basePath}/family-tree.json`)
      .then(res => res.json())
      .then((loadedData: FamilyTreeData) => {
        setData(loadedData);
        if (loadedData.indexes.rootPerson) {
          setRootPersonId(loadedData.indexes.rootPerson);
        }
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load family tree data:', err);
        setIsLoading(false);
      });
  }, []);

  const calculator = useMemo(() => {
    if (Object.keys(data.individuals).length === 0) return null;
    return createRelationshipCalculator(data);
  }, [data]);

  const getIndividual = useCallback((id: string) => {
    return data.individuals[id];
  }, [data]);

  const getFamily = useCallback((id: string) => {
    return data.families[id];
  }, [data]);

  const getRelationship = useCallback((fromId: string, toId: string) => {
    if (!calculator) return 'Unknown';
    const result = calculator.findRelationship(fromId, toId);
    return result.label;
  }, [calculator]);

  const getAllIndividuals = useCallback(() => {
    return Object.values(data.individuals);
  }, [data]);

  const searchIndividuals = useCallback((query: string) => {
    const lowerQuery = query.toLowerCase();
    return Object.values(data.individuals).filter(person =>
      person.name.full.toLowerCase().includes(lowerQuery) ||
      person.name.given.toLowerCase().includes(lowerQuery) ||
      person.name.surname.toLowerCase().includes(lowerQuery)
    );
  }, [data]);

  const updateIndividual = useCallback((id: string, updates: Partial<Individual>) => {
    setData(prev => ({
      ...prev,
      individuals: {
        ...prev.individuals,
        [id]: { ...prev.individuals[id], ...updates }
      }
    }));
  }, []);

  const addIndividual = useCallback((individual: Individual) => {
    setData(prev => ({
      ...prev,
      individuals: {
        ...prev.individuals,
        [individual.id]: individual
      },
      meta: {
        ...prev.meta,
        totalIndividuals: prev.meta.totalIndividuals + 1
      }
    }));
  }, []);

  const updateFamily = useCallback((id: string, updates: Partial<Family>) => {
    setData(prev => ({
      ...prev,
      families: {
        ...prev.families,
        [id]: { ...prev.families[id], ...updates }
      }
    }));
  }, []);

  const addFamily = useCallback((family: Family) => {
    setData(prev => ({
      ...prev,
      families: {
        ...prev.families,
        [family.id]: family
      },
      meta: {
        ...prev.meta,
        totalFamilies: prev.meta.totalFamilies + 1
      }
    }));
  }, []);

  const exportData = useCallback(() => {
    return JSON.stringify(data, null, 2);
  }, [data]);

  // Link two people with a relationship
  const linkRelationship = useCallback((personId: string, relatedPersonId: string, relationType: RelationType) => {
    setData(prev => {
      const newData = { ...prev };
      const person = newData.individuals[personId];
      const relatedPerson = newData.individuals[relatedPersonId];

      if (!person || !relatedPerson) return prev;

      const generateFamilyId = () => `F${Date.now()}`;

      switch (relationType) {
        case 'spouse': {
          // Create a new family with these two as spouses
          const newFamilyId = generateFamilyId();
          const husband = person.sex === 'M' ? personId : relatedPersonId;
          const wife = person.sex === 'F' ? personId : relatedPersonId;

          newData.families = {
            ...newData.families,
            [newFamilyId]: {
              id: newFamilyId,
              husband: husband,
              wife: wife,
              children: []
            }
          };

          // Update both people's familyAsSpouse
          newData.individuals = {
            ...newData.individuals,
            [personId]: {
              ...newData.individuals[personId],
              familyAsSpouse: [...(newData.individuals[personId].familyAsSpouse || []), newFamilyId]
            },
            [relatedPersonId]: {
              ...newData.individuals[relatedPersonId],
              familyAsSpouse: [...(newData.individuals[relatedPersonId].familyAsSpouse || []), newFamilyId]
            }
          };

          newData.meta = { ...newData.meta, totalFamilies: newData.meta.totalFamilies + 1 };
          break;
        }

        case 'parent': {
          // relatedPerson is parent of person
          // Find or create a family where relatedPerson is a spouse
          let familyId = relatedPerson.familyAsSpouse?.[0];

          if (!familyId) {
            // Create new family with relatedPerson as parent
            familyId = generateFamilyId();
            const isHusband = relatedPerson.sex === 'M';

            newData.families = {
              ...newData.families,
              [familyId]: {
                id: familyId,
                husband: isHusband ? relatedPersonId : undefined,
                wife: isHusband ? undefined : relatedPersonId,
                children: [personId]
              }
            };

            newData.individuals = {
              ...newData.individuals,
              [relatedPersonId]: {
                ...newData.individuals[relatedPersonId],
                familyAsSpouse: [...(newData.individuals[relatedPersonId].familyAsSpouse || []), familyId]
              },
              [personId]: {
                ...newData.individuals[personId],
                familyAsChild: familyId
              }
            };

            newData.meta = { ...newData.meta, totalFamilies: newData.meta.totalFamilies + 1 };
          } else {
            // Add person as child to existing family
            const family = newData.families[familyId];
            newData.families = {
              ...newData.families,
              [familyId]: {
                ...family,
                children: [...family.children, personId]
              }
            };

            newData.individuals = {
              ...newData.individuals,
              [personId]: {
                ...newData.individuals[personId],
                familyAsChild: familyId
              }
            };
          }
          break;
        }

        case 'child': {
          // relatedPerson is child of person
          // Find or create a family where person is a spouse
          let familyId = person.familyAsSpouse?.[0];

          if (!familyId) {
            // Create new family with person as parent
            familyId = generateFamilyId();
            const isHusband = person.sex === 'M';

            newData.families = {
              ...newData.families,
              [familyId]: {
                id: familyId,
                husband: isHusband ? personId : undefined,
                wife: isHusband ? undefined : personId,
                children: [relatedPersonId]
              }
            };

            newData.individuals = {
              ...newData.individuals,
              [personId]: {
                ...newData.individuals[personId],
                familyAsSpouse: [...(newData.individuals[personId].familyAsSpouse || []), familyId]
              },
              [relatedPersonId]: {
                ...newData.individuals[relatedPersonId],
                familyAsChild: familyId
              }
            };

            newData.meta = { ...newData.meta, totalFamilies: newData.meta.totalFamilies + 1 };
          } else {
            // Add relatedPerson as child to existing family
            const family = newData.families[familyId];
            newData.families = {
              ...newData.families,
              [familyId]: {
                ...family,
                children: [...family.children, relatedPersonId]
              }
            };

            newData.individuals = {
              ...newData.individuals,
              [relatedPersonId]: {
                ...newData.individuals[relatedPersonId],
                familyAsChild: familyId
              }
            };
          }
          break;
        }

        case 'sibling': {
          // Make them share the same parent family
          const personParentFamily = person.familyAsChild;
          const relatedParentFamily = relatedPerson.familyAsChild;

          if (personParentFamily && !relatedParentFamily) {
            // Add relatedPerson to person's parent family
            const family = newData.families[personParentFamily];
            newData.families = {
              ...newData.families,
              [personParentFamily]: {
                ...family,
                children: [...family.children, relatedPersonId]
              }
            };
            newData.individuals = {
              ...newData.individuals,
              [relatedPersonId]: {
                ...newData.individuals[relatedPersonId],
                familyAsChild: personParentFamily
              }
            };
          } else if (!personParentFamily && relatedParentFamily) {
            // Add person to relatedPerson's parent family
            const family = newData.families[relatedParentFamily];
            newData.families = {
              ...newData.families,
              [relatedParentFamily]: {
                ...family,
                children: [...family.children, personId]
              }
            };
            newData.individuals = {
              ...newData.individuals,
              [personId]: {
                ...newData.individuals[personId],
                familyAsChild: relatedParentFamily
              }
            };
          } else if (!personParentFamily && !relatedParentFamily) {
            // Create a new family for them both
            const familyId = generateFamilyId();
            newData.families = {
              ...newData.families,
              [familyId]: {
                id: familyId,
                children: [personId, relatedPersonId]
              }
            };
            newData.individuals = {
              ...newData.individuals,
              [personId]: {
                ...newData.individuals[personId],
                familyAsChild: familyId
              },
              [relatedPersonId]: {
                ...newData.individuals[relatedPersonId],
                familyAsChild: familyId
              }
            };
            newData.meta = { ...newData.meta, totalFamilies: newData.meta.totalFamilies + 1 };
          }
          break;
        }
      }

      return newData;
    });
  }, []);

  // Find path between two people (returns array of person IDs)
  const findRelationshipPath = useCallback((fromId: string, toId: string): string[] => {
    if (fromId === toId) return [fromId];

    // BFS to find shortest path
    const visited = new Set<string>();
    const queue: Array<{ id: string; path: string[] }> = [{ id: fromId, path: [fromId] }];

    const getConnectedPeople = (personId: string): string[] => {
      const person = data.individuals[personId];
      if (!person) return [];

      const connected: string[] = [];

      // Parents
      if (person.familyAsChild) {
        const family = data.families[person.familyAsChild];
        if (family) {
          if (family.husband) connected.push(family.husband);
          if (family.wife) connected.push(family.wife);
          // Siblings
          family.children.forEach(childId => {
            if (childId !== personId) connected.push(childId);
          });
        }
      }

      // Spouse and children
      person.familyAsSpouse.forEach(familyId => {
        const family = data.families[familyId];
        if (family) {
          if (family.husband && family.husband !== personId) connected.push(family.husband);
          if (family.wife && family.wife !== personId) connected.push(family.wife);
          family.children.forEach(childId => connected.push(childId));
        }
      });

      return connected;
    };

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;

      if (visited.has(id)) continue;
      visited.add(id);

      const connected = getConnectedPeople(id);

      for (const connectedId of connected) {
        if (connectedId === toId) {
          return [...path, connectedId];
        }
        if (!visited.has(connectedId)) {
          queue.push({ id: connectedId, path: [...path, connectedId] });
        }
      }
    }

    return []; // No path found
  }, [data]);

  return (
    <FamilyTreeContext.Provider value={{
      data,
      isLoading,
      rootPersonId,
      setRootPersonId,
      getIndividual,
      getFamily,
      getRelationship,
      getAllIndividuals,
      searchIndividuals,
      calculator,
      updateIndividual,
      addIndividual,
      updateFamily,
      addFamily,
      linkRelationship,
      findRelationshipPath,
      exportData
    }}>
      {children}
    </FamilyTreeContext.Provider>
  );
}

export function useFamilyTree() {
  const context = useContext(FamilyTreeContext);
  if (!context) {
    throw new Error('useFamilyTree must be used within a FamilyTreeProvider');
  }
  return context;
}
