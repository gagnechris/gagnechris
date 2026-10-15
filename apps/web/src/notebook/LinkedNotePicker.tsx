import { useId, useState } from 'react';
import { useNotebookSearchQuery, useNotesByIds } from '@gagnechris/app-core';
import { noteTitle } from '@gagnechris/shared';
import { useDebouncedValue } from '../kit/useDebouncedValue';
import { useNotebookAreaName } from './useNotebookAreaName';

type Props = {
  value: string;
  onChange: (noteId: string) => void;
};

type Option = { id: string; label: string; detail?: string };

const NONE: Option = { id: '', label: 'None' };

/** Finds notes through search, so the task page never loads the whole notebook. */
export function LinkedNotePicker({ value, onChange }: Props) {
  const areaName = useNotebookAreaName();
  const id = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const searchText = useDebouncedValue(query?.trim() ?? '', 200);

  const [linked] = useNotesByIds(value ? [value] : []);
  const search = useNotebookSearchQuery(
    { q: searchText, limit: 10 },
    query !== null,
  );

  const linkedLabel = !value
    ? ''
    : linked?.data && !linked.data.deleted
      ? noteTitle(linked.data)
      : linked?.error || linked?.data?.deleted
        ? 'A note that no longer exists'
        : 'Loading note…';

  const open = query !== null;
  const options: Option[] = open
    ? [
        ...(value ? [NONE] : []),
        ...(search.data?.notes ?? []).map((hit) => ({
          id: hit.id,
          label: hit.title || hit.date || 'Untitled',
          detail: areaName(hit.area),
        })),
      ]
    : [];
  const activeIndex = Math.min(active, options.length - 1);

  const choose = (option: Option) => {
    onChange(option.id);
    setQuery(null);
  };

  return (
    <div className="kit-field notebook-note-picker">
      <label htmlFor={`${id}-input`}>Linked note</label>
      <input
        id={`${id}-input`}
        className="kit-input"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeIndex >= 0 ? `${id}-${activeIndex}` : undefined
        }
        placeholder="Search notes"
        value={query ?? linkedLabel}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onBlur={() => setQuery(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) setQuery('');
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((i) =>
              options.length ? (i + step + options.length) % options.length : 0,
            );
          } else if (e.key === 'Enter' && open && options[activeIndex]) {
            e.preventDefault();
            choose(options[activeIndex]);
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            setQuery(null);
          }
        }}
      />
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label="Notes"
        className="notebook-note-picker__list"
        hidden={!open || options.length === 0}
      >
        {options.map((option, i) => (
          <li
            key={option.id || 'none'}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === activeIndex}
            className="notebook-note-picker__option"
            // Keep focus in the input so blur doesn't close the list first.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(option)}
          >
            {option.label}
            {option.detail ? (
              <span className="kit-hint"> · {option.detail}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {open && searchText && search.isSuccess && options.length === 0 ? (
        <span className="kit-hint">No notes match.</span>
      ) : null}
    </div>
  );
}
