import type { ReactNode } from 'react';
import { Button } from './Button';

export type RepeaterItem = { id: string };

type Props<T extends RepeaterItem> = {
  legend: string;
  items: T[];
  onChange: (items: T[]) => void;
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
};

/**
 * Fieldset repeater with stable `id` keys so reordering / mid-list edits
 * keep field focus (no index keys).
 */
export function Repeater<T extends RepeaterItem>({
  legend,
  items,
  onChange,
  createItem,
  renderItem,
  addLabel,
  removeLabel = 'Remove',
}: Props<T>) {
  return (
    <fieldset className="admin-repeat">
      <legend>{legend}</legend>
      {items.map((item, index) => (
        <div className="admin-repeat__item" key={item.id}>
          {renderItem(item, {
            update: (patch) =>
              onChange(
                items.map((row, i) =>
                  i === index ? { ...row, ...patch } : row,
                ),
              ),
            remove: () => onChange(items.filter((_, i) => i !== index)),
          })}
          <Button
            variant="danger"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            {removeLabel}
          </Button>
        </div>
      ))}
      <Button onClick={() => onChange([...items, createItem()])}>
        {addLabel}
      </Button>
    </fieldset>
  );
}
