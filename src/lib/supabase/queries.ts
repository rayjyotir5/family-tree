import { supabase } from './client';
import type { Individual, Family, Photo, FamilyTreeData, FamilyTreeMeta, FamilyTreeIndexes } from '@/lib/types';

// Database row types
interface DbIndividual {
  id: string;
  given_name: string;
  surname: string;
  maiden_name: string | null;
  nickname: string | null;
  sex: string;
  birth_date: string | null;
  birth_date_display: string | null;
  birth_place: string | null;
  death_date: string | null;
  death_date_display: string | null;
  death_place: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  custom_fields: Record<string, string> | null;
  family_as_child: string | null;
}

interface DbFamily {
  id: string;
  husband_id: string | null;
  wife_id: string | null;
  marriage_date: string | null;
  marriage_date_display: string | null;
  marriage_place: string | null;
  divorce_date: string | null;
  divorce_date_display: string | null;
  divorce_place: string | null;
  notes: string | null;
}

interface DbPhoto {
  id: string;
  individual_id: string;
  url: string;
  storage_path: string | null;
  is_primary: boolean;
  is_portrait: boolean;
  title: string | null;
  photo_date: string | null;
  place: string | null;
}

interface DbSpouseFamily {
  individual_id: string;
  family_id: string;
}

interface DbFamilyChild {
  family_id: string;
  child_id: string;
  birth_order: number | null;
}

// Transform database individual to app format
function dbToIndividual(
  row: DbIndividual,
  photos: DbPhoto[],
  spouseFamilies: DbSpouseFamily[]
): Individual {
  const individual: Individual = {
    id: row.id,
    name: {
      full: `${row.given_name} ${row.surname}`.trim(),
      given: row.given_name,
      surname: row.surname,
      ...(row.maiden_name && { maidenName: row.maiden_name }),
      ...(row.nickname && { nickname: row.nickname }),
    },
    sex: row.sex as 'M' | 'F' | 'U',
    photos: photos.map(p => ({
      id: p.id,
      url: p.url,
      isPrimary: p.is_primary,
      isPortrait: p.is_portrait,
      ...(p.title && { title: p.title }),
      ...(p.photo_date && { date: p.photo_date }),
      ...(p.place && { place: p.place }),
    })),
    familyAsSpouse: spouseFamilies.map(sf => sf.family_id),
    ...(row.family_as_child && { familyAsChild: row.family_as_child }),
    ...(row.notes && { notes: row.notes }),
    ...(row.custom_fields && Object.keys(row.custom_fields).length > 0 && { customFields: row.custom_fields }),
  };

  // Add birth info if present
  if (row.birth_date_display) {
    individual.birth = {
      date: row.birth_date,
      dateDisplay: row.birth_date_display,
      ...(row.birth_place && { place: row.birth_place }),
    };
  }

  // Add death info if present
  if (row.death_date_display) {
    individual.death = {
      date: row.death_date,
      dateDisplay: row.death_date_display,
      ...(row.death_place && { place: row.death_place }),
    };
  }

  // Add contact if present
  if (row.email || row.phone) {
    individual.contact = {
      ...(row.email && { email: row.email }),
      ...(row.phone && { phone: row.phone }),
    };
  }

  return individual;
}

// Transform database family to app format
function dbToFamily(row: DbFamily, children: DbFamilyChild[]): Family {
  const family: Family = {
    id: row.id,
    ...(row.husband_id && { husband: row.husband_id }),
    ...(row.wife_id && { wife: row.wife_id }),
    children: children
      .sort((a, b) => (a.birth_order ?? 0) - (b.birth_order ?? 0))
      .map(c => c.child_id),
    ...(row.notes && { notes: row.notes }),
  };

  // Add marriage info if present
  if (row.marriage_date_display) {
    family.marriage = {
      date: row.marriage_date,
      dateDisplay: row.marriage_date_display,
      ...(row.marriage_place && { place: row.marriage_place }),
    };
  }

  // Add divorce info if present
  if (row.divorce_date_display) {
    family.divorce = {
      date: row.divorce_date,
      dateDisplay: row.divorce_date_display,
      ...(row.divorce_place && { place: row.divorce_place }),
    };
  }

  return family;
}

// Fetch all family tree data from Supabase
export async function fetchFamilyTreeData(): Promise<{ data: FamilyTreeData | null; error: Error | null }> {
  try {
    // Fetch all data in parallel
    const [
      individualsResult,
      familiesResult,
      photosResult,
      spouseFamiliesResult,
      familyChildrenResult,
      settingsResult,
    ] = await Promise.all([
      supabase.from('individuals').select('*'),
      supabase.from('families').select('*'),
      supabase.from('photos').select('*'),
      supabase.from('individual_spouse_families').select('*'),
      supabase.from('family_children').select('*'),
      supabase.from('app_settings').select('*'),
    ]);

    if (individualsResult.error) throw individualsResult.error;
    if (familiesResult.error) throw familiesResult.error;
    if (photosResult.error) throw photosResult.error;
    if (spouseFamiliesResult.error) throw spouseFamiliesResult.error;
    if (familyChildrenResult.error) throw familyChildrenResult.error;

    const dbIndividuals = individualsResult.data as DbIndividual[];
    const dbFamilies = familiesResult.data as DbFamily[];
    const dbPhotos = photosResult.data as DbPhoto[];
    const dbSpouseFamilies = spouseFamiliesResult.data as DbSpouseFamily[];
    const dbFamilyChildren = familyChildrenResult.data as DbFamilyChild[];
    const settings = settingsResult.data || [];

    // Build individuals record
    const individuals: Record<string, Individual> = {};
    for (const row of dbIndividuals) {
      const photos = dbPhotos.filter(p => p.individual_id === row.id);
      const spouseFamilies = dbSpouseFamilies.filter(sf => sf.individual_id === row.id);
      individuals[row.id] = dbToIndividual(row, photos, spouseFamilies);
    }

    // Build families record
    const families: Record<string, Family> = {};
    for (const row of dbFamilies) {
      const children = dbFamilyChildren.filter(fc => fc.family_id === row.id);
      families[row.id] = dbToFamily(row, children);
    }

    // Build indexes
    const byLastName: Record<string, string[]> = {};
    const deceased: string[] = [];

    for (const individual of Object.values(individuals)) {
      const surname = individual.name.surname || 'Unknown';
      if (!byLastName[surname]) {
        byLastName[surname] = [];
      }
      byLastName[surname].push(individual.id);

      if (individual.death) {
        deceased.push(individual.id);
      }
    }

    // Get root person from settings
    const rootPersonSetting = settings.find((s: { key: string }) => s.key === 'rootPerson');
    const rootPerson = rootPersonSetting?.value?.id || Object.keys(individuals)[0] || '';

    const indexes: FamilyTreeIndexes = {
      byLastName,
      deceased,
      rootPerson,
    };

    // Build meta
    const meta: FamilyTreeMeta = {
      version: '1.0',
      exportDate: new Date().toISOString().split('T')[0],
      source: 'Supabase',
      totalIndividuals: Object.keys(individuals).length,
      totalFamilies: Object.keys(families).length,
    };

    return {
      data: { meta, individuals, families, indexes },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching family tree data:', error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Failed to fetch data'),
    };
  }
}

// Save an individual to Supabase
export async function saveIndividual(individual: Individual): Promise<{ error: Error | null }> {
  try {
    // Upsert the individual
    const { error: individualError } = await supabase
      .from('individuals')
      .upsert({
        id: individual.id,
        given_name: individual.name.given,
        surname: individual.name.surname,
        maiden_name: individual.name.maidenName || null,
        nickname: individual.name.nickname || null,
        sex: individual.sex,
        birth_date: individual.birth?.date || null,
        birth_date_display: individual.birth?.dateDisplay || null,
        birth_place: individual.birth?.place || null,
        death_date: individual.death?.date || null,
        death_date_display: individual.death?.dateDisplay || null,
        death_place: individual.death?.place || null,
        email: individual.contact?.email || null,
        phone: individual.contact?.phone || null,
        notes: individual.notes || null,
        custom_fields: individual.customFields || {},
        family_as_child: individual.familyAsChild || null,
      }, { onConflict: 'id' });

    if (individualError) throw individualError;

    // Update spouse families - delete existing and insert new
    await supabase
      .from('individual_spouse_families')
      .delete()
      .eq('individual_id', individual.id);

    if (individual.familyAsSpouse.length > 0) {
      const { error: spouseError } = await supabase
        .from('individual_spouse_families')
        .insert(
          individual.familyAsSpouse.map(familyId => ({
            individual_id: individual.id,
            family_id: familyId,
          }))
        );
      if (spouseError) throw spouseError;
    }

    // Update photos - delete existing and insert new
    await supabase
      .from('photos')
      .delete()
      .eq('individual_id', individual.id);

    if (individual.photos.length > 0) {
      const { error: photosError } = await supabase
        .from('photos')
        .insert(
          individual.photos.map(photo => ({
            id: photo.id,
            individual_id: individual.id,
            url: photo.url,
            storage_path: null,
            is_primary: photo.isPrimary,
            is_portrait: photo.isPortrait,
            title: photo.title || null,
            photo_date: photo.date || null,
            place: photo.place || null,
          }))
        );
      if (photosError) throw photosError;
    }

    return { error: null };
  } catch (error) {
    console.error('Error saving individual:', error);
    return { error: error instanceof Error ? error : new Error('Failed to save individual') };
  }
}

// Save a family to Supabase
export async function saveFamily(family: Family): Promise<{ error: Error | null }> {
  try {
    // Upsert the family
    const { error: familyError } = await supabase
      .from('families')
      .upsert({
        id: family.id,
        husband_id: family.husband || null,
        wife_id: family.wife || null,
        marriage_date: family.marriage?.date || null,
        marriage_date_display: family.marriage?.dateDisplay || null,
        marriage_place: family.marriage?.place || null,
        divorce_date: family.divorce?.date || null,
        divorce_date_display: family.divorce?.dateDisplay || null,
        divorce_place: family.divorce?.place || null,
        notes: family.notes || null,
      }, { onConflict: 'id' });

    if (familyError) throw familyError;

    // Update children - delete existing and insert new
    await supabase
      .from('family_children')
      .delete()
      .eq('family_id', family.id);

    if (family.children.length > 0) {
      const { error: childrenError } = await supabase
        .from('family_children')
        .insert(
          family.children.map((childId, index) => ({
            family_id: family.id,
            child_id: childId,
            birth_order: index,
          }))
        );
      if (childrenError) throw childrenError;
    }

    return { error: null };
  } catch (error) {
    console.error('Error saving family:', error);
    return { error: error instanceof Error ? error : new Error('Failed to save family') };
  }
}

// Delete an individual from Supabase
export async function deleteIndividual(id: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('individuals')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting individual:', error);
    return { error: error instanceof Error ? error : new Error('Failed to delete individual') };
  }
}

// Delete a family from Supabase
export async function deleteFamily(id: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('families')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting family:', error);
    return { error: error instanceof Error ? error : new Error('Failed to delete family') };
  }
}

// Save root person setting
export async function saveRootPerson(personId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert({
        key: 'rootPerson',
        value: { id: personId },
      }, { onConflict: 'key' });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error saving root person:', error);
    return { error: error instanceof Error ? error : new Error('Failed to save root person') };
  }
}

// Upload a photo to Supabase Storage
export async function uploadPhoto(
  individualId: string,
  file: File
): Promise<{ url: string | null; storagePath: string | null; error: Error | null }> {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${individualId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('photos')
      .getPublicUrl(fileName);

    return { url: publicUrl, storagePath: fileName, error: null };
  } catch (error) {
    console.error('Error uploading photo:', error);
    return { url: null, storagePath: null, error: error instanceof Error ? error : new Error('Failed to upload photo') };
  }
}

// Delete a photo from Supabase Storage
export async function deletePhotoFromStorage(storagePath: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.storage
      .from('photos')
      .remove([storagePath]);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting photo from storage:', error);
    return { error: error instanceof Error ? error : new Error('Failed to delete photo') };
  }
}

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
