import { useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
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
  dailyTemplateNamedWeekday,
  dailyTemplateWeekdayMessage,
  dailyTemplateHeadings,
  fillDailyTemplate,
  formatCalendarDay,
} from '@gagnechris/shared';
import { Button, Field, Select } from '@gagnechris/ui';
import type { MarkdownEditorHandle } from '../kit/markdown/MarkdownEditor';
import { LazyMarkdownPreview } from '../kit/markdown/LazyMarkdownPreview';
import { SaveIndicator } from '../workspace/ui/SaveIndicator';
import { useWorkspaceDocEditor } from '../workspace/useWorkspaceDocEditor';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';
import type { NotebookOutletContext } from './NotebookLayout';
import NotebookAreaSwitch from './NotebookAreaSwitch';
import { useLocalToday } from './useLocalToday';

type TemplateDraft = { bodyMarkdown: string; carryOverSection: string | null };

const INITIAL_DRAFT: TemplateDraft = {
  bodyMarkdown: '',
  carryOverSection: null,
};

/** A section the text no longer has reads as the first one, as the API treats it. */
const carryOverSection = (draft: TemplateDraft) =>
  draft.carryOverSection !== null &&
  dailyTemplateHeadings(draft.bodyMarkdown).includes(draft.carryOverSection)
    ? draft.carryOverSection
    : null;

function TemplateEditor({
  area,
  areaName: label,
}: {
  area: NotebookArea;
  areaName: string;
}) {
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const tomorrow = addDays(useLocalToday(), 1);
  const editor = useWorkspaceDocEditor({
    resource: dailyTemplateResource,
    params: { area },
    initialDraft: INITIAL_DRAFT,
    toDraft: (template): TemplateDraft => ({
      bodyMarkdown: template.bodyMarkdown,
      carryOverSection: template.carryOverSection,
    }),
    getEntityId: (template) => template.area,
    toPayload: (draft) => ({
      bodyMarkdown: draft.bodyMarkdown,
      carryOverSection: carryOverSection(draft),
    }),
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
    updateDraft((current) => ({ ...current, bodyMarkdown: next }));
  };
  const headings = dailyTemplateHeadings(draft.bodyMarkdown);
  const section = carryOverSection(draft);

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
      <p className="workspace-panel__error" role="alert">
        {editor.loadError}
      </p>
    ) : (
      <p>Loading template…</p>
    );
  }

  const namedWeekday = dailyTemplateNamedWeekday(text);
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
            <SaveIndicator quiet saveState={saveState} dirty={dirty} />
            <Button onClick={insertDate}>Insert date</Button>
            <Button
              disabled={unchanged || reset.isPending}
              onClick={() => void resetToDefault()}
            >
              Reset to default
            </Button>
          </div>
        </div>
        {error ? (
          <p className="workspace-panel__error" role="alert">
            {error}
          </p>
        ) : null}
        {invalidText !== null ? (
          <p className="workspace-panel__error" role="alert">
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
        {namedWeekday ? (
          <p className="kit-hint" role="status">
            {dailyTemplateWeekdayMessage(namedWeekday)}
          </p>
        ) : null}
        <p className="kit-hint">
          Headings, lists and checklists. {DAILY_TEMPLATE_DATE_TOKEN} fills in
          the day when the note is created.
        </p>
        <div className="notebook-templates__carry">
          <Field
            label="Carried-in tasks go under"
            hint={
              headings.length === 0
                ? 'With no headings, open tasks from earlier days go under Carried in at the top.'
                : 'Open tasks from earlier days are added at the end of this section.'
            }
          >
            <Select
              value={section ?? ''}
              disabled={headings.length === 0}
              onChange={(event) => {
                const value = event.target.value;
                updateDraft((current) => ({
                  ...current,
                  carryOverSection: value === '' ? null : value,
                }));
              }}
            >
              <option value="">First section</option>
              {headings.map((heading) => (
                <option key={heading} value={heading}>
                  {heading}
                </option>
              ))}
            </Select>
          </Field>
        </div>
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
              markdown={fillDailyTemplate(text, {
                areaName: label,
                date: tomorrow,
              })}
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
  const { area, areaName } = useOutletContext<NotebookOutletContext>();

  return (
    <section className="workspace-panel workspace-panel--editor">
      <div className="workspace-action-bar">
        <div className="notebook-today__title">
          <p className="notebook-today__kicker">Settings</p>
          <h1>Daily templates</h1>
        </div>
        <div className="workspace-panel__actions">
          <NotebookAreaSwitch />
        </div>
      </div>
      <p className="workspace-panel__lede">
        Each new {areaName} daily note starts from this template. Notes you’ve
        already started never change. Switch areas above to edit another area’s
        template.
      </p>
      <TemplateEditor key={area} area={area} areaName={areaName} />
    </section>
  );
}
