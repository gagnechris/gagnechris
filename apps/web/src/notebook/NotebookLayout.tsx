import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useTasksQuery } from '@gagnechris/app-core';
import { WorkspaceFrame } from '../workspace/WorkspaceShell';
import type { AuthUser } from '../workspace/auth/session';
import {
  areaQueryParam,
  NOTEBOOK_AREA_FILTERS,
  readNotebookAreaFilter,
  writeNotebookAreaFilter,
  type NotebookAreaFilter,
} from './notebookAreaPreference';
import NotebookSearchPalette from './NotebookSearchPalette';
import { useLocalToday } from './useLocalToday';

export type NotebookOutletContext = {
  areaFilter: NotebookAreaFilter;
  setAreaFilter: (next: NotebookAreaFilter) => void;
};

const AREA_LABELS: Record<NotebookAreaFilter, string> = {
  work: 'Work',
  personal: 'Personal',
  all: 'All',
};

/** Same query as Today's Still open, so the two share one cache entry. */
function useTodayOpenCount(areaFilter: NotebookAreaFilter): string | undefined {
  const day = useLocalToday();
  const showing = useTasksQuery({
    area: areaQueryParam(areaFilter),
    open: true,
    startOnOrBefore: day,
    today: day,
    limit: 100,
  });
  if (!showing.data) return undefined;
  const count = showing.data.pages.reduce((n, p) => n + p.items.length, 0);
  if (showing.hasNextPage) return `${count}+`;
  return count > 0 ? String(count) : undefined;
}

export default function NotebookLayout({ user }: { user: AuthUser }) {
  const [areaFilter, setAreaFilterState] = useState<NotebookAreaFilter>(() =>
    readNotebookAreaFilter(),
  );
  const todayCount = useTodayOpenCount(areaFilter);

  const setAreaFilter = (next: NotebookAreaFilter) => {
    setAreaFilterState(next);
    writeNotebookAreaFilter(next);
  };

  const outletContext: NotebookOutletContext = {
    areaFilter,
    setAreaFilter,
  };

  return (
    <WorkspaceFrame
      app="notebook"
      user={user}
      sidebarTop={
        <div
          className="workspace-segmented"
          role="radiogroup"
          aria-label="Notebook area"
        >
          {NOTEBOOK_AREA_FILTERS.map((area) => (
            <button
              key={area}
              type="button"
              role="radio"
              aria-checked={areaFilter === area}
              className="workspace-segmented__option"
              onClick={() => setAreaFilter(area)}
            >
              {AREA_LABELS[area]}
            </button>
          ))}
        </div>
      }
      sections={[
        {
          label: 'Notebook',
          items: [
            { to: '/today', label: 'Today', icon: 'today', count: todayCount },
            { to: '/upcoming', label: 'Upcoming', icon: 'upcoming' },
            { to: '/notes', label: 'Notes', icon: 'notes' },
            {
              to: '/tasks',
              label: 'All tasks',
              tabLabel: 'Tasks',
              icon: 'tasks',
            },
          ],
        },
      ]}
      renderSearch={(close) => (
        <NotebookSearchPalette onClose={close} areaFilter={areaFilter} />
      )}
    >
      <Outlet context={outletContext} />
    </WorkspaceFrame>
  );
}
