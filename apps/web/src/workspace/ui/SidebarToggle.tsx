import { useWorkspaceSidebar } from '../workspaceSidebar';

/** Shows and hides the sidebar; renders nothing where it can't collapse. */
export const SidebarToggle = () => {
  const sidebar = useWorkspaceSidebar();
  if (!sidebar) return null;
  const { id, open, toggle, toggleRef } = sidebar;
  return (
    <button
      type="button"
      ref={toggleRef}
      className="kit-btn workspace-sidebar-toggle"
      aria-label="Sidebar"
      aria-controls={id}
      aria-expanded={open}
      title={open ? 'Hide sidebar (⌘\\)' : 'Show sidebar (⌘\\)'}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {open ? (
          <path
            d="M5 4h4v16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
            fill="currentColor"
          />
        ) : null}
        <path
          d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM9 4v16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};
