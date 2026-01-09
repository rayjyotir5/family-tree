'use client';

import React, { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Photo } from '@/lib/types';

interface PhotoUploaderProps {
  individualId: string;
  photos: Photo[];
  onPhotosChange: (photos: Photo[]) => void;
}

export function PhotoUploader({ individualId, photos, onPhotosChange }: PhotoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${individualId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('photos')
        .getPublicUrl(fileName);

      const newPhoto: Photo = {
        id: `P${Date.now()}`,
        url: publicUrl,
        isPrimary: photos.length === 0, // First photo is primary by default
        isPortrait: true,
      };

      onPhotosChange([...photos, newPhoto]);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSetPrimary = (photoId: string) => {
    onPhotosChange(photos.map(p => ({
      ...p,
      isPrimary: p.id === photoId,
    })));
  };

  const handleDelete = async (photo: Photo) => {
    // If it's a Supabase storage URL, try to delete from storage
    if (photo.url.includes('supabase.co/storage')) {
      try {
        const pathMatch = photo.url.match(/\/photos\/(.+)$/);
        if (pathMatch) {
          await supabase.storage.from('photos').remove([pathMatch[1]]);
        }
      } catch (err) {
        console.error('Error deleting from storage:', err);
      }
    }

    // Remove from photos array
    const newPhotos = photos.filter(p => p.id !== photo.id);

    // If we deleted the primary photo, make the first remaining photo primary
    if (photo.isPrimary && newPhotos.length > 0) {
      newPhotos[0].isPrimary = true;
    }

    onPhotosChange(newPhotos);
  };

  return (
    <div className="space-y-4">
      {/* Existing photos grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map(photo => (
            <div key={photo.id} className="relative group aspect-square">
              <img
                src={photo.url}
                alt=""
                className="w-full h-full object-cover rounded-xl border border-warm-200"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23e7e5e4" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%2378716c" font-size="12">No Image</text></svg>';
                }}
              />
              {photo.isPrimary && (
                <span className="absolute top-2 left-2 bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full font-medium shadow-sm">
                  Primary
                </span>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
                {!photo.isPrimary && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(photo.id)}
                    className="px-2 py-1 bg-white rounded-lg text-warm-700 text-xs font-medium hover:bg-warm-100 transition-colors"
                  >
                    Set Primary
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(photo)}
                  className="p-1.5 bg-red-500 rounded-lg text-white hover:bg-red-600 transition-colors"
                  title="Delete photo"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Upload button */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          className="hidden"
          disabled={uploading}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full px-4 py-4 border-2 border-dashed border-warm-300 rounded-xl text-warm-600 hover:border-primary-400 hover:text-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Uploading...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Photo
            </>
          )}
        </button>
        <p className="text-xs text-warm-500 mt-2 text-center">
          Supports JPG, PNG, GIF up to 5MB
        </p>
      </div>
    </div>
  );
}
