import { useEffect } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import {
  useNotebookAreasQuery,
  useTasksQuery,
  type NotebookArea,
  type NotebookAreaEntry,
} from '@gagnechris/app-core';
import {
  DEFAULT_NOTEBOOK_AREAS,
  notebookAreaName,
  resolveNotebookArea,
} from '@gagnechris/shared';
import { WorkspaceFrame } from '../workspace/WorkspaceShell';
import type { AuthUser } from '../workspace/auth/session';
import { SegmentedRadio } from '@gagnechris/ui';
import {
  readStoredNotebookArea,
  writeStoredNotebookArea,
} from './notebookAreaPreference';
import NotebookSearchPalette from './NotebookSearchPalette';
import SidebarStandingNotes from './SidebarStandingNotes';
import { useLocalToday } from './useLocalToday';

export type NotebookOutletContext = {
  area: NotebookArea;
  areaName: string;
  /** The user's areas, in switch order. */
  areas: readonly NotebookAreaEntry[];
  setArea: (next: NotebookArea) => void;
};

/** Same query as Today's Still open, so the two share one cache entry. */
function useTodayOpenCount(area: NotebookArea): string | undefined {
  const day = useLocalToday();
  const showing = useTasksQuery({
    area,
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
  const areasQuery = useNotebookAreasQuery();
  // Until the list loads, the default areas stand in for it, which is what
  // a user who never changed them has; any other area waits for the list.
  const loaded = areasQuery.data !== undefined || areasQuery.isError;
  const areas = areasQuery.data?.areas ?? DEFAULT_NOTEBOOK_AREAS;
  const wanted = fromUrl ?? readStoredNotebookArea();
  const waiting =
    !loaded && wanted !== null && !areas.some((a) => a.id === wanted);
  const area = resolveNotebookArea(wanted, areas);
  const todayCount = useTodayOpenCount(area);

  useEffect(() => {
    if (waiting) return;
    if (fromUrl === area) {
      writeStoredNotebookArea(area);
      return;
    }
    // `/` is mid-redirect to Today; replacing its URL here would undo that.
    if (pathname === '/') return;
    setSearchParams(
      (params) => {
        params.set('area', area);
        return params;
      },
      { replace: true },
    );
  }, [area, fromUrl, pathname, setSearchParams, waiting]);

  if (waiting) return null;

  const setArea = (next: NotebookArea) => {
    writeStoredNotebookArea(next);
    setSearchParams(
      (params) => {
        params.set('area', next);
        return params;
      },
      { replace: true },
    );
  };
  const withArea = (path: string) => `${path}?area=${area}`;

  const outletContext: NotebookOutletContext = {
    area,
    areaName: notebookAreaName(areas, area),
    areas,
    setArea,
  };

  return (
    <WorkspaceFrame
      app="notebook"
      user={user}
      collapsible
      sidebarTop={
        <SegmentedRadio
          className="notebook-area-switch"
          label="Notebook area"
          options={areas.map((a) => ({ value: a.id, label: a.name }))}
          value={area}
          onChange={setArea}
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
        {
          label: 'Settings',
          items: [
            {
              to: withArea('/settings/templates'),
              label: 'Daily templates',
              tabLabel: 'Templates',
              icon: 'templates',
            },
            {
              to: withArea('/settings/note-templates'),
              label: 'Note templates',
              icon: 'templates',
            },
            {
              to: withArea('/settings/areas'),
              label: 'Areas',
              icon: 'areas',
            },
          ],
        },
      ]}
      sidebarBottom={<SidebarStandingNotes area={area} />}
      renderSearch={(close) => (
        <NotebookSearchPalette onClose={close} area={area} areas={areas} />
      )}
    >
      <Outlet context={outletContext} />
    </WorkspaceFrame>
  );
}
