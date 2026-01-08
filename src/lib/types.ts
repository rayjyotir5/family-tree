// Core TypeScript types for the Family Tree application

export interface Name {
  full: string;
  given: string;
  surname: string;
  maidenName?: string;
  nickname?: string;
}

export interface DateInfo {
  date: string | null;
  dateDisplay: string;
  place?: string;
  approximate?: boolean;
}

export interface Photo {
  id: string;
  url: string;
  isPrimary: boolean;
  isPortrait: boolean;
  title?: string;
  date?: string;
  place?: string;
}

export interface Individual {
  id: string;
  name: Name;
  sex: 'M' | 'F' | 'U';
  birth?: DateInfo;
  death?: DateInfo;
  contact?: {
    email?: string;
    phone?: string;
  };
  photos: Photo[];
  familyAsSpouse: string[];
  familyAsChild?: string;
  notes?: string;
  customFields?: Record<string, string>;
}

export interface Family {
  id: string;
  husband?: string;
  wife?: string;
  children: string[];
  marriage?: DateInfo;
  divorce?: DateInfo;
  notes?: string;
}

export interface FamilyTreeMeta {
  version: string;
  exportDate: string;
  source: string;
  totalIndividuals: number;
  totalFamilies: number;
}

export interface FamilyTreeIndexes {
  byLastName: Record<string, string[]>;
  deceased: string[];
  rootPerson: string;
}

export interface FamilyTreeData {
  meta: FamilyTreeMeta;
  individuals: Record<string, Individual>;
  families: Record<string, Family>;
  indexes: FamilyTreeIndexes;
}

// Relationship types
export type RelationshipType =
  | { type: 'self' }
  | { type: 'parent'; generations: number; lineage: 'direct' | 'step' }
  | { type: 'child'; generations: number; lineage: 'direct' | 'step' }
  | { type: 'sibling'; half: boolean }
  | { type: 'spouse' }
  | { type: 'uncle-aunt'; great: number }
  | { type: 'nephew-niece'; great: number }
  | { type: 'cousin'; degree: number; removed: number }
  | { type: 'in-law'; baseRelation: Exclude<RelationshipType, { type: 'in-law' }> }
  | { type: 'step'; baseRelation: Exclude<RelationshipType, { type: 'step' }> }
  | { type: 'unknown' };

export interface RelationshipPath {
  fromId: string;
  toId: string;
  path: PathStep[];
  relationship: RelationshipType;
  label: string;
}

export interface PathStep {
  personId: string;
  relation: 'parent' | 'child' | 'spouse' | 'sibling';
  direction: 'up' | 'down' | 'lateral';
}

// Tree layout types
export interface TreeNode {
  personId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  relationshipToRoot: string;
  generation: number;
}

export interface TreeConnection {
  id: string;
  fromId: string;
  toId: string;
  type: 'parent-child' | 'spouse';
  points: Array<{ x: number; y: number }>;
}

export interface TreeLayout {
  nodes: TreeNode[];
  connections: TreeConnection[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}
