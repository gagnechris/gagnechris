import { IconButton } from '@gagnechris/ui';

export function TaskDetailsToggle({
  open,
  title,
  panelId,
  onToggle,
}: {
  open: boolean;
  title: string;
  panelId: string;
  onToggle: () => void;
}) {
  return (
    <IconButton
      size="sm"
      className="task-embed__details-toggle"
      label={open ? `Hide details for ${title}` : `Show details for ${title}`}
      title={open ? 'Hide details (⌘.)' : 'Show details (⌘.)'}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      onClick={onToggle}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M6 4l4 4-4 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </IconButton>
  );
}
