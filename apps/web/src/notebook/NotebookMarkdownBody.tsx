import {
  useCallback,
  useEffect,
  useMemo,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { EditorView, keymap } from '@codemirror/view';
import {
  useGetApiClient,
  useLatest,
  type EmbedNote,
} from '@gagnechris/app-core';
import {
  fillNoteTemplate,
  findTaskEmbeds,
  parseTaskEmbedLine,
  removeTaskEmbedLines,
} from '@gagnechris/shared';
import { EditorAccessoryBar } from '../kit/markdown/EditorAccessoryBar';
// Static: only lazy routes render this body, so CodeMirror loads with the
// route chunk instead of after it behind Suspense's reveal delay.
import MarkdownEditor, {
  type MarkdownEditorHandle,
} from '../kit/markdown/MarkdownEditor';
import { useTaskDateMenuEditor } from '../kit/markdown/taskDateMenuEditor';
import { taskListToggle } from '../kit/markdown/taskListToggle';
import { bulletCheckboxTasks } from '../kit/markdown/bulletCheckboxTasks';
import { markdownImages } from '../kit/markdown/imageWidgets';
import { livePreview } from '../kit/markdown/livePreview';
import '../kit/markdown/markdown.css';
import { PHONE_QUERY, useMediaQuery } from '../kit/useMediaQuery';
import type { DescriptionEditorProps } from './TaskDetailsPanel';
import { notebookImageResolver, uploadNotebookImages } from './notebookImages';
import { useNoteTemplateMenu } from './noteTemplateMenu';
import { toggleTaskDetails } from './taskDetailsStore';
import { useLocalToday } from './useLocalToday';
import { useNoteTaskEmbeds } from './useNoteTaskEmbeds';

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Turns on task embeds; omit for task descriptions. */
  note?: EmbedNote;
  ensureNoteSaved?: () => Promise<unknown>;
  /** Scrolls this task's embed into view and flashes it, once it is in `value`. */
  highlightTaskId?: string | null;
  onHighlighted?: () => void;
  /** For callers that insert text at the caret. */
  editorRef?: RefObject<MarkdownEditorHandle | null>;
  label?: string;
  placeholder?: string;
  /** Turns on `/` templates, filled for this day and area. */
  templates?: { date: string; areaName?: string };
};

/** Room under the caret for the accessory bar and the docked date chips. */
const PHONE_SCROLL_MARGIN = 160;
const FLASH_MS = 2000;
const HIGHLIGHT_WAIT_MS = 2000;

// CodeMirror turns the browser's spelling, grammar and autocorrect off by default.
const writingChecks = EditorView.contentAttributes.of({
  spellcheck: 'true',
  autocorrect: 'on',
  autocapitalize: 'sentences',
});

// The editor of a task's open details, under its row in the note.
const renderDescription = (props: DescriptionEditorProps) => (
  <NotebookMarkdownBody {...props} />
);

/** ⌘. with the caret beside a task's row opens or closes its details. */
const toggleDetailsKey = keymap.of([
  {
    key: 'Mod-.',
    run: (view) => {
      const { state } = view;
      const embed = parseTaskEmbedLine(
        state.doc.lineAt(state.selection.main.head).text,
      );
      if (!embed) return false;
      toggleTaskDetails(embed.id);
      return true;
    },
  },
]);
export function NotebookMarkdownBody({
  value,
  onChange,
  note,
  ensureNoteSaved,
  highlightTaskId,
  onHighlighted,
  editorRef: outerEditorRef,
  label = 'Note body',
  placeholder = 'Write in markdown…',
  templates,
}: Props) {
  const editorRef = useRef<MarkdownEditorHandle>(null);
  useImperativeHandle(
    outerEditorRef,
    () => ({
      focus: () => editorRef.current?.focus(),
      insertText: (text) => editorRef.current?.insertText(text),
      view: () => editorRef.current?.view(),
    }),
    [],
  );
  const getView = useCallback(() => editorRef.current?.view(), []);
  const phone = useMediaQuery(PHONE_QUERY);
  const [focused, setFocused] = useState(false);
  const getClient = useGetApiClient();
  const resolveImageSrc = useMemo(
    () => notebookImageResolver(getClient),
    [getClient],
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadImages = useCallback(
    async (files: File[]) => {
      setUploadError(null);
      try {
        return await uploadNotebookImages(getClient(), files);
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : 'Image upload failed',
        );
        return [];
      }
    },
    [getClient],
  );
  const valueRef = useLatest(value);
  const removeEmbeds = useCallback(
    (ids: ReadonlySet<string>) => {
      const next = removeTaskEmbedLines(valueRef.current, ids);
      if (next !== valueRef.current) onChange(next);
    },
    [onChange, valueRef],
  );
  const embeds = useNoteTaskEmbeds({
    markdown: value,
    note: note ?? null,
    ensureNoteSaved,
    removeEmbeds,
    renderEditor: renderDescription,
  });
  const dateMenu = useTaskDateMenuEditor({
    today: useLocalToday(),
    hint: 'Stays in this note. Shows up on Today from that date.',
  });
  const withTasks = note !== undefined;
  const templateDate = templates?.date;
  const templateArea = templates?.areaName;
  const templateMenu = useNoteTemplateMenu({
    enabled: templates !== undefined,
    fill: useCallback(
      (markdown: string) =>
        templateDate
          ? fillNoteTemplate(markdown, {
              date: templateDate,
              areaName: templateArea,
            })
          : markdown,
      [templateDate, templateArea],
    ),
  });
  const extensions = useMemo(
    () => [
      ...templateMenu.extensions,
      livePreview(),
      writingChecks,
      markdownImages({ resolveSrc: resolveImageSrc }),
      taskListToggle(),
      ...(withTasks
        ? [...dateMenu.extensions, toggleDetailsKey, bulletCheckboxTasks()]
        : []),
      ...embeds.extensions,
      EditorView.updateListener.of((update) => {
        if (update.focusChanged) setFocused(update.view.hasFocus);
      }),
      ...(phone
        ? [EditorView.scrollMargins.of(() => ({ bottom: PHONE_SCROLL_MARGIN }))]
        : []),
    ],
    [
      templateMenu.extensions,
      embeds.extensions,
      dateMenu.extensions,
      withTasks,
      phone,
      resolveImageSrc,
    ],
  );

  const handledHighlight = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightTaskId) {
      handledHighlight.current = null;
      return;
    }
    if (handledHighlight.current === highlightTaskId) return;
    let frame = 0;
    const deadline = performance.now() + HIGHLIGHT_WAIT_MS;
    // The editor can apply a new `value` a beat after this render: it holds
    // external updates back while its own doc is changing.
    const attempt = () => {
      const view = editorRef.current?.view();
      const embed = view
        ? findTaskEmbeds(view.state.doc.toString()).find(
            (e) => e.id === highlightTaskId,
          )
        : undefined;
      if (!view || !embed) {
        if (performance.now() < deadline) {
          frame = requestAnimationFrame(attempt);
        }
        return;
      }
      handledHighlight.current = highlightTaskId;
      // The caret lands on the empty line under the embed, ready for context.
      const line = view.state.doc.line(
        Math.min(embed.line + 2, view.state.doc.lines),
      );
      view.dispatch({
        selection: { anchor: line.to },
        effects: EditorView.scrollIntoView(line.to, { y: 'center' }),
      });
      view.focus();
      frame = requestAnimationFrame(() => {
        onHighlighted?.();
        const el = view.dom.querySelector(
          `.cm-task-embed[data-task-id="${highlightTaskId}"]`,
        );
        if (!el) return;
        el.classList.add('cm-task-embed--flash');
        setTimeout(() => el.classList.remove('cm-task-embed--flash'), FLASH_MS);
      });
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [highlightTaskId, onHighlighted, value]);

  return (
    <>
      <div className="markdown-workspace markdown-workspace--single">
        <div className="markdown-single markdown-single--notebook">
          <MarkdownEditor
            ref={editorRef}
            value={value}
            onChange={onChange}
            extensions={extensions}
            lineNumbers={false}
            label={label}
            placeholder={placeholder}
            onUploadImages={uploadImages}
          />
        </div>
      </div>
      {embeds.portals}
      {phone && focused ? (
        <EditorAccessoryBar getView={getView} tasks={withTasks} />
      ) : null}
      {withTasks ? dateMenu.menu : null}
      {templateMenu.menu}
      {uploadError ? (
        <p className="workspace-panel__error" role="alert">
          {uploadError}
        </p>
      ) : null}
      {embeds.toggleError ? (
        <p className="workspace-panel__error" role="alert">
          {embeds.toggleError}
        </p>
      ) : null}
      {phone && withTasks ? (
        <p className="kit-hint">
          <code>[ ] text</code> then Enter adds a task, <code>@</code> picks its
          day
        </p>
      ) : null}
    </>
  );
}
