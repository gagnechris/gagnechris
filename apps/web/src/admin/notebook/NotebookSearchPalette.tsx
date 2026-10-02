import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotebookSearchQuery } from '@gagnechris/app-core';
import { areaQueryParam } from './notebookAreaPreference';
import type { NotebookAreaFilter } from './notebookAreaPreference';

type Props = {
  open: boolean;
  onClose: () => void;
  areaFilter: NotebookAreaFilter;
};

function highlight(snippet: string, matches: { start: number; end: number }[]) {
  if (matches.length === 0) return snippet;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [i, m] of matches.entries()) {
    if (m.start > cursor) parts.push(snippet.slice(cursor, m.start));
    parts.push(
      <mark key={`${i}-${m.start}`}>{snippet.slice(m.start, m.end)}</mark>,
    );
    cursor = m.end;
  }
  if (cursor < snippet.length) parts.push(snippet.slice(cursor));
  return parts;
}

export default function NotebookSearchPalette({
  open,
  onClose,
  areaFilter,
}: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState('');
  const [areaOnly, setAreaOnly] = useState(true);
  const area = areaOnly ? areaQueryParam(areaFilter) : undefined;

  const search = useNotebookSearchQuery(
    { q, area, limit: 12 },
    open && q.trim().length > 0,
  );

  const flat = useMemo(() => {
    const notes = (search.data?.notes ?? []).map((h) => ({
      ...h,
      href: `/admin/notebook/notes/${h.id}`,
      group: 'Notes' as const,
    }));
    const tasks = (search.data?.tasks ?? []).map((h) => ({
      ...h,
      href: `/admin/notebook/tasks/${h.id}`,
      group: 'Tasks' as const,
    }));
    return [...notes, ...tasks];
  }, [search.data]);

  const [active, setActive] = useState(0);
  // Clamp selection when the result list shrinks (no effect / setState).
  const safeActive =
    flat.length === 0 ? 0 : Math.min(active, flat.length - 1);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    void navigate(href);
  };

  return (
    <div
      className="notebook-search"
      role="dialog"
      aria-modal="true"
      aria-label="Search notes and tasks"
    >
      <button
        type="button"
        className="notebook-search__backdrop"
        aria-label="Close search"
        onClick={onClose}
      />
      <div className="notebook-search__panel">
        <div className="notebook-search__toolbar">
          <input
            ref={inputRef}
            className="admin-input notebook-search__input"
            type="search"
            placeholder="Search notes and tasks…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            aria-controls={listId}
            aria-autocomplete="list"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) =>
                  Math.min(i + 1, Math.max(flat.length - 1, 0)),
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && flat[safeActive]) {
                e.preventDefault();
                go(flat[safeActive]!.href);
              }
            }}
          />
          <label className="admin-check notebook-search__area">
            <input
              type="checkbox"
              checked={areaOnly && areaFilter !== 'all'}
              disabled={areaFilter === 'all'}
              onChange={(e) => setAreaOnly(e.target.checked)}
            />
            Current area only
          </label>
        </div>

        <div id={listId} className="notebook-search__results" role="listbox">
          {!q.trim() ? (
            <p className="admin-hint">Type to search. Esc to close.</p>
          ) : null}
          {search.isFetching ? <p className="admin-hint">Searching…</p> : null}
          {search.isError ? (
            <p className="admin-panel__error" role="alert">
              Search failed.
            </p>
          ) : null}
          {q.trim() && !search.isFetching && flat.length === 0 ? (
            <p className="admin-hint">No matches.</p>
          ) : null}

          {(['Notes', 'Tasks'] as const).map((group) => {
            const items = flat.filter((h) => h.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group} className="notebook-search__group">
                <h3>{group}</h3>
                <ul>
                  {items.map((hit) => {
                    const index = flat.indexOf(hit);
                    return (
                      <li key={`${hit.type}-${hit.id}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === safeActive}
                          className={
                            index === safeActive
                              ? 'notebook-search__hit notebook-search__hit--active'
                              : 'notebook-search__hit'
                          }
                          onMouseEnter={() => setActive(index)}
                          onClick={() => go(hit.href)}
                        >
                          <span className="notebook-search__hit-title">
                            {hit.title}
                            <span className="admin-badge">{hit.area}</span>
                          </span>
                          <span className="notebook-search__hit-snippet">
                            {highlight(hit.snippet, hit.matches)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
