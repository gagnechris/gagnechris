import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatest } from '@gagnechris/app-core';

export type DraftPreviewKind = 'post' | 'project';
export type DraftPreview = { title: string; markdown: string };

const storageKey = (kind: DraftPreviewKind, id: string) =>
  `admin.draftPreview.${kind}.${id}`;

export const draftPreviewPath = (kind: DraftPreviewKind, id: string) =>
  `/preview/${kind}/${encodeURIComponent(id)}`;

function write(kind: DraftPreviewKind, id: string, draft: DraftPreview) {
  try {
    window.localStorage.setItem(storageKey(kind, id), JSON.stringify(draft));
  } catch {
    // The preview tab then shows that there is nothing to preview.
  }
}

function read(kind: DraftPreviewKind, id: string): DraftPreview | null {
  try {
    const raw = window.localStorage.getItem(storageKey(kind, id));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<DraftPreview>;
    return typeof value.markdown === 'string'
      ? { title: value.title ?? '', markdown: value.markdown }
      : null;
  } catch {
    return null;
  }
}

/**
 * Hands the editor's current draft, saved or not, to the Preview page tab
 * through localStorage, and keeps it current while that tab is open: the
 * `storage` event reaches other tabs of the admin app.
 */
export function useDraftPreview(
  kind: DraftPreviewKind,
  id: string,
  draft: DraftPreview,
) {
  const opened = useRef(false);
  const latest = useLatest(draft);
  const { title, markdown } = draft;
  useEffect(() => {
    if (opened.current) write(kind, id, { title, markdown });
  }, [kind, id, title, markdown]);
  const onOpen = useCallback(() => {
    opened.current = true;
    write(kind, id, latest.current);
  }, [kind, id, latest]);
  return { href: draftPreviewPath(kind, id), onOpen };
}

/** The draft an editor tab handed over, updated as it changes. Key the caller by kind and id. */
export function useDraftPreviewSource(kind: DraftPreviewKind, id: string) {
  const [draft, setDraft] = useState(() => read(kind, id));
  useEffect(() => {
    const key = storageKey(kind, id);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setDraft(read(kind, id));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [kind, id]);
  return draft;
}
