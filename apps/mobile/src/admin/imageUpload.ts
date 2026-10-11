import type { ApiClient } from '@gagnechris/api-client';
import {
  MEDIA_CONTENT_TYPES,
  MEDIA_MAX_BYTES,
  type MediaContentType,
} from '@gagnechris/shared';
import {
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from 'expo-image-picker';

const allowed = new Set<string>(MEDIA_CONTENT_TYPES);

export type PickedImage = {
  uri: string;
  contentType: MediaContentType;
  filename: string;
  alt: string;
};

export class ImageUploadError extends Error {}

/** One photo from the library; null when the picker is cancelled. */
export async function pickImage(): Promise<PickedImage | null> {
  const result = await launchImageLibraryAsync({
    mediaTypes: ['images'],
    // HEIC isn't a media type the site serves; this hands back JPEG instead.
    preferredAssetRepresentationMode:
      UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const contentType = asset.mimeType ?? 'image/jpeg';
  if (!allowed.has(contentType)) {
    throw new ImageUploadError('That photo’s format can’t go on the site.');
  }
  const filename = asset.fileName ?? 'photo';
  return {
    uri: asset.uri,
    contentType: contentType as MediaContentType,
    filename,
    alt: filename.replace(/\.[^.]+$/, ''),
  };
}

/** Puts the image in site media and returns its public path. */
export async function uploadImage(
  client: ApiClient,
  image: PickedImage,
): Promise<string> {
  const blob = await (await fetch(image.uri)).blob();
  if (blob.size > MEDIA_MAX_BYTES) {
    throw new ImageUploadError('That photo is over 10 MB.');
  }
  const { data } = await client.POST('/api/admin/media/upload-url', {
    body: {
      contentType: image.contentType,
      contentLength: blob.size,
      filename: image.filename,
    },
  });
  if (!data) throw new ImageUploadError('The photo upload was refused.');
  const put = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: data.headers,
    body: blob,
  });
  if (!put.ok) throw new ImageUploadError('The photo didn’t upload.');
  return data.publicPath;
}
