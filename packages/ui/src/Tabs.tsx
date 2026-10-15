/** @jsxRuntime automatic */
import type { ReactNode } from 'react';
import { cx } from './cx.js';
import { useTabs } from './useTabs.js';

type TabItem<K extends string> = {
  key: K;
  label: ReactNode;
  count?: number;
  panel?: ReactNode;
};

type Props<K extends string> = {
  label: string;
  items: readonly TabItem<K>[];
  selected: K;
  onSelect: (key: K) => void;
  className?: string;
};

/**
 * Tabs for switching views of one thing (filters stay SegmentedRadio). Arrows
 * move, Home and End jump. Panels render when the items carry them.
 */
export const Tabs = <K extends string>({
  label,
  items,
  selected,
  onSelect,
  className,
}: Props<K>) => {
  const tabs = useTabs({
    keys: items.map((item) => item.key),
    selected,
    onSelect,
    label,
  });
  const hasPanels = items.some((item) => item.panel !== undefined);
  return (
    <div className={cx('ui-tabs', className)}>
      <div {...tabs.listProps} className="ui-tabs__list">
        {items.map((item) => {
          const { ref, ...props } = tabs.tabProps(item.key);
          return (
            <button
              key={item.key}
              {...props}
              ref={ref}
              aria-controls={hasPanels ? props['aria-controls'] : undefined}
              className="ui-tabs__tab"
            >
              {item.label}
              {item.count === undefined ? null : (
                <span className="ui-tabs__count">{item.count}</span>
              )}
            </button>
          );
        })}
      </div>
      {hasPanels
        ? items.map((item) => (
            <div
              key={item.key}
              {...tabs.panelProps(item.key)}
              tabIndex={0}
              className="ui-tabs__panel"
            >
              {item.panel}
            </div>
          ))
        : null}
    </div>
  );
};
