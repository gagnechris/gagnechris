import { useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  dailyTemplateResource,
  errorMessage,
  useResetDailyTemplateMutation,
  type NotebookArea,
} from '@gagnechris/app-core';
import {
  addDays,
  DAILY_TEMPLATE_DATE_TOKEN,
  DAILY_TEMPLATE_TASK_MESSAGE,
  dailyTemplateHasTasks,
  fillDailyTemplate,
  formatCalendarDay,
  NOTEBOOK_AREA_LABELS,
} from '@gagnechris/shared';
import type { MarkdownEditorHandle } from '../kit/markdown/MarkdownEditor';
import { LazyMarkdownPreview } from '../kit/markdown/LazyMarkdownPreview';
import { SaveIndicator } from '../workspace/ui/SaveIndicator';
import SegmentedRadio from '../workspace/ui/SegmentedRadio';
import { useWorkspaceDocEditor } from '../workspace/useWorkspaceDocEditor';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';
import type { NotebookOutletContext } from './NotebookLayout';
import { useLocalToday } from './useLocalToday';

const AREAS: NotebookArea[] = ['work', 'personal'];

const AREA_OPTIONS = AREAS.map((value) => ({
  value,
  label: NOTEBOOK_AREA_LABELS[value],
}));

type TemplateDraft = { bodyMarkdown: string };

function TemplateEditor({ area }: { area: NotebookArea }) {
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const tomorrow = addDays(useLocalToday(), 1);
  const editor = useWorkspaceDocEditor({
    resource: dailyTemplateResource,
    params: { area },
    initialDraft: { bodyMarkdown: '' } satisfies TemplateDraft,
    toDraft: (template) => ({ bodyMarkdown: template.bodyMarkdown }),
    getEntityId: (template) => template.area,
    toPayload: (draft) => ({ bodyMarkdown: draft.bodyMarkdown }),
    conflictMessage:
      'Another device changed this template. Reload to see its version.',
    loadErrorFallback: 'Could not load the template.',
  });
  const reset = useResetDailyTemplateMutation();
  // Text with a task line is shown but never saved: autosave keeps the last
  // valid template until the line is fixed.
  const [invalidText, setInvalidText] = useState<string | null>(null);
  const { draft, updateDraft, entity, dirty, saveState, save } = editor;
  const text = invalidText ?? draft.bodyMarkdown;

  const onChange = (next: string) => {
    if (dailyTemplateHasTasks(next)) {
      setInvalidText(next);
      return;
    }
    setInvalidText(null);
    updateDraft(() => ({ bodyMarkdown: next }));
  };

  const insertDate = () => {
    const handle = editorRef.current;
    if (handle?.view()) {
      handle.insertText(DAILY_TEMPLATE_DATE_TOKEN);
      handle.focus();
    } else {
      onChange(`${text}${DAILY_TEMPLATE_DATE_TOKEN}`);
    }
  };

  const unchanged =
    invalidText === null && !dirty && entity?.isDefault === true;
  const resetToDefault = async () => {
    setInvalidText(null);
    await save();
    reset.mutate(area);
  };

  if (editor.loadError || editor.isLoading || !entity) {
    return editor.loadError ? (
      <p className="admin-panel__error" role="alert">
        {editor.loadError}
      </p>
    ) : (
      <p>Loading template…</p>
    );
  }

  const label = NOTEBOOK_AREA_LABELS[area];
  const error =
    editor.saveError ??
    (reset.error
      ? errorMessage(reset.error, 'Could not reset the template.')
      : null);

  return (
    <div className="notebook-templates">
      <section
        className="notebook-templates__editor"
        aria-label={`${label} template`}
      >
        <div className="notebook-templates__bar">
          <h2>{label} template</h2>
          <div className="notebook-templates__actions">
            <SaveIndicator saveState={saveState} dirty={dirty} />
            <button type="button" className="admin-btn" onClick={insertDate}>
              Insert date
            </button>
            <button
              type="button"
              className="admin-btn"
              disabled={unchanged || reset.isPending}
              onClick={() => void resetToDefault()}
            >
              Reset to default
            </button>
          </div>
        </div>
        {error ? (
          <p className="admin-panel__error" role="alert">
            {error}
          </p>
        ) : null}
        {invalidText !== null ? (
          <p className="admin-panel__error" role="alert">
            {DAILY_TEMPLATE_TASK_MESSAGE}
          </p>
        ) : null}
        <NotebookMarkdownBody
          editorRef={editorRef}
          value={text}
          onChange={onChange}
          label={`${label} template`}
          placeholder="Write what each new day starts with…"
        />
        <p className="admin-hint">
          Headings, lists and checklists. {DAILY_TEMPLATE_DATE_TOKEN} fills in
          the day when the note is created.
        </p>
      </section>
      <aside className="notebook-templates__side">
        <section className="notebook-card" aria-labelledby="template-preview">
          <h2 id="template-preview">Tomorrow’s note will start as</h2>
          <p className="notebook-card__meta">
            {label} ·{' '}
            {formatCalendarDay(tomorrow, { weekday: 'long', month: 'long' })}
          </p>
          <div className="notebook-card__preview">
            <LazyMarkdownPreview
              markdown={fillDailyTemplate(text, { area, date: tomorrow })}
            />
          </div>
        </section>
        <section className="notebook-card" aria-labelledby="template-rules">
          <h2 id="template-rules">How templates work</h2>
          <ul>
            <li>
              A new day’s note starts with the template, but isn’t saved until
              you type. Just looking at a day doesn’t create a note.
            </li>
            <li>
              Editing a template only affects notes you haven’t started yet.
            </li>
            <li>
              Use <code>- [ ]</code> for a checklist. Real tasks (
              <code>[ ] text</code>) aren’t allowed here, so they don’t pile up
              every day.
            </li>
            <li>
              <code>{'{{weekday}}'}</code>, <code>{'{{date}}'}</code> and{' '}
              <code>{'{{area}}'}</code> are filled in for each day.
            </li>
            <li>Templates sync to your phone and the iOS app.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

export default function NotebookTemplatesPage() {
  const { areaFilter } = useOutletContext<NotebookOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = searchParams.get('template');
  const area: NotebookArea =
    fromUrl === 'work' || fromUrl === 'personal'
      ? fromUrl
      : areaFilter === 'all'
        ? 'work'
        : areaFilter;

  return (
    <section className="admin-panel admin-panel--editor">
      <div className="admin-action-bar">
        <div className="notebook-today__title">
          <p className="notebook-today__kicker">Settings</p>
          <h1>Daily templates</h1>
        </div>
      </div>
      <p className="admin-panel__lede">
        Each new daily note starts from its area’s template. Notes you’ve
        already started never change.
      </p>
      <SegmentedRadio
        label="Template"
        options={AREA_OPTIONS}
        value={area}
        onChange={(next) =>
          setSearchParams(
            (params) => {
              params.set('template', next);
              return params;
            },
            { replace: true },
          )
        }
      />
      <TemplateEditor key={area} area={area} />
    </section>
  );
}
