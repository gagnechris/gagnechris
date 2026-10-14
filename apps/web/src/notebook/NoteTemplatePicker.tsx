import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNoteTemplatesQuery, type NoteTemplate } from '@gagnechris/app-core';
import { filterNoteTemplates, markdownPlainText } from '@gagnechris/shared';
import '../kit/tasks/taskSyntax.css';

const preview = (markdown: string) =>
  markdownPlainText(markdown)
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? '';

/** The template listbox; the field that owns the caret handles the keys. */
export function NoteTemplateOptions({
  baseId,
  templates,
  activeIndex,
  onActivate,
  onChoose,
}: {
  baseId: string;
  templates: readonly NoteTemplate[];
  activeIndex: number;
  onActivate: (index: number) => void;
  onChoose: (template: NoteTemplate) => void;
}) {
  return (
    <ul
      className="task-syntax__options"
      role="listbox"
      id={`${baseId}-listbox`}
      aria-labelledby={`${baseId}-heading`}
    >
      {templates.map((template, i) => (
        <li
          key={template.id}
          id={`${baseId}-${template.id}`}
          role="option"
          aria-selected={i === activeIndex}
          className="task-syntax__option"
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onActivate(i)}
          onClick={() => onChoose(template)}
        >
          <span>{template.name}</span>
          <span className="task-syntax__detail note-template-option__preview">
            {preview(template.bodyMarkdown)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Insert template… in a note's ⋯ menu: a filter field over the templates. */
export function NoteTemplatePicker({
  onChoose,
}: {
  onChoose: (template: NoteTemplate) => void;
}) {
  const baseId = useId();
  const query = useNoteTemplatesQuery();
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(0);
  const items = filterNoteTemplates(query.data ?? [], filter);
  const activeIndex = Math.min(active, items.length - 1);

  if (query.isPending) return <p className="kit-hint">Loading templates…</p>;
  if (query.error) {
    return (
      <p className="workspace-panel__error" role="alert">
        Could not load templates.
      </p>
    );
  }
  if (query.data.length === 0) {
    return (
      <p className="kit-hint">
        No templates yet.{' '}
        <Link to="/settings/note-templates">Create one in Settings</Link>.
      </p>
    );
  }

  return (
    <div className="note-template-picker">
      <p className="task-syntax__heading" id={`${baseId}-heading`}>
        Insert template
      </p>
      <input
        className="kit-input"
        type="search"
        aria-label="Filter templates"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${baseId}-listbox`}
        aria-activedescendant={
          items[activeIndex] ? `${baseId}-${items[activeIndex].id}` : undefined
        }
        placeholder="Filter templates"
        autoFocus
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (items.length === 0) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((activeIndex + step + items.length) % items.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            onChoose(items[activeIndex]!);
          }
        }}
      />
      {items.length === 0 ? (
        <p className="kit-hint">No templates match.</p>
      ) : (
        <NoteTemplateOptions
          baseId={baseId}
          templates={items}
          activeIndex={activeIndex}
          onActivate={setActive}
          onChoose={onChoose}
        />
      )}
    </div>
  );
}
