import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import {
  errorMessage,
  useCreateNoteMutation,
  useLoadAllPages,
  useNotesQuery,
  useTasksQuery,
} from '@gagnechris/app-core';
import {
  noteDay,
  noteDayLabel,
  noteFirstLine,
  noteOpenTaskCount,
  noteSections,
  noteTitle,
} from '@gagnechris/shared';
import { createUlid } from '../lib/ulid';
import {
  Button,
  DateInput,
  Field,
  SearchInput,
  SegmentedRadio,
  useDismiss,
} from '@gagnechris/ui';
import type { NotebookOutletContext } from './NotebookLayout';
import { useLocalToday } from './useLocalToday';
import { useNotebookExport } from './useNotebookExport';
import { noteHref } from './noteHref';

type TypeFilter = 'all' | 'daily' | 'page' | 'archived';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'daily', label: 'Daily' },
  { value: 'page', label: 'Standing' },
  { value: 'archived', label: 'Archived' },
] as const;

export default function NotebookNotesPage() {
  const { area, areaName } = useOutletContext<NotebookOutletContext>();
  const navigate = useNavigate();
  const today = useLocalToday();
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  // Sections need every note: list pages are grouped by partition, not date.
  const notesQuery = useNotesQuery({
    area,
    type:
      typeFilter === 'all'
        ? undefined
        : typeFilter === 'daily'
          ? 'daily'
          : 'page',
    limit: 100,
  });
  useLoadAllPages(notesQuery);
  // All areas: a note can embed a task from the other area.
  const openTasks = useTasksQuery({ open: true, limit: 100 });
  useLoadAllPages(openTasks);

  const openIds = useMemo(
    () =>
      openTasks.hasNextPage
        ? null
        : new Set(
            openTasks.data?.pages.flatMap((p) => p.items.map((t) => t.id)) ??
              [],
          ),
    [openTasks.data, openTasks.hasNextPage],
  );

  const createMutation = useCreateNoteMutation();
  const {
    exportZip,
    busy: exportBusy,
    error: exportError,
  } = useNotebookExport();

  const sections = useMemo(() => {
    const showArchived = typeFilter === 'archived';
    const all = (
      notesQuery.data?.pages.flatMap((page) => page.items) ?? []
    ).filter((n) => Boolean(n.archived) === showArchived);
    const needle = q.trim().toLowerCase();
    const matching = needle
      ? all.filter(
          (n) =>
            noteTitle(n).toLowerCase().includes(needle) ||
            noteFirstLine(n.bodyMarkdown).toLowerCase().includes(needle),
        )
      : all;
    return noteSections(matching, today);
  }, [notesQuery.data, q, today, typeFilter]);

  const createStandingNote = async () => {
    try {
      const note = await createMutation.mutateAsync({
        id: createUlid(),
        area,
        type: 'page',
        title: 'Untitled',
        bodyMarkdown: '',
        tags: [],
        pinned: false,
      });
      void navigate(`/notes/${note.id}`);
    } catch {
      // The mutation's error is rendered below.
    }
  };

  const loading = notesQuery.isPending || notesQuery.hasNextPage;

  return (
    <section className="workspace-panel notebook-notes">
      <div className="workspace-panel__header">
        <div>
          <h1>Notes</h1>
          <p className="workspace-panel__lede">
            Daily notes and standing notes · {areaName}
          </p>
        </div>
        <div className="workspace-panel__actions">
          <Button
            onClick={() => void exportZip()}
            disabled={exportBusy}
            aria-busy={exportBusy}
            title="Download every note and task as markdown and JSON"
          >
            {exportBusy ? 'Exporting…' : 'Export'}
          </Button>
          <NewNoteMenu
            today={today}
            creating={createMutation.isPending}
            onDay={(date) => void navigate(`/today?date=${date}&area=${area}`)}
            onStanding={() => void createStandingNote()}
          />
        </div>
      </div>
      {createMutation.error ? (
        <p className="workspace-panel__error" role="alert">
          {errorMessage(createMutation.error, 'Could not create the note.')}
        </p>
      ) : null}
      {exportError ? (
        <p className="workspace-panel__error" role="alert">
          Export failed: {exportError}
        </p>
      ) : null}

      <div className="notebook-notes__filters">
        <SearchInput
          placeholder="Search notes"
          value={q}
          onValueChange={setQ}
          aria-label="Search notes"
        />
        <SegmentedRadio
          label="Note type"
          options={TYPE_OPTIONS}
          value={typeFilter}
          onChange={setTypeFilter}
          className="notebook-notes__type"
        />
      </div>

      {notesQuery.isError ? (
        <p className="workspace-panel__error" role="alert">
          Could not load notes.
        </p>
      ) : loading ? (
        <p className="kit-hint">Loading notes…</p>
      ) : sections.length === 0 ? (
        <p className="kit-hint">No notes match.</p>
      ) : (
        sections.map((section) => (
          <section
            key={section.key}
            className="notebook-notes__section"
            aria-labelledby={`notes-${section.key}`}
          >
            <h2 id={`notes-${section.key}`}>{section.label}</h2>
            <ul className="notebook-notes__list">
              {section.notes.map((note) => {
                const open = noteOpenTaskCount(note.bodyMarkdown, openIds);
                const firstLine = noteFirstLine(note.bodyMarkdown);
                return (
                  <li key={note.id} data-note-id={note.id}>
                    <Link to={noteHref(note)} className="notebook-notes__row">
                      <span className="notebook-notes__title">
                        {noteTitle(note)}
                      </span>
                      <span className="notebook-notes__meta">
                        {firstLine ? (
                          <span className="notebook-notes__first-line">
                            {firstLine}
                          </span>
                        ) : null}
                        <span className="notebook-notes__when">
                          {firstLine ? ' · ' : ''}
                          {[
                            noteDayLabel(noteDay(note), today),
                            open > 0 ? `${open} open` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}

function NewNoteMenu({
  today,
  creating,
  onDay,
  onStanding,
}: {
  today: string;
  creating: boolean;
  onDay: (date: string) => void;
  onStanding: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(today);
  const panelId = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback(() => {
    const focusInside = anchor.current?.contains(document.activeElement);
    setOpen(false);
    if (focusInside) triggerRef.current?.focus();
  }, []);
  useDismiss(open, dismiss, anchor);

  return (
    <span ref={anchor} className="note-menu">
      <Button
        ref={triggerRef}
        variant="primary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) setDay(today);
          setOpen((v) => !v);
        }}
      >
        New
      </Button>
      {open ? (
        <div
          id={panelId}
          className="note-menu__panel"
          role="group"
          aria-label="New note"
        >
          <form
            className="notebook-new-note__day"
            onSubmit={(e) => {
              e.preventDefault();
              if (day) onDay(day);
            }}
          >
            <Field label="Note for a day">
              <DateInput
                value={day}
                required
                onChange={(e) => setDay(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={!day}>
              Open day
            </Button>
          </form>
          <Button
            variant="ghost"
            className="notebook-new-note__standing"
            disabled={creating}
            onClick={() => {
              setOpen(false);
              onStanding();
            }}
          >
            Standing note
          </Button>
        </div>
      ) : null}
    </span>
  );
}
