import { useState } from 'react';
import {
  fetchNotesPage,
  fetchTasksPage,
  useGetApiClient,
} from '@gagnechris/app-core';
import { localDateString } from '@gagnechris/shared';
import { buildNotebookExportZip, triggerBlobDownload } from './exportNotebook';

async function collectAllNotes(
  client: ReturnType<ReturnType<typeof useGetApiClient>>,
) {
  const items = [];
  let cursor: string | undefined;
  do {
    const page = await fetchNotesPage(client, { cursor, limit: 100 });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

async function collectAllTasks(
  client: ReturnType<ReturnType<typeof useGetApiClient>>,
) {
  const items = [];
  let cursor: string | undefined;
  do {
    const page = await fetchTasksPage(client, { cursor, limit: 100 });
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
        collectAllNotes(client),
        collectAllTasks(client),
      ]);
      const { blob } = buildNotebookExportZip(notes, tasks);
      triggerBlobDownload(blob, `notebook-export-${localDateString()}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return { exportZip, busy, error };
}
