import { useId, useState } from 'react';
import { addChipItems, type ChipLimits } from './chips';

type Props = ChipLimits & {
  label: string;
  listLabel: string;
  removeLabel: (item: string) => string;
  placeholder: string;
  fullPlaceholder?: string;
  /** Caps the typed text, which may hold several comma-separated items. */
  inputMaxLength?: number;
  value: readonly string[];
  onChange: (items: string[]) => void;
};

export function ChipsInput({
  label,
  listLabel,
  removeLabel,
  placeholder,
  fullPlaceholder,
  inputMaxLength,
  maxItems,
  maxItemLength,
  value,
  onChange,
}: Props) {
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
    <div className="admin-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="admin-chips">
        <ul className="admin-chips__list" aria-label={listLabel}>
          {value.map((item) => (
            <li key={item} className="admin-chip">
              {item}
              <button
                type="button"
                className="admin-chip__remove"
                aria-label={removeLabel(item)}
                onClick={() => onChange(value.filter((s) => s !== item))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <input
          id={inputId}
          className="admin-chips__input"
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
}
