import type { Ref } from 'react';

const SHORTCUT = '⌥⌘\\';

type Props = {
  open: boolean;
  /** Still open count; null while it loads. */
  count: number | null;
  controls: string;
  onToggle: () => void;
  ref?: Ref<HTMLButtonElement>;
};

export const TodayTasksToggle = ({
  open,
  count,
  controls,
  onToggle,
  ref,
}: Props) => (
  <button
    ref={ref}
    type="button"
    className="kit-btn notebook-today__side-toggle"
    aria-controls={controls}
    aria-expanded={open}
    aria-keyshortcuts="Alt+Meta+\ Control+Alt+\"
    title={`${open ? 'Hide' : 'Show'} the task panel (${SHORTCUT})`}
    onClick={onToggle}
  >
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      {open ? (
        <path
          d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4Z"
          fill="currentColor"
        />
      ) : null}
      <path
        d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM15 4v16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    Tasks
    {count ? (
      <span className="notebook-today__side-count">
        {count}
        <span className="kit-visually-hidden"> still open</span>
      </span>
    ) : null}
  </button>
);
