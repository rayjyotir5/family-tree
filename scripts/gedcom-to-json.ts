#!/usr/bin/env ts-node

/**
 * GEDCOM to JSON Converter
 * Parses GEDCOM 5.5.1 files and converts them to a human-readable JSON format
 *
 * Usage: npx ts-node scripts/gedcom-to-json.ts <path-to-gedcom-file>
 */

import * as fs from 'fs';
import * as path from 'path';

interface GedcomLine {
  level: number;
  tag: string;
  xref?: string;
  value?: string;
}

interface ParsedIndividual {
  id: string;
  name: {
    full: string;
    given: string;
    surname: string;
    maidenName?: string;
    nickname?: string;
  };
  sex: 'M' | 'F' | 'U';
  birth?: { date?: string; dateDisplay?: string; place?: string };
  death?: { date?: string; dateDisplay?: string; place?: string };
  contact?: { email?: string; phone?: string };
  photos: Array<{
    id: string;
    url: string;
    isPrimary: boolean;
    isPortrait: boolean;
    title?: string;
    date?: string;
    place?: string;
  }>;
  familyAsSpouse: string[];
  familyAsChild?: string;
  notes?: string;
  customFields?: Record<string, string>;
}

interface ParsedFamily {
  id: string;
  husband?: string;
  wife?: string;
  children: string[];
  marriage?: { date?: string; dateDisplay?: string; place?: string };
  divorce?: { date?: string; dateDisplay?: string; place?: string };
  notes?: string;
}

const MONTH_MAP: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

function parseLine(line: string): GedcomLine | null {
  // Handle BOM and empty lines
  line = line.replace(/^\uFEFF/, '').trim();
  if (!line) return null;

  // GEDCOM line format: LEVEL [XREF] TAG [VALUE]
  // Examples:
  //   0 HEAD
  //   0 @I500001@ INDI
  //   1 NAME John /Doe/
  //   2 DATE 14 OCT 1995

  const xrefMatch = line.match(/^(\d+)\s+(@[^@]+@)\s+(\w+)\s*(.*)?$/);
  if (xrefMatch) {
    const [, levelStr, xref, tag, value] = xrefMatch;
    return {
      level: parseInt(levelStr, 10),
      xref: xref.replace(/@/g, ''),
      tag: tag.toUpperCase(),
      value: value?.trim() || undefined
    };
  }

  const normalMatch = line.match(/^(\d+)\s+(\w+)\s*(.*)?$/);
  if (normalMatch) {
    const [, levelStr, tag, value] = normalMatch;
    return {
      level: parseInt(levelStr, 10),
      tag: tag.toUpperCase(),
      value: value?.trim() || undefined
    };
  }

  return null;
}

function normalizeDate(gedcomDate: string): { date: string; dateDisplay: string; approximate?: boolean } {
  const original = gedcomDate.trim();
  let approximate = false;
  let datePart = original;

  // Handle approximate dates
  if (datePart.startsWith('ABT') || datePart.startsWith('ABOUT')) {
    approximate = true;
    datePart = datePart.replace(/^(ABT|ABOUT)\s*/i, '');
  }
  if (datePart.startsWith('BEF') || datePart.startsWith('BEFORE')) {
    approximate = true;
    datePart = datePart.replace(/^(BEF|BEFORE)\s*/i, '');
  }
  if (datePart.startsWith('AFT') || datePart.startsWith('AFTER')) {
    approximate = true;
    datePart = datePart.replace(/^(AFT|AFTER)\s*/i, '');
  }
  if (datePart.startsWith('EST') || datePart.startsWith('ESTIMATED')) {
    approximate = true;
    datePart = datePart.replace(/^(EST|ESTIMATED)\s*/i, '');
  }

  // Full date: "14 OCT 1995"
  const fullMatch = datePart.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (fullMatch) {
    const [, day, month, year] = fullMatch;
    const monthNum = MONTH_MAP[month.toUpperCase()] || '01';
    return {
      date: `${year}-${monthNum}-${day.padStart(2, '0')}`,
      dateDisplay: original,
      approximate
    };
  }

  // Month and year: "OCT 1995"
  const monthYearMatch = datePart.match(/(\w{3})\s+(\d{4})/);
  if (monthYearMatch) {
    const [, month, year] = monthYearMatch;
    const monthNum = MONTH_MAP[month.toUpperCase()] || '01';
    return {
      date: `${year}-${monthNum}`,
      dateDisplay: original,
      approximate
    };
  }

  // Year only: "1995"
  const yearMatch = datePart.match(/(\d{4})/);
  if (yearMatch) {
    return {
      date: yearMatch[1],
      dateDisplay: original,
      approximate
    };
  }

  // Return original if can't parse
  return {
    date: original,
    dateDisplay: original,
    approximate
  };
}

function parseEvent(lines: GedcomLine[], startIndex: number): {
  date?: string;
  dateDisplay?: string;
  place?: string;
  approximate?: boolean;
} {
  const event: { date?: string; dateDisplay?: string; place?: string; approximate?: boolean } = {};
  const startLevel = lines[startIndex].level;
  let i = startIndex + 1;

  while (i < lines.length && lines[i].level > startLevel) {
    const line = lines[i];
    if (line.tag === 'DATE' && line.value) {
      const normalized = normalizeDate(line.value);
      event.date = normalized.date;
      event.dateDisplay = normalized.dateDisplay;
      event.approximate = normalized.approximate;
    }
    if (line.tag === 'PLAC' && line.value) {
      event.place = line.value;
    }
    i++;
  }

  return Object.keys(event).length > 0 ? event : {};
}

function parsePhoto(lines: GedcomLine[], startIndex: number, photoCounter: { count: number }): {
  id: string;
  url: string;
  isPrimary: boolean;
  isPortrait: boolean;
  title?: string;
  date?: string;
  place?: string;
} | null {
  let url = '';
  let isPrimary = false;
  let isPortrait = false;
  let title: string | undefined;
  let date: string | undefined;
  let place: string | undefined;
  let photoRin: string | undefined;

  const startLevel = lines[startIndex].level;
  let i = startIndex + 1;

  while (i < lines.length && lines[i].level > startLevel) {
    const line = lines[i];
    if (line.tag === 'FILE' && line.value) url = line.value;
    if (line.tag === '_PRIM' && line.value === 'Y') isPrimary = true;
    if (line.tag === '_PERSONALPHOTO' && line.value === 'Y') isPortrait = true;
    if (line.tag === 'TITL' && line.value) title = line.value;
    if (line.tag === '_DATE' && line.value) date = line.value;
    if (line.tag === '_PLACE' && line.value) place = line.value;
    if (line.tag === '_PHOTO_RIN' && line.value) photoRin = line.value.replace('MH:', '');
    i++;
  }

  if (!url) return null;

  return {
    id: photoRin || `P${++photoCounter.count}`,
    url,
    isPrimary,
    isPortrait,
    title,
    date,
    place
  };
}

function parseIndividual(lines: GedcomLine[], startIndex: number, photoCounter: { count: number }): {
  individual: ParsedIndividual;
  nextIndex: number;
} {
  const startLine = lines[startIndex];
  const id = startLine.xref!;

  const individual: ParsedIndividual = {
    id,
    name: { full: '', given: '', surname: '' },
    sex: 'U',
    photos: [],
    familyAsSpouse: []
  };

  let i = startIndex + 1;
  while (i < lines.length && lines[i].level !== 0) {
    const line = lines[i];

    switch (line.tag) {
      case 'NAME':
        // Parse name value like "John /Doe/"
        if (line.value) {
          individual.name.full = line.value.replace(/\//g, '').trim();
          const surnameMatch = line.value.match(/\/([^/]+)\//);
          if (surnameMatch) {
            individual.name.surname = surnameMatch[1];
            individual.name.full = line.value.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
          }
        }
        // Parse sub-tags
        i++;
        while (i < lines.length && lines[i].level > 1) {
          if (lines[i].tag === 'GIVN' && lines[i].value) {
            individual.name.given = lines[i].value!;
          }
          if (lines[i].tag === 'SURN' && lines[i].value) {
            individual.name.surname = lines[i].value!;
          }
          if (lines[i].tag === '_MARNM' && lines[i].value) {
            individual.name.maidenName = lines[i].value!;
          }
          if (lines[i].tag === 'NICK' && lines[i].value) {
            individual.name.nickname = lines[i].value!;
          }
          i++;
        }
        continue;

      case 'SEX':
        individual.sex = (line.value as 'M' | 'F' | 'U') || 'U';
        break;

      case 'BIRT':
        individual.birth = parseEvent(lines, i);
        break;

      case 'DEAT':
        individual.death = parseEvent(lines, i);
        break;

      case 'RESI':
        // Parse contact info from RESI
        if (!individual.contact) individual.contact = {};
        const resiLevel = line.level;
        i++;
        while (i < lines.length && lines[i].level > resiLevel) {
          if (lines[i].tag === 'EMAIL' && lines[i].value) {
            individual.contact.email = lines[i].value;
          }
          if (lines[i].tag === 'PHON' && lines[i].value) {
            individual.contact.phone = lines[i].value;
          }
          i++;
        }
        continue;

      case 'FAMS':
        if (line.value) {
          individual.familyAsSpouse.push(line.value.replace(/@/g, ''));
        }
        break;

      case 'FAMC':
        if (line.value) {
          individual.familyAsChild = line.value.replace(/@/g, '');
        }
        break;

      case 'NOTE':
        if (line.value) {
          individual.notes = (individual.notes || '') + line.value;
        }
        break;

      case 'OBJE':
        const photo = parsePhoto(lines, i, photoCounter);
        if (photo) {
          individual.photos.push(photo);
        }
        break;
    }

    i++;
  }

  return { individual, nextIndex: i };
}

function parseFamily(lines: GedcomLine[], startIndex: number): {
  family: ParsedFamily;
  nextIndex: number;
} {
  const startLine = lines[startIndex];
  const id = startLine.xref!;

  const family: ParsedFamily = {
    id,
    children: []
  };

  let i = startIndex + 1;
  while (i < lines.length && lines[i].level !== 0) {
    const line = lines[i];

    switch (line.tag) {
      case 'HUSB':
        if (line.value) family.husband = line.value.replace(/@/g, '');
        break;
      case 'WIFE':
        if (line.value) family.wife = line.value.replace(/@/g, '');
        break;
      case 'CHIL':
        if (line.value) family.children.push(line.value.replace(/@/g, ''));
        break;
      case 'MARR':
        family.marriage = parseEvent(lines, i);
        break;
      case 'DIV':
        family.divorce = parseEvent(lines, i);
        break;
      case 'NOTE':
        if (line.value) {
          family.notes = (family.notes || '') + line.value;
        }
        break;
    }

    i++;
  }

  return { family, nextIndex: i };
}

function parseGedcomFile(filePath: string): {
  individuals: ParsedIndividual[];
  families: ParsedFamily[];
} {
  console.log(`Reading file: ${filePath}`);
  const content = fs.readFileSync(filePath, 'utf-8');
  const rawLines = content.split(/\r?\n/);

  console.log(`Parsing ${rawLines.length} lines...`);
  const lines = rawLines.map(parseLine).filter((l): l is GedcomLine => l !== null);
  console.log(`Parsed ${lines.length} valid GEDCOM lines`);

  const individuals: ParsedIndividual[] = [];
  const families: ParsedFamily[] = [];
  const photoCounter = { count: 0 };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.level === 0 && line.xref && line.tag === 'INDI') {
      const { individual, nextIndex } = parseIndividual(lines, i, photoCounter);
      individuals.push(individual);
      i = nextIndex;
    } else if (line.level === 0 && line.xref && line.tag === 'FAM') {
      const { family, nextIndex } = parseFamily(lines, i);
      families.push(family);
      i = nextIndex;
    } else {
      i++;
    }
  }

  return { individuals, families };
}

function buildLastNameIndex(individuals: ParsedIndividual[]): Record<string, string[]> {
  const index: Record<string, string[]> = {};
  for (const ind of individuals) {
    const surname = ind.name.surname || 'Unknown';
    if (!index[surname]) index[surname] = [];
    index[surname].push(ind.id);
  }
  return index;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    // Default to the GEDCOM file in the project
    const defaultPath = path.join(process.cwd(), '5f0ebd_9174105edd5f9z6ln54a60_A.ged');
    if (fs.existsSync(defaultPath)) {
      console.log(`Using default GEDCOM file: ${defaultPath}`);
      process.argv[2] = defaultPath;
      return main();
    }
    console.error('Usage: npx ts-node scripts/gedcom-to-json.ts <path-to-gedcom-file>');
    console.error('Or place your .ged file in the project root directory');
    process.exit(1);
  }

  const resolvedPath = path.resolve(inputPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log('');
  console.log('=== GEDCOM to JSON Converter ===');
  console.log('');

  const { individuals, families } = parseGedcomFile(resolvedPath);

  console.log('');
  console.log(`Found ${individuals.length} individuals`);
  console.log(`Found ${families.length} families`);

  // Build output structure
  const output = {
    meta: {
      version: '1.0',
      exportDate: new Date().toISOString().split('T')[0],
      source: 'GEDCOM Import',
      totalIndividuals: individuals.length,
      totalFamilies: families.length
    },
    individuals: Object.fromEntries(individuals.map(ind => [ind.id, ind])),
    families: Object.fromEntries(families.map(fam => [fam.id, fam])),
    indexes: {
      byLastName: buildLastNameIndex(individuals),
      deceased: individuals.filter(ind => ind.death).map(ind => ind.id),
      rootPerson: individuals[0]?.id || ''
    }
  };

  // Write output
  const outputDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'family-tree.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log('');
  console.log(`Output written to: ${outputPath}`);
  console.log('');
  console.log('Sample individuals:');
  individuals.slice(0, 3).forEach(ind => {
    console.log(`  - ${ind.name.full} (${ind.id})`);
  });
  console.log('');
  console.log('Done!');
}

main();
