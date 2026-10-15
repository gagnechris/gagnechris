/** @jsxRuntime automatic */
import type { ComponentProps, ReactNode } from 'react';
import { cx, type ControlSize, type Tone } from './cx.js';

type Props = Omit<ComponentProps<'button'>, 'children' | 'aria-label'> & {
  /** The accessible name, also shown as the tooltip. */
  label: string;
  /** The icon, usually a ShellIcon. */
  children: ReactNode;
  variant?: 'ghost' | 'outline' | 'danger';
  size?: ControlSize;
  /** Makes it a toggle: sets `aria-pressed`. */
  pressed?: boolean;
  /** A badge at the top right, read after the label. */
  count?: number;
  tone?: Tone;
};

export const IconButton = ({
  label,
  children,
  variant,
  size = 'md',
  pressed,
  count,
  tone = 'default',
  className,
  type = 'button',
  ...rest
}: Props) => {
  const look = variant ?? (tone === 'editorial' ? 'outline' : 'ghost');
  const showCount = count !== undefined && count > 0;
  return (
    <button
      type={type}
      aria-label={showCount ? `${label}, ${count}` : label}
      title={label}
      aria-pressed={pressed}
      className={cx(
        'ui-icon-btn',
        `ui-icon-btn--${look}`,
        `ui-icon-btn--${size}`,
        tone === 'editorial' && 'ui-icon-btn--editorial',
        className,
      )}
      {...rest}
    >
      {children}
      {showCount ? (
        <span className="ui-icon-btn__count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </button>
  );
};
