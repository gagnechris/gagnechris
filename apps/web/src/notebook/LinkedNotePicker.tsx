import { useId, useState } from 'react';
import { useNotebookSearchQuery, useNotesByIds } from '@gagnechris/app-core';
import { noteTitle } from '@gagnechris/shared';
import { Combobox } from '@gagnechris/ui';
import { useDebouncedValue } from '../kit/useDebouncedValue';
import { useNotebookAreaName } from './useNotebookAreaName';

type Props = {
  value: string;
  onChange: (noteId: string) => void;
};

type Option = { id: string; label: string; meta?: string; noteId: string };

const NONE: Option = { id: 'none', label: 'None', noteId: '' };

/** Finds notes through search, so the task page never loads the whole notebook. */
export function LinkedNotePicker({ value, onChange }: Props) {
  const areaName = useNotebookAreaName();
  const id = useId();
  const [query, setQuery] = useState<string | null>(null);
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

  const searching = query !== null;
  const options: Option[] = searching
    ? [
        ...(value ? [NONE] : []),
        ...(search.data?.notes ?? []).map((hit) => ({
          id: hit.id,
          noteId: hit.id,
          label: hit.title || hit.date || 'Untitled',
          meta: areaName(hit.area),
        })),
      ]
    : [];

  return (
    <div className="kit-field notebook-note-picker">
      <label htmlFor={`${id}-input`}>Linked note</label>
      <Combobox
        id={`${id}-input`}
        listLabel="Notes"
        placeholder="Search notes"
        value={query ?? linkedLabel}
        onValueChange={setQuery}
        options={options}
        onPick={(option) => {
          onChange(option.noteId);
          setQuery(null);
        }}
        loading={searching && search.isFetching && options.length === 0}
        emptyText={searchText ? 'No notes match.' : 'Type to search notes'}
        onFocus={(e) => e.target.select()}
        onBlur={() => setQuery(null)}
        onKeyDown={(e) => {
          if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !searching) {
            setQuery('');
          } else if (e.key === 'Escape' && searching) {
            setQuery(null);
          }
        }}
      />
    </div>
  );
}
