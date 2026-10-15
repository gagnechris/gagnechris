import { useCallback } from 'react';
import { useNotebookAreas } from '@gagnechris/app-core';
import { notebookAreaName } from '@gagnechris/shared';

/** Names an area id from the user's list. */
export function useNotebookAreaName(): (id: string) => string {
  const areas = useNotebookAreas();
  return useCallback((id) => notebookAreaName(areas, id), [areas]);
}
