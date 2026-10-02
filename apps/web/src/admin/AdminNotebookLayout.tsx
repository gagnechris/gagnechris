import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { navLinkClass } from '../ui/navLinkClass';
import {
  NOTEBOOK_AREA_FILTERS,
  readNotebookAreaFilter,
  writeNotebookAreaFilter,
  type NotebookAreaFilter,
} from './notebook/notebookAreaPreference';
import NotebookSearchPalette from './notebook/NotebookSearchPalette';

export type NotebookOutletContext = {
  areaFilter: NotebookAreaFilter;
  setAreaFilter: (next: NotebookAreaFilter) => void;
};

const AREA_LABELS: Record<NotebookAreaFilter, string> = {
  work: 'Work',
  personal: 'Personal',
  all: 'All',
};

function areaButtonClass(active: boolean): string {
  return active
    ? 'admin-nav__link admin-nav__link--active admin-nav__button'
    : 'admin-nav__link admin-nav__button';
}

/**
 * Notebook chrome for `/admin/notebook/*`: Work/Personal/All filter (persisted)
 * plus Today / Notes / Tasks section nav. Child routes render in the outlet.
 */
export default function AdminNotebookLayout() {
  const [areaFilter, setAreaFilterState] = useState<NotebookAreaFilter>(() =>
    readNotebookAreaFilter(),
  );
  const [searchOpen, setSearchOpen] = useState(false);

  const setAreaFilter = (next: NotebookAreaFilter) => {
    setAreaFilterState(next);
    writeNotebookAreaFilter(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const outletContext: NotebookOutletContext = {
    areaFilter,
    setAreaFilter,
  };

  return (
    <div className="admin-notebook">
      <div className="admin-notebook__chrome">
        <div
          className="admin-notebook__areas"
          role="radiogroup"
          aria-label="Notebook area"
        >
          {NOTEBOOK_AREA_FILTERS.map((area) => (
            <button
              key={area}
              type="button"
              role="radio"
              aria-checked={areaFilter === area}
              className={areaButtonClass(areaFilter === area)}
              onClick={() => setAreaFilter(area)}
            >
              {AREA_LABELS[area]}
            </button>
          ))}
        </div>
        <nav
          className="admin-notebook__sections"
          aria-label="Notebook sections"
        >
          <NavLink to="today" className={navLinkClass}>
            Today
          </NavLink>
          <NavLink to="notes" className={navLinkClass}>
            Notes
          </NavLink>
          <NavLink to="tasks" className={navLinkClass}>
            Tasks
          </NavLink>
          <button
            type="button"
            className="admin-nav__link admin-nav__button"
            onClick={() => setSearchOpen(true)}
          >
            Search
            <kbd className="notebook-search__kbd">⌘K</kbd>
          </button>
        </nav>
      </div>
      <Outlet context={outletContext} />
      {searchOpen ? (
        <NotebookSearchPalette
          open
          onClose={() => setSearchOpen(false)}
          areaFilter={areaFilter}
        />
      ) : null}
    </div>
  );
}
