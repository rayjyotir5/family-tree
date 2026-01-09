'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo, useEffect } from 'react';
import type { FamilyTreeData, Individual, Family } from '@/lib/types';
import { RelationshipCalculator, createRelationshipCalculator } from '@/lib/relationships/calculator';
import { supabase } from '@/lib/supabase/client';
import { fetchFamilyTreeData, saveIndividual, saveFamily, saveRootPerson, isSupabaseConfigured } from '@/lib/supabase/queries';

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
  isSaving: boolean;
  saveError: string | null;
  isSupabaseEnabled: boolean;
  rootPersonId: string;
  setRootPersonId: (id: string) => void;
  getIndividual: (id: string) => Individual | undefined;
  getFamily: (id: string) => Family | undefined;
  getRelationship: (fromId: string, toId: string) => string;
  getRelationshipWithChain: (fromId: string, toId: string) => string;
  getAllIndividuals: () => Individual[];
  searchIndividuals: (query: string) => Individual[];
  calculator: RelationshipCalculator | null;
  updateIndividual: (id: string, updates: Partial<Individual>) => void;
  addIndividual: (individual: Individual) => void;
  updateFamily: (id: string, updates: Partial<Family>) => void;
  addFamily: (family: Family) => void;
  linkRelationship: (personId: string, relatedPersonId: string, relationType: RelationType) => void;
  unlinkRelationship: (personId: string, relatedPersonId: string, relationType: RelationType) => void;
  findRelationshipPath: (fromId: string, toId: string) => string[];
  exportData: () => string;
  refreshData: () => Promise<void>;
}

const FamilyTreeContext = createContext<FamilyTreeContextType | null>(null);

export function FamilyTreeProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FamilyTreeData>(emptyData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rootPersonId, setRootPersonIdState] = useState<string>('I500001');
  const isSupabaseEnabled = isSupabaseConfigured();

  // Load data from Supabase
  const loadData = useCallback(async () => {
    if (!isSupabaseEnabled) {
      setIsLoading(false);
      return;
    }

    try {
      const { data: treeData, error } = await fetchFamilyTreeData();

      if (error) {
        console.error('Failed to load family tree data:', error);
        setIsLoading(false);
        return;
      }

      if (treeData) {
        setData(treeData);
        if (treeData.indexes.rootPerson) {
          setRootPersonIdState(treeData.indexes.rootPerson);
        }
      }
    } catch (err) {
      console.error('Failed to load family tree data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isSupabaseEnabled]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Set up real-time subscription for changes
  useEffect(() => {
    if (!isSupabaseEnabled) return;

    const channel = supabase
      .channel('family-tree-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'individuals' },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'families' },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photos' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isSupabaseEnabled, loadData]);

  // Refresh data manually
  const refreshData = useCallback(async () => {
    await loadData();
  }, [loadData]);

  // Set root person (also saves to Supabase)
  const setRootPersonId = useCallback(async (id: string) => {
    setRootPersonIdState(id);
    if (isSupabaseEnabled) {
      await saveRootPerson(id);
    }
  }, [isSupabaseEnabled]);

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

  // Helper function to get the step relation between two adjacent people in the tree
  const getStepRelation = useCallback((fromId: string, toId: string): string => {
    const fromPerson = data.individuals[fromId];
    const toPerson = data.individuals[toId];
    if (!fromPerson || !toPerson) return '';

    const sex = toPerson.sex;

    // Check if toPerson is fromPerson's parent
    if (fromPerson.familyAsChild) {
      const family = data.families[fromPerson.familyAsChild];
      if (family && (family.husband === toId || family.wife === toId)) {
        return sex === 'M' ? 'Father' : sex === 'F' ? 'Mother' : 'Parent';
      }
    }

    // Check if toPerson is fromPerson's child
    for (const familyId of fromPerson.familyAsSpouse) {
      const family = data.families[familyId];
      if (family && family.children.includes(toId)) {
        return sex === 'M' ? 'Son' : sex === 'F' ? 'Daughter' : 'Child';
      }
    }

    // Check if toPerson is fromPerson's spouse
    for (const familyId of fromPerson.familyAsSpouse) {
      const family = data.families[familyId];
      if (family) {
        const spouseId = family.husband === fromId ? family.wife : family.wife === fromId ? family.husband : null;
        if (spouseId === toId) {
          return sex === 'M' ? 'Husband' : sex === 'F' ? 'Wife' : 'Spouse';
        }
      }
    }

    // Check if toPerson is fromPerson's sibling
    if (fromPerson.familyAsChild) {
      const family = data.families[fromPerson.familyAsChild];
      if (family && family.children.includes(toId)) {
        return sex === 'M' ? 'Brother' : sex === 'F' ? 'Sister' : 'Sibling';
      }
    }

    return '';
  }, [data]);

  // Get relationship with chain fallback for unknown relations
  const getRelationshipWithChain = useCallback((fromId: string, toId: string): string => {
    if (!calculator) return 'Unknown';

    const result = calculator.findRelationship(fromId, toId);

    // If the relationship is known, return it
    if (result.relationship.type !== 'unknown') {
      return result.label;
    }

    // Find the shortest path between the two people
    if (fromId === toId) return 'Self';

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

    let path: string[] = [];
    while (queue.length > 0) {
      const { id, path: currentPath } = queue.shift()!;

      if (visited.has(id)) continue;
      visited.add(id);

      const connected = getConnectedPeople(id);

      for (const connectedId of connected) {
        if (connectedId === toId) {
          path = [...currentPath, connectedId];
          break;
        }
        if (!visited.has(connectedId)) {
          queue.push({ id: connectedId, path: [...currentPath, connectedId] });
        }
      }
      if (path.length > 0) break;
    }

    // If no path found, return Unknown
    if (path.length === 0) {
      return 'Unknown Relation';
    }

    // Build the relationship chain
    const chain: string[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const relation = getStepRelation(path[i], path[i + 1]);
      if (relation) {
        chain.push(relation);
      }
    }

    if (chain.length === 0) {
      return 'Unknown Relation';
    }

    // Format as possessive chain: "Father's Brother's Wife"
    return chain.map((rel, idx) => {
      if (idx === chain.length - 1) {
        return rel;
      }
      return rel + "'s";
    }).join(' ');
  }, [calculator, data, getStepRelation]);

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

  const updateIndividual = useCallback(async (id: string, updates: Partial<Individual>) => {
    const updatedIndividual = { ...data.individuals[id], ...updates };

    // Optimistic update
    setData(prev => ({
      ...prev,
      individuals: {
        ...prev.individuals,
        [id]: updatedIndividual
      }
    }));

    // Save to Supabase
    if (isSupabaseEnabled) {
      setIsSaving(true);
      setSaveError(null);
      const { error } = await saveIndividual(updatedIndividual);
      setIsSaving(false);
      if (error) {
        setSaveError(error.message);
      }
    }
  }, [data, isSupabaseEnabled]);

  const addIndividual = useCallback(async (individual: Individual) => {
    // Optimistic update
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

    // Save to Supabase
    if (isSupabaseEnabled) {
      setIsSaving(true);
      setSaveError(null);
      const { error } = await saveIndividual(individual);
      setIsSaving(false);
      if (error) {
        setSaveError(error.message);
      }
    }
  }, [isSupabaseEnabled]);

  const updateFamily = useCallback(async (id: string, updates: Partial<Family>) => {
    const updatedFamily = { ...data.families[id], ...updates };

    // Optimistic update
    setData(prev => ({
      ...prev,
      families: {
        ...prev.families,
        [id]: updatedFamily
      }
    }));

    // Save to Supabase
    if (isSupabaseEnabled) {
      setIsSaving(true);
      setSaveError(null);
      const { error } = await saveFamily(updatedFamily);
      setIsSaving(false);
      if (error) {
        setSaveError(error.message);
      }
    }
  }, [data, isSupabaseEnabled]);

  const addFamily = useCallback(async (family: Family) => {
    // Optimistic update
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

    // Save to Supabase
    if (isSupabaseEnabled) {
      setIsSaving(true);
      setSaveError(null);
      const { error } = await saveFamily(family);
      setIsSaving(false);
      if (error) {
        setSaveError(error.message);
      }
    }
  }, [isSupabaseEnabled]);

  const exportData = useCallback(() => {
    return JSON.stringify(data, null, 2);
  }, [data]);

  // Link two people with a relationship
  const linkRelationship = useCallback(async (personId: string, relatedPersonId: string, relationType: RelationType) => {
    const person = data.individuals[personId];
    const relatedPerson = data.individuals[relatedPersonId];

    if (!person || !relatedPerson) return;

    const generateFamilyId = () => `F${Date.now()}`;

    let newFamily: Family | null = null;
    let updatedPerson: Individual | null = null;
    let updatedRelatedPerson: Individual | null = null;
    let updatedExistingFamily: Family | null = null;

    switch (relationType) {
      case 'spouse': {
        // Create a new family with these two as spouses
        const newFamilyId = generateFamilyId();
        const husband = person.sex === 'M' ? personId : relatedPersonId;
        const wife = person.sex === 'F' ? personId : relatedPersonId;

        newFamily = {
          id: newFamilyId,
          husband: husband,
          wife: wife,
          children: []
        };

        updatedPerson = {
          ...person,
          familyAsSpouse: [...(person.familyAsSpouse || []), newFamilyId]
        };

        updatedRelatedPerson = {
          ...relatedPerson,
          familyAsSpouse: [...(relatedPerson.familyAsSpouse || []), newFamilyId]
        };
        break;
      }

      case 'parent': {
        // relatedPerson is parent of person
        let familyId = relatedPerson.familyAsSpouse?.[0];

        if (!familyId) {
          familyId = generateFamilyId();
          const isHusband = relatedPerson.sex === 'M';

          newFamily = {
            id: familyId,
            husband: isHusband ? relatedPersonId : undefined,
            wife: isHusband ? undefined : relatedPersonId,
            children: [personId]
          };

          updatedRelatedPerson = {
            ...relatedPerson,
            familyAsSpouse: [...(relatedPerson.familyAsSpouse || []), familyId]
          };
        } else {
          const existingFamily = data.families[familyId];
          updatedExistingFamily = {
            ...existingFamily,
            children: [...existingFamily.children, personId]
          };
        }

        updatedPerson = {
          ...person,
          familyAsChild: familyId
        };
        break;
      }

      case 'child': {
        // relatedPerson is child of person
        let familyId = person.familyAsSpouse?.[0];

        if (!familyId) {
          familyId = generateFamilyId();
          const isHusband = person.sex === 'M';

          newFamily = {
            id: familyId,
            husband: isHusband ? personId : undefined,
            wife: isHusband ? undefined : personId,
            children: [relatedPersonId]
          };

          updatedPerson = {
            ...person,
            familyAsSpouse: [...(person.familyAsSpouse || []), familyId]
          };
        } else {
          const existingFamily = data.families[familyId];
          updatedExistingFamily = {
            ...existingFamily,
            children: [...existingFamily.children, relatedPersonId]
          };
        }

        updatedRelatedPerson = {
          ...relatedPerson,
          familyAsChild: familyId
        };
        break;
      }

      case 'sibling': {
        const personParentFamily = person.familyAsChild;
        const relatedParentFamily = relatedPerson.familyAsChild;

        if (personParentFamily && !relatedParentFamily) {
          const existingFamily = data.families[personParentFamily];
          updatedExistingFamily = {
            ...existingFamily,
            children: [...existingFamily.children, relatedPersonId]
          };
          updatedRelatedPerson = {
            ...relatedPerson,
            familyAsChild: personParentFamily
          };
        } else if (!personParentFamily && relatedParentFamily) {
          const existingFamily = data.families[relatedParentFamily];
          updatedExistingFamily = {
            ...existingFamily,
            children: [...existingFamily.children, personId]
          };
          updatedPerson = {
            ...person,
            familyAsChild: relatedParentFamily
          };
        } else if (!personParentFamily && !relatedParentFamily) {
          const familyId = generateFamilyId();
          newFamily = {
            id: familyId,
            children: [personId, relatedPersonId]
          };
          updatedPerson = {
            ...person,
            familyAsChild: familyId
          };
          updatedRelatedPerson = {
            ...relatedPerson,
            familyAsChild: familyId
          };
        }
        break;
      }
    }

    // Apply optimistic updates
    setData(prev => {
      const newData = { ...prev };

      if (newFamily) {
        newData.families = { ...newData.families, [newFamily.id]: newFamily };
        newData.meta = { ...newData.meta, totalFamilies: newData.meta.totalFamilies + 1 };
      }

      if (updatedExistingFamily) {
        newData.families = { ...newData.families, [updatedExistingFamily.id]: updatedExistingFamily };
      }

      if (updatedPerson) {
        newData.individuals = { ...newData.individuals, [updatedPerson.id]: updatedPerson };
      }

      if (updatedRelatedPerson) {
        newData.individuals = { ...newData.individuals, [updatedRelatedPerson.id]: updatedRelatedPerson };
      }

      return newData;
    });

    // Save to Supabase
    if (isSupabaseEnabled) {
      setIsSaving(true);
      setSaveError(null);

      try {
        if (newFamily) {
          await saveFamily(newFamily);
        }
        if (updatedExistingFamily) {
          await saveFamily(updatedExistingFamily);
        }
        if (updatedPerson) {
          await saveIndividual(updatedPerson);
        }
        if (updatedRelatedPerson) {
          await saveIndividual(updatedRelatedPerson);
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save relationship');
      } finally {
        setIsSaving(false);
      }
    }
  }, [data, isSupabaseEnabled]);

  // Unlink a relationship between two people
  const unlinkRelationship = useCallback(async (personId: string, relatedPersonId: string, relationType: RelationType) => {
    const person = data.individuals[personId];
    const relatedPerson = data.individuals[relatedPersonId];

    if (!person || !relatedPerson) return;

    let updatedPerson: Individual | null = null;
    let updatedRelatedPerson: Individual | null = null;
    let updatedFamily: Family | null = null;

    switch (relationType) {
      case 'spouse': {
        // Find the family where they are spouses and remove it
        for (const familyId of person.familyAsSpouse) {
          const family = data.families[familyId];
          if (family) {
            const isSpouseInFamily =
              (family.husband === personId && family.wife === relatedPersonId) ||
              (family.wife === personId && family.husband === relatedPersonId);
            if (isSpouseInFamily) {
              // Remove family reference from both
              updatedPerson = {
                ...person,
                familyAsSpouse: person.familyAsSpouse.filter(fId => fId !== familyId)
              };
              updatedRelatedPerson = {
                ...relatedPerson,
                familyAsSpouse: relatedPerson.familyAsSpouse.filter(fId => fId !== familyId)
              };
              // If family has no children, we could delete it, but for now just clear the spouse
              if (family.children.length === 0) {
                // Family will be orphaned - could delete but leaving for now
              }
              break;
            }
          }
        }
        break;
      }

      case 'parent': {
        // relatedPerson is parent of person - remove person from parent's family
        if (person.familyAsChild) {
          const family = data.families[person.familyAsChild];
          if (family && (family.husband === relatedPersonId || family.wife === relatedPersonId)) {
            // Remove person as child from this family
            updatedFamily = {
              ...family,
              children: family.children.filter(cId => cId !== personId)
            };
            updatedPerson = {
              ...person,
              familyAsChild: undefined
            };
          }
        }
        break;
      }

      case 'child': {
        // relatedPerson is child of person - remove relatedPerson from person's family
        for (const familyId of person.familyAsSpouse) {
          const family = data.families[familyId];
          if (family && family.children.includes(relatedPersonId)) {
            updatedFamily = {
              ...family,
              children: family.children.filter(cId => cId !== relatedPersonId)
            };
            updatedRelatedPerson = {
              ...relatedPerson,
              familyAsChild: undefined
            };
            break;
          }
        }
        break;
      }

      case 'sibling': {
        // Remove relatedPerson from the same parent family
        if (person.familyAsChild && person.familyAsChild === relatedPerson.familyAsChild) {
          const family = data.families[person.familyAsChild];
          if (family) {
            updatedFamily = {
              ...family,
              children: family.children.filter(cId => cId !== relatedPersonId)
            };
            updatedRelatedPerson = {
              ...relatedPerson,
              familyAsChild: undefined
            };
          }
        }
        break;
      }
    }

    // Apply optimistic updates
    setData(prev => {
      const newData = { ...prev };

      if (updatedFamily) {
        newData.families = { ...newData.families, [updatedFamily.id]: updatedFamily };
      }

      if (updatedPerson) {
        newData.individuals = { ...newData.individuals, [updatedPerson.id]: updatedPerson };
      }

      if (updatedRelatedPerson) {
        newData.individuals = { ...newData.individuals, [updatedRelatedPerson.id]: updatedRelatedPerson };
      }

      return newData;
    });

    // Save to Supabase
    if (isSupabaseEnabled) {
      setIsSaving(true);
      setSaveError(null);

      try {
        if (updatedFamily) {
          await saveFamily(updatedFamily);
        }
        if (updatedPerson) {
          await saveIndividual(updatedPerson);
        }
        if (updatedRelatedPerson) {
          await saveIndividual(updatedRelatedPerson);
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to remove relationship');
      } finally {
        setIsSaving(false);
      }
    }
  }, [data, isSupabaseEnabled]);

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
      isSaving,
      saveError,
      isSupabaseEnabled,
      rootPersonId,
      setRootPersonId,
      getIndividual,
      getFamily,
      getRelationship,
      getRelationshipWithChain,
      getAllIndividuals,
      searchIndividuals,
      calculator,
      updateIndividual,
      addIndividual,
      updateFamily,
      addFamily,
      linkRelationship,
      unlinkRelationship,
      findRelationshipPath,
      exportData,
      refreshData
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
