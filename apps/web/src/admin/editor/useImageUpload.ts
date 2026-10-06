import { useCallback } from 'react';
import { useGetApiClient } from '@gagnechris/app-core';
import { uploadImages } from '../uploadImages';

/**
 * `uploadImage` throws so a field can show the error next to itself;
 * `uploadBodyImages` reports through the page's save error, because the body
 * editor has nowhere of its own to show one.
 */
export function useImageUpload(setSaveError: (message: string | null) => void) {
  const getClient = useGetApiClient();

  const uploadImage = useCallback(
    async (file: File) => {
      const [path] = await uploadImages(getClient(), [file]);
      if (!path) throw new Error('Image upload failed');
      return path;
    },
    [getClient],
  );

  const uploadBodyImages = useCallback(
    async (files: File[]) => {
      try {
        setSaveError(null);
        return await uploadImages(getClient(), files);
      } catch (err) {
        setSaveError(
          err instanceof Error ? err.message : 'Image upload failed',
        );
        return [];
      }
    },
    [getClient, setSaveError],
  );

  return { uploadImage, uploadBodyImages };
}
