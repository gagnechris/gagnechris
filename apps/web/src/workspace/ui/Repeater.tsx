import { useRef, type ReactNode } from 'react';
import { Button, DragHandle, useDragReorder } from '@gagnechris/ui';

export type RepeaterItem = { id: string };

type Props<T extends RepeaterItem> = {
  legend: string;
  items: T[];
  onChange: (items: T[] | ((prev: T[]) => T[])) => void;
  createItem: () => T;
  renderItem: (
    item: T,
    helpers: {
      update: (patch: Partial<T>) => void;
      remove: () => void;
    },
  ) => ReactNode;
  addLabel: string;
  removeLabel?: string;
  /** When true, each row gets a DragHandle. */
  reorderable?: boolean;
  /** How a DragHandle names its row; 1-based `position`. */
  itemName?: (item: T, position: number) => string;
};

/**
 * Fieldset repeater with stable `id` keys so reordering / mid-list edits
 * keep field focus (no index keys). Updates are functional so two patches
 * in one tick do not lose either.
 */
export function Repeater<T extends RepeaterItem>({
  legend,
  items,
  onChange,
  createItem,
  renderItem,
  addLabel,
  removeLabel = 'Remove',
  reorderable = false,
  itemName = (_item, position) => `row ${position}`,
}: Props<T>) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const apply = (fn: (rows: T[]) => T[]) => {
    onChange(fn);
  };
  const move = (from: number, to: number) =>
    apply((rows) => {
      if (to < 0 || to >= rows.length || to === from) return rows;
      const next = [...rows];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
  const drag = useDragReorder({
    ids: items.map((item) => item.id),
    list: rowsRef,
    onMove: move,
  });

  const removeItem = (id: string) =>
    apply((rows) => rows.filter((row) => row.id !== id));

  return (
    <fieldset className="workspace-repeat">
      <legend>{legend}</legend>
      <div ref={rowsRef} className="workspace-repeat__items">
        {items.map((item, position) => (
          <div
            key={item.id}
            className={
              drag.dragging === item.id
                ? 'workspace-repeat__item workspace-repeat__item--dragging'
                : 'workspace-repeat__item'
            }
          >
            {renderItem(item, {
              update: (patch) =>
                apply((rows) =>
                  rows.map((row) =>
                    row.id === item.id ? { ...row, ...patch } : row,
                  ),
                ),
              remove: () => removeItem(item.id),
            })}
            <div className="workspace-repeat__actions">
              {reorderable ? (
                <DragHandle
                  item={itemName(item, position + 1)}
                  position={position + 1}
                  count={items.length}
                  onMove={(by) => move(position, position + by)}
                  onPointerDown={drag.start(item.id)}
                />
              ) : null}
              <Button
                variant="danger"
                // Positional, human-readable names (row ids are ULIDs).
                aria-label={`${removeLabel} ${position + 1}`}
                onClick={() => removeItem(item.id)}
              >
                {removeLabel}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button onClick={() => apply((rows) => [...rows, createItem()])}>
        {addLabel}
      </Button>
    </fieldset>
  );
}
