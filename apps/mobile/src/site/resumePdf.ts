import { RESUME_DOWNLOAD_FILENAME } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { File, Paths } from 'expo-file-system';
import { openBrowserAsync } from 'expo-web-browser';
import { Share } from 'react-native';
import { apiBaseUrl } from '../config';
import { siteUrlFor } from './feed';

/** Best effort, as on the website; the referrer names the app. */
const notifyDownload = () =>
  fetch(`${apiBaseUrl}/api/resume/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ referrer: 'iOS app' }),
  }).catch(() => undefined);

export const viewResumePdf = async (pdfPath: string): Promise<void> => {
  void notifyDownload();
  await openBrowserAsync(siteUrlFor(pdfPath), {
    controlsColor: tokens.primary[700],
    dismissButtonStyle: 'done',
  });
};

/** Shares the file itself, so Mail attaches it and Files saves a PDF, not a link. */
export const shareResumePdf = async (pdfPath: string): Promise<void> => {
  void notifyDownload();
  const downloaded = await File.downloadFileAsync(
    siteUrlFor(pdfPath),
    new File(Paths.cache, RESUME_DOWNLOAD_FILENAME),
    { idempotent: true },
  );
  await Share.share({ url: downloaded.uri });
};
