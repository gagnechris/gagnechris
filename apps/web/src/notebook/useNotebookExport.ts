import { useState } from 'react';
import {
  fetchNotesPage,
  fetchTasksPage,
  useGetApiClient,
} from '@gagnechris/app-core';
import { localToday } from '../kit/calendarDates';
import { buildNotebookExportZip, triggerBlobDownload } from './exportNotebook';

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
      const [notes, tasks] = await Promise.all([
        collectAllPages((cursor) =>
          fetchNotesPage(client, { cursor, limit: 100 }),
        ),
        collectAllPages((cursor) =>
          fetchTasksPage(client, { cursor, limit: 100 }),
        ),
      ]);
      const { blob } = buildNotebookExportZip(notes, tasks);
      triggerBlobDownload(blob, `notebook-export-${localToday()}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return { exportZip, busy, error };
}
