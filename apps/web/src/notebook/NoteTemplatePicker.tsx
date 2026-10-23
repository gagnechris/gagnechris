import { useState } from 'react';
import { Combobox } from '@gagnechris/ui';
import { Link } from 'react-router-dom';
import {
  useNoteTemplatesQuery,
  type NotebookArea,
  type NoteTemplate,
} from '@gagnechris/app-core';
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
  area,
  onChoose,
}: {
  area: NotebookArea;
  onChoose: (template: NoteTemplate) => void;
}) {
  const query = useNoteTemplatesQuery({ area });
  const [filter, setFilter] = useState('');
  const items = filterNoteTemplates(query.data ?? [], filter);

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
      <p className="task-syntax__heading">Insert template</p>
      <Combobox
        type="search"
        aria-label="Filter templates"
        listLabel="Templates"
        placeholder="Filter templates"
        autoFocus
        value={filter}
        onValueChange={setFilter}
        options={items.map((template) => ({
          id: template.id,
          label: template.name,
          meta: preview(template.bodyMarkdown),
          template,
        }))}
        onPick={(option) => onChoose(option.template)}
        // Escape closes the whole picker, not only its list.
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.preventDefault();
        }}
        emptyText="No templates match."
      />
    </div>
  );
}
