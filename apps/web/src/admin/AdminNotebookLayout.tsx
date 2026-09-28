import { Outlet } from 'react-router-dom';

/**
 * Empty layout for `/admin/notebook/*` (Work/Personal switcher lives here later).
 * Child routes: index, today, notes/:id, tasks.
 */
export default function AdminNotebookLayout() {
  return <Outlet />;
}
