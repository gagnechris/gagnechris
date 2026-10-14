import { useState } from 'react';
import {
  fetchDailyTemplate,
  fetchNotesPage,
  fetchTasksPage,
  useGetApiClient,
} from '@gagnechris/app-core';
import { localDateString } from '@gagnechris/shared';
import { buildNotebookExportZip, triggerBlobDownload } from './exportNotebook';
import { notebookImageNames, notebookImageResolver } from './notebookImages';

/** Each image the notes and tasks show; one that no longer loads is left out. */
async function collectImages(
  getClient: Parameters<typeof notebookImageResolver>[0],
  markdown: string[],
): Promise<Record<string, Uint8Array>> {
  const resolve = notebookImageResolver(getClient);
  const names = new Set(markdown.flatMap(notebookImageNames));
  const images: Record<string, Uint8Array> = {};
  await Promise.all(
    [...names].map(async (name) => {
      try {
        const res = await fetch(await resolve(`notebook-image:${name}`));
        if (res.ok) images[name] = new Uint8Array(await res.arrayBuffer());
      } catch {
        // Left out of the zip; the note still names it.
      }
    }),
  );
  return images;
}

/** Every page of a cursor-paged list. */
async function collectAllPages<T>(
  fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

export function useNotebookExport() {
  const getClient = useGetApiClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportZip = async () => {
    setBusy(true);
    setError(null);
    try {
      const client = getClient();
      const [notes, tasks, work, personal] = await Promise.all([
        collectAllPages((cursor) =>
          fetchNotesPage(client, { cursor, limit: 100 }),
        ),
        collectAllPages((cursor) =>
          fetchTasksPage(client, { cursor, limit: 100 }),
        ),
        fetchDailyTemplate(client, 'work'),
        fetchDailyTemplate(client, 'personal'),
      ]);
      const images = await collectImages(getClient, [
        ...notes.filter((n) => !n.deleted).map((n) => n.bodyMarkdown),
        ...tasks.filter((t) => !t.deleted).map((t) => t.description),
      ]);
      const { blob } = buildNotebookExportZip(
        notes,
        tasks,
        [work, personal],
        images,
      );
      triggerBlobDownload(blob, `notebook-export-${localDateString()}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return { exportZip, busy, error };
}
