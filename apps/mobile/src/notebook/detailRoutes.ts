import { useRouter, useSegments } from 'expo-router';
import { useMemo, useRef } from 'react';

const DETAIL_TABS = ['today', 'upcoming', 'notes', 'tasks'] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

// A detail opens on the stack of the tab it was opened from, so Back returns
// there. `/tasks/:id` and `/notes/:id` stay the canonical (universal link)
// paths, used from the owning tab and from screens outside the tabs.
export const taskPath = (tab: DetailTab | null, id: string) =>
  !tab || tab === 'tasks' ? `/tasks/${id}` : `/${tab}/task/${id}`;

export const notePath = (tab: DetailTab | null, id: string) =>
  !tab || tab === 'notes' ? `/notes/${id}` : `/${tab}/note/${id}`;

export const detailTab = (segments: readonly string[]): DetailTab | null => {
  const tab = segments[0] === '(tabs)' ? segments[1] : undefined;
  return DETAIL_TABS.find((name) => name === tab) ?? null;
};

// A second tap lands before the first push has covered the row.
const REPEAT_TAP_MS = 1_000;

export const useDetailRoutes = () => {
  const router = useRouter();
  const tab = detailTab(useSegments());
  const lastPush = useRef<{ path: string; at: number } | null>(null);
  return useMemo(() => {
    const open = (path: string) => {
      const now = Date.now();
      const last = lastPush.current;
      if (last?.path === path && now - last.at < REPEAT_TAP_MS) return;
      lastPush.current = { path, at: now };
      router.push(path);
    };
    return {
      taskPath: (id: string) => taskPath(tab, id),
      notePath: (id: string) => notePath(tab, id),
      openTask: (id: string) => open(taskPath(tab, id)),
      openNote: (id: string) => open(notePath(tab, id)),
    };
  }, [router, tab]);
};
