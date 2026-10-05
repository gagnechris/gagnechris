import { useEffect } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { useTasksQuery } from '@gagnechris/app-core';
import { WorkspaceFrame } from '../workspace/WorkspaceShell';
import type { AuthUser } from '../workspace/auth/session';
import SegmentedRadio from '../workspace/ui/SegmentedRadio';
import {
  areaQueryParam,
  isNotebookAreaFilter,
  NOTEBOOK_AREA_FILTERS,
  NOTEBOOK_AREA_LABELS,
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

const AREA_OPTIONS = NOTEBOOK_AREA_FILTERS.map((value) => ({
  value,
  label: NOTEBOOK_AREA_LABELS[value],
}));

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
  // The URL wins so a link or another tab opens the area it names; the
  // stored choice fills in when a link leaves `area` off.
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = searchParams.get('area');
  const { pathname } = useLocation();
  const areaFilter: NotebookAreaFilter = isNotebookAreaFilter(fromUrl)
    ? fromUrl
    : readNotebookAreaFilter();
  const todayCount = useTodayOpenCount(areaFilter);

  useEffect(() => {
    if (fromUrl === areaFilter) {
      writeNotebookAreaFilter(areaFilter);
      return;
    }
    // `/` is mid-redirect to Today; replacing its URL here would undo that.
    if (pathname === '/') return;
    setSearchParams(
      (params) => {
        params.set('area', areaFilter);
        return params;
      },
      { replace: true },
    );
  }, [areaFilter, fromUrl, pathname, setSearchParams]);

  const setAreaFilter = (next: NotebookAreaFilter) => {
    writeNotebookAreaFilter(next);
    setSearchParams(
      (params) => {
        params.set('area', next);
        return params;
      },
      { replace: true },
    );
  };
  const withArea = (path: string) => `${path}?area=${areaFilter}`;

  const outletContext: NotebookOutletContext = {
    areaFilter,
    setAreaFilter,
  };

  return (
    <WorkspaceFrame
      app="notebook"
      user={user}
      sidebarTop={
        <SegmentedRadio
          label="Notebook area"
          options={AREA_OPTIONS}
          value={areaFilter}
          onChange={setAreaFilter}
        />
      }
      sections={[
        {
          label: 'Notebook',
          items: [
            {
              to: withArea('/today'),
              label: 'Today',
              icon: 'today',
              count: todayCount,
            },
            { to: withArea('/upcoming'), label: 'Upcoming', icon: 'upcoming' },
            { to: withArea('/notes'), label: 'Notes', icon: 'notes' },
            {
              to: withArea('/tasks'),
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
