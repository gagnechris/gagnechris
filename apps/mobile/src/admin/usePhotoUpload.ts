import { useGetApiClient } from '@gagnechris/app-core';
import { useCallback, useState } from 'react';
import { showError } from '../ui/confirm';
import { ImageUploadError, pickImage, uploadImage } from './imageUpload';

/** Picks a photo, uploads it to site media, then hands `place` its public path. */
export function usePhotoUpload() {
  const getClient = useGetApiClient();
  const [uploading, setUploading] = useState(false);

  const addPhoto = useCallback(
    async (place: (path: string, alt: string) => void) => {
      try {
        const image = await pickImage();
        if (!image) return;
        setUploading(true);
        place(await uploadImage(getClient(), image), image.alt);
      } catch (err) {
        showError(
          'Could not add the photo',
          err instanceof ImageUploadError
            ? err.message
            : 'Check your connection and try again.',
        );
      } finally {
        setUploading(false);
      }
    },
    [getClient],
  );

  return { uploading, addPhoto };
}
