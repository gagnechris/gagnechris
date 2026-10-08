import { useMemo } from 'react';
import { useLoadAllPages, useNotesQuery } from '@gagnechris/app-core';
import { noteDay, noteTitle } from '@gagnechris/shared';
import { Field, Select } from '../kit/Field';
import { NOTEBOOK_AREA_LABELS } from './notebookAreaPreference';

type Props = {
  value: string;
  onChange: (noteId: string) => void;
};

const AREAS = ['work', 'personal'] as const;

export function LinkedNotePicker({ value, onChange }: Props) {
  const notesQuery = useNotesQuery({ limit: 100 });
  useLoadAllPages(notesQuery);

  const groups = useMemo(() => {
    const notes = (notesQuery.data?.pages.flatMap((p) => p.items) ?? [])
      .filter((note) => !note.deleted)
      .sort((a, b) => noteDay(b).localeCompare(noteDay(a)));
    return AREAS.map((area) => ({
      area,
      notes: notes.filter((note) => note.area === area),
    })).filter((group) => group.notes.length > 0);
  }, [notesQuery.data]);

  const loading = notesQuery.isPending || notesQuery.hasNextPage;
  const known = groups.some((g) => g.notes.some((note) => note.id === value));

  return (
    <Field label="Linked note">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {value && !known ? (
          <option value={value}>
            {loading ? 'Loading notes…' : 'A note that no longer exists'}
          </option>
        ) : null}
        {groups.map(({ area, notes }) => (
          <optgroup key={area} label={NOTEBOOK_AREA_LABELS[area]}>
            {notes.map((note) => (
              <option key={note.id} value={note.id}>
                {noteTitle(note)}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </Field>
  );
}
