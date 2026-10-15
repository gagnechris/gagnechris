/** @jsxRuntime automatic */
import { useId, useState } from 'react';
import { Chip } from './Chip.js';

type Limits = { maxItems?: number; maxItemLength?: number };

/** Adds comma-separated items from typed text, skipping blanks and case-insensitive duplicates. */
const addChipItems = (
  items: readonly string[],
  text: string,
  { maxItems = Infinity, maxItemLength }: Limits = {},
): string[] => {
  const next = [...items];
  for (const raw of text.split(',')) {
    const item = raw.trim().slice(0, maxItemLength);
    if (!item || next.length >= maxItems) continue;
    if (next.some((s) => s.toLowerCase() === item.toLowerCase())) continue;
    next.push(item);
  }
  return next;
};

type Props = Limits & {
  label: string;
  /** Names the list of chips. */
  listLabel: string;
  /** What each chip's remove button names, read as "Remove {itemLabel}". */
  itemLabel?: (item: string) => string;
  placeholder: string;
  /** Shown once `maxItems` is reached. */
  fullPlaceholder?: string;
  /** Caps the typed text, which may hold several comma-separated items. */
  inputMaxLength?: number;
  value: readonly string[];
  onChange: (items: string[]) => void;
};

/**
 * Short values typed as chips: Enter, a comma or leaving the box adds one;
 * Backspace on an empty box removes the last.
 */
export const ChipsInput = ({
  label,
  listLabel,
  itemLabel = (item) => item,
  placeholder,
  fullPlaceholder,
  inputMaxLength,
  maxItems,
  maxItemLength,
  value,
  onChange,
}: Props) => {
  const [text, setText] = useState('');
  const inputId = useId();
  const full = maxItems !== undefined && value.length >= maxItems;

  const add = (raw: string) => {
    const next = addChipItems(value, raw, { maxItems, maxItemLength });
    if (next.length !== value.length) onChange(next);
  };

  const commit = () => {
    if (!text.trim()) return;
    add(text);
    setText('');
  };

  return (
    <div className="kit-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="ui-chips">
        <ul className="ui-chips__list" aria-label={listLabel}>
          {value.map((item) => (
            <li key={item}>
              <Chip
                removeLabel={itemLabel(item)}
                onRemove={() => onChange(value.filter((s) => s !== item))}
              >
                {item}
              </Chip>
            </li>
          ))}
        </ul>
        <input
          id={inputId}
          className="ui-chips__input"
          value={text}
          maxLength={inputMaxLength}
          disabled={full}
          placeholder={full && fullPlaceholder ? fullPlaceholder : placeholder}
          onChange={(e) => {
            const next = e.target.value;
            if (next.includes(',')) {
              add(next);
              setText('');
            } else {
              setText(next);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={commit}
        />
      </div>
    </div>
  );
};
