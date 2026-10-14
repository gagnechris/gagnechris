import { useId, type Ref } from 'react';

type ButtonProps = {
  /** The accessible name, the same whether the panel is open or closed. */
  label: string;
  /** How the tooltip names the panel: "Hide {noun}". */
  noun: string;
  controls: string;
  open: boolean;
  /** The window side the panel sits on. */
  side: 'left' | 'right';
  shortcut: string;
  keyShortcuts: string;
  /** `byKeyboard` is false for a click. */
  onToggle: (byKeyboard: boolean) => void;
  ref?: Ref<HTMLButtonElement>;
};

type ExpandProps = ButtonProps & {
  /** Shown on the control even while idle; null or 0 shows nothing. */
  count?: number | null;
  countLabel?: string;
};

function EdgeButton({
  label,
  noun,
  controls,
  open,
  side,
  shortcut,
  keyShortcuts,
  onToggle,
  ref,
  count,
  countLabel,
}: ExpandProps) {
  const countId = useId();
  const pointsLeft = open === (side === 'left');
  return (
    <button
      ref={ref}
      type="button"
      className="workspace-edge-button"
      aria-label={label}
      aria-controls={controls}
      aria-expanded={open}
      aria-keyshortcuts={keyShortcuts}
      aria-describedby={count ? countId : undefined}
      title={`${open ? 'Hide' : 'Show'} ${noun} (${shortcut})`}
      onClick={(e) => onToggle(e.detail === 0)}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          d={pointsLeft ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {count ? (
        <>
          <span className="workspace-edge-button__count" aria-hidden="true">
            {count}
          </span>
          <span id={countId} className="kit-visually-hidden">
            {`${count} ${countLabel ?? ''}`.trim()}
          </span>
        </>
      ) : null}
    </button>
  );
}

/** Rides a panel's resize edge; shows while the edge is hovered or focused. */
export const PanelCollapseButton = ({
  className,
  ...props
}: Omit<ButtonProps, 'open'> & { className: string }) => (
  <div className={`workspace-edge-track ${className}`}>
    <EdgeButton {...props} open />
  </div>
);

/** A thin zone on the window's edge that brings a collapsed panel back. */
export const PanelExpandEdge = ({
  className,
  ...props
}: Omit<ExpandProps, 'open'> & { className?: string }) => (
  <div
    className={[
      'workspace-edge-zone',
      `workspace-edge-zone--${props.side}`,
      props.count ? 'workspace-edge-zone--counted' : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <EdgeButton {...props} open={false} />
  </div>
);
