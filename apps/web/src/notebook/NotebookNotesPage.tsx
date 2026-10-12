import { useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import {
  errorMessage,
  useCreateNoteMutation,
  useLoadAllPages,
  useNotesQuery,
  useTasksQuery,
  type NotebookArea,
} from '@gagnechris/app-core';
import {
  noteDay,
  noteDayLabel,
  noteFirstLine,
  noteOpenTaskCount,
  noteSections,
  noteTitle,
  type NoteType,
} from '@gagnechris/shared';
import { createUlid } from '../lib/ulid';
import SegmentedRadio from '../workspace/ui/SegmentedRadio';
import { areaForNewItem, areaQueryParam } from './notebookAreaPreference';
import type { NotebookOutletContext } from './NotebookLayout';
import { useLocalToday } from './useLocalToday';
import { useNotebookExport } from './useNotebookExport';
import { noteHref } from './noteHref';

type TypeFilter = 'all' | NoteType;

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'daily', label: 'Daily' },
  { value: 'page', label: 'Pages' },
] as const;

const AREA_LABEL: Record<NotebookArea, string> = {
  work: 'Work',
  personal: 'Personal',
};

export default function NotebookNotesPage() {
  const { areaFilter } = useOutletContext<NotebookOutletContext>();
  const navigate = useNavigate();
  const today = useLocalToday();
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const area = areaQueryParam(areaFilter);

  // Sections need every note: list pages are grouped by partition, not date.
  const notesQuery = useNotesQuery({
    area,
    type: typeFilter === 'all' ? undefined : typeFilter,
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
    const all = notesQuery.data?.pages.flatMap((page) => page.items) ?? [];
    const needle = q.trim().toLowerCase();
    const matching = needle
      ? all.filter(
          (n) =>
            noteTitle(n).toLowerCase().includes(needle) ||
            noteFirstLine(n.bodyMarkdown).toLowerCase().includes(needle),
        )
      : all;
    return noteSections(matching, today);
  }, [notesQuery.data, q, today]);

  const createPage = async () => {
    try {
      const note = await createMutation.mutateAsync({
        id: createUlid(),
        area: areaForNewItem(areaFilter),
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
            Daily notes and pages
            {areaFilter === 'all'
              ? ' · all areas'
              : ` · ${AREA_LABEL[areaFilter]}`}
          </p>
        </div>
        <div className="workspace-panel__actions">
          <button
            type="button"
            className="kit-btn"
            onClick={() => void exportZip()}
            disabled={exportBusy}
            aria-busy={exportBusy}
            title="Download every note and task as markdown and JSON"
          >
            {exportBusy ? 'Exporting…' : 'Export'}
          </button>
          <button
            type="button"
            className="kit-btn kit-btn--primary"
            disabled={createMutation.isPending}
            onClick={() => void createPage()}
          >
            New page
          </button>
        </div>
      </div>
      {createMutation.error ? (
        <p className="workspace-panel__error" role="alert">
          {errorMessage(createMutation.error, 'Could not create the page.')}
        </p>
      ) : null}
      {exportError ? (
        <p className="workspace-panel__error" role="alert">
          Export failed: {exportError}
        </p>
      ) : null}

      <div className="notebook-notes__filters">
        <input
          className="kit-input"
          type="search"
          placeholder="Search notes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
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
                            areaFilter === 'all' ? AREA_LABEL[note.area] : '',
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
