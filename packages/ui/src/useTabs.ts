import { useId, useRef, type KeyboardEvent } from 'react';

/**
 * WAI-ARIA tabs with automatic activation: one tab stop on the selected tab,
 * arrows move and select (wrapping), Home and End jump to the ends. Spread
 * `tabProps(key)` on each tab button and `panelProps(key)` on each panel.
 */
export function useTabs<K extends string>({
  keys,
  selected,
  onSelect,
  label,
}: {
  keys: readonly K[];
  selected: K;
  onSelect: (key: K) => void;
  label: string;
}) {
  const baseId = useId();
  const tabs = useRef(new Map<K, HTMLButtonElement | null>());
  const tabId = (key: K) => `${baseId}-tab-${key}`;
  const panelId = (key: K) => `${baseId}-panel-${key}`;

  const select = (key: K) => {
    onSelect(key);
    tabs.current.get(key)?.focus();
  };

  const onKeyDown = (from: K) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const at = keys.indexOf(from);
    const last = keys.length - 1;
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
    select(keys[to]!);
  };

  return {
    listProps: { role: 'tablist', 'aria-label': label } as const,
    tabProps: (key: K) => ({
      ref: (el: HTMLButtonElement | null) => {
        tabs.current.set(key, el);
      },
      type: 'button' as const,
      role: 'tab' as const,
      id: tabId(key),
      'aria-selected': key === selected,
      'aria-controls': panelId(key),
      tabIndex: key === selected ? 0 : -1,
      onClick: () => onSelect(key),
      onKeyDown: onKeyDown(key),
    }),
    panelProps: (key: K) => ({
      role: 'tabpanel' as const,
      id: panelId(key),
      'aria-labelledby': tabId(key),
      hidden: key !== selected,
    }),
    focusTab: (key: K) => tabs.current.get(key)?.focus(),
  };
}
