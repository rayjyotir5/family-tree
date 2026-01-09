/**
 * Migration script to transfer family tree data from JSON to Supabase
 *
 * Usage:
 * 1. Set environment variables in .env.local:
 *    - NEXT_PUBLIC_SUPABASE_URL
 *    - SUPABASE_SERVICE_ROLE_KEY (not the anon key!)
 *
 * 2. Run: npx ts-node --esm scripts/migrate-to-supabase.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing environment variables!');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, serviceRoleKey);

interface JsonData {
  meta: {
    version: string;
    exportDate: string;
    source: string;
    totalIndividuals: number;
    totalFamilies: number;
  };
  individuals: Record<string, {
    id: string;
    name: {
      full: string;
      given: string;
      surname: string;
      maidenName?: string;
      nickname?: string;
    };
    sex: string;
    birth?: {
      date: string | null;
      dateDisplay: string;
      place?: string;
      approximate?: boolean;
    };
    death?: {
      date: string | null;
      dateDisplay: string;
      place?: string;
      approximate?: boolean;
    };
    contact?: {
      email?: string;
      phone?: string;
    };
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
  }>;
  families: Record<string, {
    id: string;
    husband?: string;
    wife?: string;
    children: string[];
    marriage?: {
      date: string | null;
      dateDisplay: string;
      place?: string;
      approximate?: boolean;
    };
    divorce?: {
      date: string | null;
      dateDisplay: string;
      place?: string;
      approximate?: boolean;
    };
    notes?: string;
  }>;
  indexes: {
    byLastName: Record<string, string[]>;
    deceased: string[];
    rootPerson: string;
  };
}

async function migrate() {
  console.log('Starting migration to Supabase...\n');

  // Read existing JSON file
  const jsonPath = path.join(__dirname, '..', 'public', 'family-tree.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
  }

  const data: JsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  console.log(`Found ${Object.keys(data.individuals).length} individuals`);
  console.log(`Found ${Object.keys(data.families).length} families\n`);

  // Helper function to parse dates - handles partial dates like "2005" or "2005-10"
  function parseDate(dateStr: string | null | undefined): string | null {
    if (!dateStr) return null;
    // If it's just a year (4 digits), make it Jan 1st of that year
    if (/^\d{4}$/.test(dateStr)) {
      return `${dateStr}-01-01`;
    }
    // If it's year-month, add day 01
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      return `${dateStr}-01`;
    }
    // If it's a valid full date, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    // Otherwise return null (invalid format)
    return null;
  }

  // Step 1: Insert families first (without spouse references)
  console.log('Step 1: Inserting families...');
  const familiesData = Object.values(data.families).map(family => ({
    id: family.id,
    husband_id: null, // We'll update this later
    wife_id: null,    // We'll update this later
    marriage_date: parseDate(family.marriage?.date),
    marriage_date_display: family.marriage?.dateDisplay || null,
    marriage_place: family.marriage?.place || null,
    divorce_date: parseDate(family.divorce?.date),
    divorce_date_display: family.divorce?.dateDisplay || null,
    divorce_place: family.divorce?.place || null,
    notes: family.notes || null,
  }));

  const { error: familiesError } = await supabase
    .from('families')
    .upsert(familiesData, { onConflict: 'id' });

  if (familiesError) {
    console.error('Error inserting families:', familiesError);
    process.exit(1);
  }
  console.log(`  Inserted ${familiesData.length} families\n`);

  // Step 2: Insert individuals
  console.log('Step 2: Inserting individuals...');
  const individualsData = Object.values(data.individuals).map(person => ({
    id: person.id,
    given_name: person.name.given,
    surname: person.name.surname,
    maiden_name: person.name.maidenName || null,
    nickname: person.name.nickname || null,
    sex: person.sex || 'U',
    birth_date: parseDate(person.birth?.date),
    birth_date_display: person.birth?.dateDisplay || null,
    birth_place: person.birth?.place || null,
    death_date: parseDate(person.death?.date),
    death_date_display: person.death?.dateDisplay || null,
    death_place: person.death?.place || null,
    email: person.contact?.email || null,
    phone: person.contact?.phone || null,
    notes: person.notes || null,
    custom_fields: person.customFields || {},
    family_as_child: person.familyAsChild || null,
  }));

  const { error: individualsError } = await supabase
    .from('individuals')
    .upsert(individualsData, { onConflict: 'id' });

  if (individualsError) {
    console.error('Error inserting individuals:', individualsError);
    process.exit(1);
  }
  console.log(`  Inserted ${individualsData.length} individuals\n`);

  // Step 3: Update families with spouse references
  console.log('Step 3: Updating family spouse references...');
  let updatedCount = 0;
  for (const family of Object.values(data.families)) {
    if (family.husband || family.wife) {
      const { error } = await supabase
        .from('families')
        .update({
          husband_id: family.husband || null,
          wife_id: family.wife || null,
        })
        .eq('id', family.id);

      if (error) {
        console.error(`  Error updating family ${family.id}:`, error);
      } else {
        updatedCount++;
      }
    }
  }
  console.log(`  Updated ${updatedCount} families with spouse references\n`);

  // Step 4: Insert spouse family relationships
  console.log('Step 4: Inserting spouse family relationships...');
  const spouseFamilies: { individual_id: string; family_id: string }[] = [];

  for (const person of Object.values(data.individuals)) {
    if (person.familyAsSpouse && Array.isArray(person.familyAsSpouse)) {
      for (const familyId of person.familyAsSpouse) {
        spouseFamilies.push({
          individual_id: person.id,
          family_id: familyId,
        });
      }
    }
  }

  if (spouseFamilies.length > 0) {
    const { error: spouseError } = await supabase
      .from('individual_spouse_families')
      .upsert(spouseFamilies, { onConflict: 'individual_id,family_id' });

    if (spouseError) {
      console.error('Error inserting spouse families:', spouseError);
    } else {
      console.log(`  Inserted ${spouseFamilies.length} spouse-family relationships\n`);
    }
  }

  // Step 5: Insert family children
  console.log('Step 5: Inserting family children...');
  const familyChildren: { family_id: string; child_id: string; birth_order: number }[] = [];

  for (const family of Object.values(data.families)) {
    if (family.children && Array.isArray(family.children)) {
      family.children.forEach((childId, index) => {
        familyChildren.push({
          family_id: family.id,
          child_id: childId,
          birth_order: index,
        });
      });
    }
  }

  if (familyChildren.length > 0) {
    const { error: childrenError } = await supabase
      .from('family_children')
      .upsert(familyChildren, { onConflict: 'family_id,child_id' });

    if (childrenError) {
      console.error('Error inserting family children:', childrenError);
    } else {
      console.log(`  Inserted ${familyChildren.length} child relationships\n`);
    }
  }

  // Step 6: Insert photos
  console.log('Step 6: Inserting photos...');
  const photos: Array<{
    id: string;
    individual_id: string;
    url: string;
    storage_path: string | null;
    is_primary: boolean;
    is_portrait: boolean;
    title: string | null;
    photo_date: string | null;
    place: string | null;
  }> = [];

  for (const person of Object.values(data.individuals)) {
    if (person.photos && Array.isArray(person.photos)) {
      for (const photo of person.photos) {
        photos.push({
          id: photo.id,
          individual_id: person.id,
          url: photo.url,
          storage_path: null,
          is_primary: photo.isPrimary || false,
          is_portrait: photo.isPortrait || false,
          title: photo.title || null,
          photo_date: photo.date || null,
          place: photo.place || null,
        });
      }
    }
  }

  if (photos.length > 0) {
    const { error: photosError } = await supabase
      .from('photos')
      .upsert(photos, { onConflict: 'id' });

    if (photosError) {
      console.error('Error inserting photos:', photosError);
    } else {
      console.log(`  Inserted ${photos.length} photos\n`);
    }
  }

  // Step 7: Save app settings
  console.log('Step 7: Saving app settings...');
  const settings = [
    { key: 'rootPerson', value: { id: data.indexes.rootPerson } },
    { key: 'meta', value: data.meta },
  ];

  const { error: settingsError } = await supabase
    .from('app_settings')
    .upsert(settings, { onConflict: 'key' });

  if (settingsError) {
    console.error('Error saving settings:', settingsError);
  } else {
    console.log(`  Saved ${settings.length} settings\n`);
  }

  // Summary
  console.log('='.repeat(50));
  console.log('Migration complete!');
  console.log('='.repeat(50));
  console.log(`Individuals: ${individualsData.length}`);
  console.log(`Families: ${familiesData.length}`);
  console.log(`Photos: ${photos.length}`);
  console.log(`Spouse relationships: ${spouseFamilies.length}`);
  console.log(`Child relationships: ${familyChildren.length}`);
  console.log(`Root person: ${data.indexes.rootPerson}`);
}

migrate().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
