import { useOutletContext, useParams, useLocation } from 'react-router-dom';
import type { NotebookOutletContext } from './AdminNotebookLayout';
import type { NotebookAreaFilter } from './notebook/notebookAreaPreference';

const AREA_LABELS: Record<NotebookAreaFilter, string> = {
  work: 'Work',
  personal: 'Personal',
  all: 'All areas',
};

function sectionFromPath(pathname: string): string {
  if (pathname.includes('/notebook/tasks')) return 'Tasks';
  if (pathname.includes('/notebook/notes')) return 'Notes';
  if (pathname.includes('/notebook/today')) return 'Today';
  return 'Notebook';
}

/**
 * Placeholder body for notebook sections until CHR-42 (notes) / CHR-44 (tasks).
 * Reads the persisted area filter from the layout outlet context.
 */
export default function AdminNotebookPage() {
  const { areaFilter } = useOutletContext<NotebookOutletContext>();
  const { id } = useParams<{ id?: string }>();
  const { pathname } = useLocation();
  const section = sectionFromPath(pathname);
  const areaLabel = AREA_LABELS[areaFilter];

  return (
    <section className="admin-panel">
      <h1>{section}</h1>
      <p className="admin-panel__lede">
        {id
          ? `${areaLabel} · note ${id} (editor arrives in a later ticket).`
          : `${areaLabel} · ${section.toLowerCase()} UI arrives in a later ticket.`}
      </p>
    </section>
  );
}
