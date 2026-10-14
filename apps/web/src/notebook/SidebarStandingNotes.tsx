import { NavLink } from 'react-router-dom';
import { useLoadAllPages, useNotesQuery } from '@gagnechris/app-core';
import { noteTitle, sidebarStandingNotes } from '@gagnechris/shared';
import ShellIcon from '../workspace/ui/ShellIcon';
import {
  areaQueryParam,
  type NotebookAreaFilter,
} from './notebookAreaPreference';

/** Standing notes until archived, so each is one click away. */
export default function SidebarStandingNotes({
  areaFilter,
}: {
  areaFilter: NotebookAreaFilter;
}) {
  // Same query as the Notes page's Standing and Archived filters.
  const notesQuery = useNotesQuery({
    area: areaQueryParam(areaFilter),
    type: 'page',
    limit: 100,
  });
  useLoadAllPages(notesQuery);
  const notes = sidebarStandingNotes(
    notesQuery.data?.pages.flatMap((page) => page.items) ?? [],
  );
  if (notes.length === 0) return null;

  return (
    <nav className="workspace-nav__section" aria-label="Standing notes">
      <span className="workspace-nav__heading">Notes</span>
      {notes.map((note) => (
        <NavLink
          key={note.id}
          to={`/notes/${note.id}?area=${areaFilter}`}
          className={({ isActive }) =>
            isActive
              ? 'workspace-nav__item workspace-nav__item--active'
              : 'workspace-nav__item'
          }
          title={noteTitle(note)}
        >
          <ShellIcon name="notes" size={16} />
          <span className="workspace-nav__label notebook-sidebar-note__label">
            {noteTitle(note)}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
