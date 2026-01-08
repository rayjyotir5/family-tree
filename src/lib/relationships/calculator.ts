import type { FamilyTreeData, Individual, Family, RelationshipType, RelationshipPath } from '../types';

/**
 * Relationship Calculator
 * Finds the relationship between any two people in the family tree
 */
export class RelationshipCalculator {
  private individuals: Record<string, Individual>;
  private families: Record<string, Family>;
  private visitedPairs: Set<string> = new Set();

  constructor(data: FamilyTreeData) {
    this.individuals = data.individuals;
    this.families = data.families;
  }

  /**
   * Find the relationship between two people
   * @param fromId - The "root" person (perspective)
   * @param toId - The person to find relationship to
   * @param skipSpouseCheck - Internal flag to prevent recursion
   */
  findRelationship(fromId: string, toId: string, skipSpouseCheck: boolean = false): RelationshipPath {
    if (fromId === toId) {
      return {
        fromId,
        toId,
        path: [],
        relationship: { type: 'self' },
        label: 'Self'
      };
    }

    // Check for spouse relationship first
    const spouseRelation = this.checkSpouseRelationship(fromId, toId);
    if (spouseRelation) {
      return spouseRelation;
    }

    // Find ancestors of both people with their generation depth
    const fromAncestors = this.findAncestorsWithDepth(fromId);
    const toAncestors = this.findAncestorsWithDepth(toId);

    // Find nearest common ancestor
    const commonAncestor = this.findNearestCommonAncestor(fromAncestors, toAncestors);

    if (commonAncestor) {
      return this.calculateBloodRelationship(fromId, toId, commonAncestor);
    }

    // Check for in-law relationships
    const inLawRelation = this.checkInLawRelationship(fromId, toId);
    if (inLawRelation) {
      return inLawRelation;
    }

    // Check spouse's blood relatives (only if not already checking to prevent infinite recursion)
    if (!skipSpouseCheck) {
      const spouseBloodRelation = this.checkSpouseBloodRelatives(fromId, toId);
      if (spouseBloodRelation) {
        return spouseBloodRelation;
      }
    }

    return {
      fromId,
      toId,
      path: [],
      relationship: { type: 'unknown' },
      label: 'Unknown Relation'
    };
  }

  private checkSpouseRelationship(fromId: string, toId: string): RelationshipPath | null {
    const fromPerson = this.individuals[fromId];
    if (!fromPerson) return null;

    for (const familyId of fromPerson.familyAsSpouse) {
      const family = this.families[familyId];
      if (!family) continue;

      const spouse = family.husband === fromId ? family.wife : family.wife === fromId ? family.husband : null;
      if (spouse === toId) {
        const toPerson = this.individuals[toId];
        return {
          fromId,
          toId,
          path: [{ personId: toId, relation: 'spouse', direction: 'lateral' }],
          relationship: { type: 'spouse' },
          label: toPerson?.sex === 'M' ? 'Husband' : toPerson?.sex === 'F' ? 'Wife' : 'Spouse'
        };
      }
    }

    return null;
  }

  private findAncestorsWithDepth(personId: string): Map<string, number> {
    const ancestors = new Map<string, number>();
    const queue: Array<{ id: string; depth: number }> = [{ id: personId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;

      if (ancestors.has(id)) continue;
      ancestors.set(id, depth);

      const person = this.individuals[id];
      if (!person?.familyAsChild) continue;

      const family = this.families[person.familyAsChild];
      if (!family) continue;

      if (family.husband) queue.push({ id: family.husband, depth: depth + 1 });
      if (family.wife) queue.push({ id: family.wife, depth: depth + 1 });
    }

    return ancestors;
  }

  private findNearestCommonAncestor(
    fromAncestors: Map<string, number>,
    toAncestors: Map<string, number>
  ): { ancestorId: string; fromDepth: number; toDepth: number } | null {
    let nearest: { ancestorId: string; fromDepth: number; toDepth: number } | null = null;
    let minTotalDepth = Infinity;

    for (const [ancestorId, fromDepth] of fromAncestors) {
      const toDepth = toAncestors.get(ancestorId);
      if (toDepth !== undefined) {
        const totalDepth = fromDepth + toDepth;
        if (totalDepth < minTotalDepth) {
          minTotalDepth = totalDepth;
          nearest = { ancestorId, fromDepth, toDepth };
        }
      }
    }

    return nearest;
  }

  private calculateBloodRelationship(
    fromId: string,
    toId: string,
    commonAncestor: { ancestorId: string; fromDepth: number; toDepth: number }
  ): RelationshipPath {
    const { fromDepth, toDepth } = commonAncestor;
    const toPerson = this.individuals[toId];
    const sex = toPerson?.sex || 'U';

    // Direct ancestor (parent, grandparent, etc.)
    if (toDepth === 0 && fromDepth > 0) {
      return this.createAncestorRelation(fromId, toId, fromDepth, sex);
    }

    // Direct descendant (child, grandchild, etc.)
    if (fromDepth === 0 && toDepth > 0) {
      return this.createDescendantRelation(fromId, toId, toDepth, sex);
    }

    // Sibling
    if (fromDepth === 1 && toDepth === 1) {
      const isHalf = this.checkHalfSibling(fromId, toId);
      return {
        fromId,
        toId,
        path: [],
        relationship: { type: 'sibling', half: isHalf },
        label: isHalf
          ? (sex === 'M' ? 'Half-Brother' : sex === 'F' ? 'Half-Sister' : 'Half-Sibling')
          : (sex === 'M' ? 'Brother' : sex === 'F' ? 'Sister' : 'Sibling')
      };
    }

    // Uncle/Aunt (parent's sibling)
    if (fromDepth === 2 && toDepth === 1) {
      return {
        fromId,
        toId,
        path: [],
        relationship: { type: 'uncle-aunt', great: 0 },
        label: sex === 'M' ? 'Uncle' : sex === 'F' ? 'Aunt' : 'Uncle/Aunt'
      };
    }

    // Great-uncle/aunt
    if (fromDepth > 2 && toDepth === 1) {
      const greatCount = fromDepth - 2;
      const prefix = 'Great-'.repeat(greatCount);
      return {
        fromId,
        toId,
        path: [],
        relationship: { type: 'uncle-aunt', great: greatCount },
        label: sex === 'M' ? `${prefix}Uncle` : sex === 'F' ? `${prefix}Aunt` : `${prefix}Uncle/Aunt`
      };
    }

    // Nephew/Niece (sibling's child)
    if (fromDepth === 1 && toDepth === 2) {
      return {
        fromId,
        toId,
        path: [],
        relationship: { type: 'nephew-niece', great: 0 },
        label: sex === 'M' ? 'Nephew' : sex === 'F' ? 'Niece' : 'Nephew/Niece'
      };
    }

    // Great-nephew/niece
    if (fromDepth === 1 && toDepth > 2) {
      const greatCount = toDepth - 2;
      const prefix = 'Great-'.repeat(greatCount);
      return {
        fromId,
        toId,
        path: [],
        relationship: { type: 'nephew-niece', great: greatCount },
        label: sex === 'M' ? `${prefix}Nephew` : sex === 'F' ? `${prefix}Niece` : `${prefix}Nephew/Niece`
      };
    }

    // Cousins
    if (fromDepth >= 2 && toDepth >= 2) {
      const degree = Math.min(fromDepth, toDepth) - 1;
      const removed = Math.abs(fromDepth - toDepth);
      return this.createCousinRelation(fromId, toId, degree, removed);
    }

    return {
      fromId,
      toId,
      path: [],
      relationship: { type: 'unknown' },
      label: 'Distant Relative'
    };
  }

  private createAncestorRelation(fromId: string, toId: string, generations: number, sex: 'M' | 'F' | 'U'): RelationshipPath {
    let label: string;

    if (generations === 1) {
      label = sex === 'M' ? 'Father' : sex === 'F' ? 'Mother' : 'Parent';
    } else if (generations === 2) {
      label = sex === 'M' ? 'Grandfather' : sex === 'F' ? 'Grandmother' : 'Grandparent';
    } else {
      const prefix = 'Great-'.repeat(generations - 2);
      label = sex === 'M' ? `${prefix}Grandfather` : sex === 'F' ? `${prefix}Grandmother` : `${prefix}Grandparent`;
    }

    return {
      fromId,
      toId,
      path: [],
      relationship: { type: 'parent', generations, lineage: 'direct' },
      label
    };
  }

  private createDescendantRelation(fromId: string, toId: string, generations: number, sex: 'M' | 'F' | 'U'): RelationshipPath {
    let label: string;

    if (generations === 1) {
      label = sex === 'M' ? 'Son' : sex === 'F' ? 'Daughter' : 'Child';
    } else if (generations === 2) {
      label = sex === 'M' ? 'Grandson' : sex === 'F' ? 'Granddaughter' : 'Grandchild';
    } else {
      const prefix = 'Great-'.repeat(generations - 2);
      label = sex === 'M' ? `${prefix}Grandson` : sex === 'F' ? `${prefix}Granddaughter` : `${prefix}Grandchild`;
    }

    return {
      fromId,
      toId,
      path: [],
      relationship: { type: 'child', generations, lineage: 'direct' },
      label
    };
  }

  private createCousinRelation(fromId: string, toId: string, degree: number, removed: number): RelationshipPath {
    const ordinal = this.getOrdinal(degree);
    const removedSuffix = removed > 0 ? ` ${removed}x Removed` : '';
    const label = `${ordinal} Cousin${removedSuffix}`;

    return {
      fromId,
      toId,
      path: [],
      relationship: { type: 'cousin', degree, removed },
      label
    };
  }

  private getOrdinal(n: number): string {
    const ordinals = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
    return ordinals[n] || `${n}th`;
  }

  private checkHalfSibling(personId1: string, personId2: string): boolean {
    const person1 = this.individuals[personId1];
    const person2 = this.individuals[personId2];

    if (!person1?.familyAsChild || !person2?.familyAsChild) return false;
    if (person1.familyAsChild !== person2.familyAsChild) return true;

    // Same family, check if same parents
    const family = this.families[person1.familyAsChild];
    return !family || !family.husband || !family.wife;
  }

  private checkInLawRelationship(fromId: string, toId: string): RelationshipPath | null {
    // Check if toId is spouse's parent (parent-in-law)
    const fromPerson = this.individuals[fromId];
    if (!fromPerson) return null;

    for (const familyId of fromPerson.familyAsSpouse) {
      const family = this.families[familyId];
      if (!family) continue;

      const spouseId = family.husband === fromId ? family.wife : family.wife === fromId ? family.husband : null;
      if (!spouseId) continue;

      const spouse = this.individuals[spouseId];
      if (!spouse?.familyAsChild) continue;

      const spouseParentFamily = this.families[spouse.familyAsChild];
      if (!spouseParentFamily) continue;

      const toPerson = this.individuals[toId];
      if (!toPerson) continue;

      // Check if toId is spouse's parent
      if (spouseParentFamily.husband === toId || spouseParentFamily.wife === toId) {
        return {
          fromId,
          toId,
          path: [],
          relationship: {
            type: 'in-law',
            baseRelation: { type: 'parent', generations: 1, lineage: 'direct' }
          },
          label: toPerson.sex === 'M' ? 'Father-in-law' : toPerson.sex === 'F' ? 'Mother-in-law' : 'Parent-in-law'
        };
      }

      // Check if toId is spouse's sibling (sibling-in-law)
      for (const siblingId of spouseParentFamily.children) {
        if (siblingId === toId && siblingId !== spouseId) {
          return {
            fromId,
            toId,
            path: [],
            relationship: {
              type: 'in-law',
              baseRelation: { type: 'sibling', half: false }
            },
            label: toPerson.sex === 'M' ? 'Brother-in-law' : toPerson.sex === 'F' ? 'Sister-in-law' : 'Sibling-in-law'
          };
        }
      }
    }

    // Check if toId is sibling's spouse
    const fromParentFamily = fromPerson.familyAsChild ? this.families[fromPerson.familyAsChild] : null;
    if (fromParentFamily) {
      for (const siblingId of fromParentFamily.children) {
        if (siblingId === fromId) continue;

        const sibling = this.individuals[siblingId];
        if (!sibling) continue;

        for (const siblingFamilyId of sibling.familyAsSpouse) {
          const siblingFamily = this.families[siblingFamilyId];
          if (!siblingFamily) continue;

          const siblingSpouse = siblingFamily.husband === siblingId ? siblingFamily.wife : siblingFamily.wife === siblingId ? siblingFamily.husband : null;
          if (siblingSpouse === toId) {
            const toPerson = this.individuals[toId];
            return {
              fromId,
              toId,
              path: [],
              relationship: {
                type: 'in-law',
                baseRelation: { type: 'sibling', half: false }
              },
              label: toPerson?.sex === 'M' ? 'Brother-in-law' : toPerson?.sex === 'F' ? 'Sister-in-law' : 'Sibling-in-law'
            };
          }
        }
      }
    }

    // Check if toId is child's spouse (child-in-law)
    for (const familyId of fromPerson.familyAsSpouse) {
      const family = this.families[familyId];
      if (!family) continue;

      for (const childId of family.children) {
        const child = this.individuals[childId];
        if (!child) continue;

        for (const childFamilyId of child.familyAsSpouse) {
          const childFamily = this.families[childFamilyId];
          if (!childFamily) continue;

          const childSpouse = childFamily.husband === childId ? childFamily.wife : childFamily.wife === childId ? childFamily.husband : null;
          if (childSpouse === toId) {
            const toPerson = this.individuals[toId];
            return {
              fromId,
              toId,
              path: [],
              relationship: {
                type: 'in-law',
                baseRelation: { type: 'child', generations: 1, lineage: 'direct' }
              },
              label: toPerson?.sex === 'M' ? 'Son-in-law' : toPerson?.sex === 'F' ? 'Daughter-in-law' : 'Child-in-law'
            };
          }
        }
      }
    }

    return null;
  }

  private checkSpouseBloodRelatives(fromId: string, toId: string): RelationshipPath | null {
    const fromPerson = this.individuals[fromId];
    if (!fromPerson) return null;

    // Find spouse
    for (const familyId of fromPerson.familyAsSpouse) {
      const family = this.families[familyId];
      if (!family) continue;

      const spouseId = family.husband === fromId ? family.wife : family.wife === fromId ? family.husband : null;
      if (!spouseId) continue;

      // Find spouse's blood relationship to target (skipSpouseCheck=true to prevent infinite recursion)
      const spouseRelation = this.findRelationship(spouseId, toId, true);
      if (spouseRelation.relationship.type !== 'unknown' && spouseRelation.relationship.type !== 'self') {
        // This is spouse's relative
        return {
          fromId,
          toId,
          path: spouseRelation.path,
          relationship: spouseRelation.relationship,
          label: `Spouse's ${spouseRelation.label}`
        };
      }
    }

    return null;
  }

  /**
   * Get all relationships for a person
   */
  getAllRelationships(personId: string): Array<{ person: Individual; relationship: RelationshipPath }> {
    const relationships: Array<{ person: Individual; relationship: RelationshipPath }> = [];

    for (const [id, person] of Object.entries(this.individuals)) {
      if (id === personId) continue;
      const relationship = this.findRelationship(personId, id);
      if (relationship.relationship.type !== 'unknown') {
        relationships.push({ person, relationship });
      }
    }

    return relationships;
  }
}

export function createRelationshipCalculator(data: FamilyTreeData): RelationshipCalculator {
  return new RelationshipCalculator(data);
}
