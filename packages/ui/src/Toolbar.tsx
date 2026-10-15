/** @jsxRuntime automatic */
import {
  useEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from './cx.js';

const ITEMS = 'button:not(:disabled)';

/** A row of IconButtons with one tab stop; arrows move, Home and End jump. */
export const Toolbar = ({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) => {
  const root = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLElement | null>(null);

  const items = () => [
    ...(root.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []),
  ];

  const settle = (next: HTMLElement | null) => {
    const list = items();
    const stop = next && list.includes(next) ? next : (list[0] ?? null);
    active.current = stop;
    for (const el of list) el.tabIndex = el === stop ? 0 : -1;
  };

  // Children can change between renders, so the tab stop is re-applied after each.
  useEffect(() => settle(active.current));

  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLElement && e.target.matches(ITEMS))
      settle(e.target);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const last = list.length - 1;
    const to =
      e.key === 'ArrowRight'
        ? at === last
          ? 0
          : at + 1
        : e.key === 'ArrowLeft'
          ? at === 0
            ? last
            : at - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    list[to]!.focus();
  };

  return (
    <div
      ref={root}
      role="toolbar"
      aria-label={label}
      className={cx('ui-toolbar', className)}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
};

export const ToolbarSeparator = () => (
  <span
    role="separator"
    aria-orientation="vertical"
    className="ui-toolbar__separator"
  />
);
