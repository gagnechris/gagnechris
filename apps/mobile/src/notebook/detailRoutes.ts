import { useRouter, useSegments } from 'expo-router';
import { useMemo } from 'react';

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

export const useDetailRoutes = () => {
  const router = useRouter();
  const tab = detailTab(useSegments());
  return useMemo(
    () => ({
      taskPath: (id: string) => taskPath(tab, id),
      notePath: (id: string) => notePath(tab, id),
      openTask: (id: string) => router.push(taskPath(tab, id)),
      openNote: (id: string) => router.push(notePath(tab, id)),
    }),
    [router, tab],
  );
};
