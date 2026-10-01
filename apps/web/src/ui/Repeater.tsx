import type { ReactNode } from 'react';
import { Button } from './Button';

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
  /** When true, show Move up / Move down controls (CHR-158). */
  reorderable?: boolean;
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
}: Props<T>) {
  const apply = (fn: (rows: T[]) => T[]) => {
    onChange(fn);
  };

  return (
    <fieldset className="admin-repeat">
      <legend>{legend}</legend>
      {items.map((item) => (
        <div className="admin-repeat__item" key={item.id}>
          {renderItem(item, {
            update: (patch) =>
              apply((rows) =>
                rows.map((row) =>
                  row.id === item.id ? { ...row, ...patch } : row,
                ),
              ),
            remove: () =>
              apply((rows) => rows.filter((row) => row.id !== item.id)),
          })}
          <div className="admin-repeat__actions">
            {reorderable ? (
              <>
                <Button
                  onClick={() =>
                    apply((rows) => {
                      const index = rows.findIndex((row) => row.id === item.id);
                      if (index <= 0) return rows;
                      const next = [...rows];
                      const tmp = next[index - 1]!;
                      next[index - 1] = next[index]!;
                      next[index] = tmp;
                      return next;
                    })
                  }
                >
                  Move up
                </Button>
                <Button
                  onClick={() =>
                    apply((rows) => {
                      const index = rows.findIndex((row) => row.id === item.id);
                      if (index < 0 || index >= rows.length - 1) return rows;
                      const next = [...rows];
                      const tmp = next[index + 1]!;
                      next[index + 1] = next[index]!;
                      next[index] = tmp;
                      return next;
                    })
                  }
                >
                  Move down
                </Button>
              </>
            ) : null}
            <Button
              variant="danger"
              onClick={() =>
                apply((rows) => rows.filter((row) => row.id !== item.id))
              }
            >
              {removeLabel}
            </Button>
          </div>
        </div>
      ))}
      <Button onClick={() => apply((rows) => [...rows, createItem()])}>
        {addLabel}
      </Button>
    </fieldset>
  );
}
