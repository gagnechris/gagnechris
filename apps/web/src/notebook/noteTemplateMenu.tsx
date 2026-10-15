import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { useCallback, useId, useMemo, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useNoteTemplatesQuery, type NoteTemplate } from '@gagnechris/app-core';
import { fillNoteTemplate, filterNoteTemplates } from '@gagnechris/shared';
import type { MarkdownEditorHandle } from '../kit/markdown/MarkdownEditor';
import { PHONE_QUERY, useMediaQuery } from '../kit/useMediaQuery';
import { NoteTemplateOptions } from './NoteTemplatePicker';
import '../kit/tasks/taskSyntax.css';

/** The `/query` that fills its line, from the line start to the caret. */
export type SlashQuery = { from: number; to: number; text: string };

type MenuState = {
  query: SlashQuery | null;
  active: number;
  /** Where Escape closed the menu; it stays closed for that `/` line. */
  dismissedAt: number | null;
};

const SLASH_LINE = /^\/([^\n]{0,80})$/;

export function slashQueryAt(state: EditorState): SlashQuery | null {
  const { main } = state.selection;
  if (!main.empty) return null;
  const line = state.doc.lineAt(main.head);
  if (main.head !== line.to) return null;
  const match = SLASH_LINE.exec(line.text);
  if (!match) return null;
  return { from: line.from, to: line.to, text: match[1]! };
}

const activeEffect = StateEffect.define<number>();
const dismissEffect = StateEffect.define<number>();

const menuField = StateField.define<MenuState>({
  create: (state) => ({
    query: slashQueryAt(state),
    active: 0,
    dismissedAt: null,
  }),
  update(value, tr) {
    let { active, dismissedAt } = value;
    if (tr.docChanged && dismissedAt !== null) {
      dismissedAt = tr.changes.mapPos(dismissedAt);
    }
    for (const effect of tr.effects) {
      if (effect.is(activeEffect)) active = effect.value;
      if (effect.is(dismissEffect)) dismissedAt = effect.value;
    }
    const query =
      tr.docChanged || tr.selection ? slashQueryAt(tr.state) : value.query;
    if (!query) dismissedAt = null;
    if (
      query?.text !== value.query?.text ||
      query?.from !== value.query?.from
    ) {
      active = 0;
    }
    return { query, active, dismissedAt };
  },
});

/**
 * Puts a template's text in the note: in place of the `/query` line, on the
 * caret's line when it is empty, or on new lines after it. The caret ends on
 * a line of its own, so every task line is left and becomes a task the way a
 * typed one does.
 */
export function insertNoteTemplate(
  view: EditorView,
  markdown: string,
  range?: { from: number; to: number },
) {
  const body = markdown.replace(/\s+$/, '');
  const { state } = view;
  let from: number;
  let to: number;
  let insert: string;
  if (range) {
    ({ from, to } = range);
    insert = `${body}\n`;
  } else {
    // A caret still at the very start is one the user never placed.
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head === 0 ? state.doc.length : head);
    if (line.text.trim() === '') {
      ({ from, to } = line);
      insert = `${body}\n`;
    } else {
      from = to = line.to;
      insert = `\n${body}\n`;
    }
  }
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + insert.length),
    effects: EditorView.scrollIntoView(from + insert.length),
    userEvent: 'input.complete',
  });
}

const menuOpen = (value: MenuState, items: readonly unknown[]) =>
  value.query !== null &&
  value.dismissedAt !== value.query.from &&
  items.length > 0;

type MenuOptions = {
  baseId: string;
  templates: readonly NoteTemplate[];
  fill: (markdown: string) => string;
  onChange: (view: EditorView, value: MenuState) => void;
};

function noteTemplateMenuEditor({
  baseId,
  templates,
  fill,
  onChange,
}: MenuOptions): Extension {
  const itemsOf = (value: MenuState) =>
    value.query ? filterNoteTemplates(templates, value.query.text) : [];

  const run =
    (key: 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Escape') =>
    (view: EditorView) => {
      const value = view.state.field(menuField);
      const items = itemsOf(value);
      if (!menuOpen(value, items) || !value.query) return false;
      const active = Math.min(value.active, items.length - 1);
      if (key === 'Enter') {
        insertNoteTemplate(
          view,
          fill(items[active]!.bodyMarkdown),
          value.query,
        );
      } else if (key === 'Escape') {
        view.dispatch({ effects: dismissEffect.of(value.query.from) });
      } else {
        const step = key === 'ArrowDown' ? 1 : -1;
        view.dispatch({
          effects: activeEffect.of(
            (active + step + items.length) % items.length,
          ),
        });
      }
      return true;
    };

  return [
    menuField,
    Prec.highest(
      keymap.of([
        { key: 'ArrowDown', run: run('ArrowDown') },
        { key: 'ArrowUp', run: run('ArrowUp') },
        { key: 'Enter', run: run('Enter') },
        { key: 'Tab', run: run('Enter') },
        { key: 'Escape', run: run('Escape'), stopPropagation: true },
      ]),
    ),
    EditorView.contentAttributes.of((view): Record<string, string> => {
      const value = view.state.field(menuField);
      const items = itemsOf(value);
      if (!menuOpen(value, items)) return {};
      const item = items[Math.min(value.active, items.length - 1)];
      return {
        'aria-controls': `${baseId}-listbox`,
        ...(item ? { 'aria-activedescendant': `${baseId}-${item.id}` } : {}),
      };
    }),
    EditorView.updateListener.of((update) => {
      const before = update.startState.field(menuField);
      const after = update.state.field(menuField);
      if (
        before !== after ||
        update.focusChanged ||
        ((update.geometryChanged || update.viewportChanged) && after.query)
      ) {
        onChange(update.view, after);
      }
    }),
  ];
}

const NONE: readonly NoteTemplate[] = [];

/** Fills and inserts a template chosen outside the editor, then focuses it. */
export function useInsertNoteTemplate(
  editorRef: RefObject<MarkdownEditorHandle | null>,
  fillFor: { date: string; areaName?: string },
) {
  const { date, areaName } = fillFor;
  return useCallback(
    (template: NoteTemplate) => {
      const view = editorRef.current?.view();
      if (!view) return;
      insertNoteTemplate(
        view,
        fillNoteTemplate(template.bodyMarkdown, { date, areaName }),
      );
      view.focus();
    },
    [editorRef, date, areaName],
  );
}

type Snapshot = {
  view: EditorView;
  value: MenuState;
  focused: boolean;
  anchor: { left: number; top: number } | null;
};

/**
 * Typing `/` at the start of an empty line lists the user's templates,
 * filtered by what follows; Enter puts the chosen one's text there.
 */
export function useNoteTemplateMenu({
  enabled,
  fill,
}: {
  enabled: boolean;
  fill: (markdown: string) => string;
}) {
  const baseId = useId();
  const templates = useNoteTemplatesQuery(enabled).data;
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const docked = useMediaQuery(PHONE_QUERY);

  const onChange = useCallback((view: EditorView, value: MenuState) => {
    const coords = value.query ? view.coordsAtPos(value.query.from) : null;
    setSnap({
      view,
      value,
      focused: view.hasFocus,
      anchor: coords ? { left: coords.left, top: coords.bottom } : null,
    });
  }, []);
  const extensions = useMemo(
    () =>
      enabled
        ? [
            noteTemplateMenuEditor({
              baseId,
              templates: templates ?? NONE,
              fill,
              onChange,
            }),
          ]
        : [],
    [enabled, baseId, templates, fill, onChange],
  );

  const value = snap?.value;
  const items =
    value?.query && templates
      ? filterNoteTemplates(templates, value.query.text)
      : [];
  const open = !!value && !!snap?.focused && menuOpen(value, items);
  const active = value ? Math.min(value.active, items.length - 1) : 0;
  const view = snap?.view;

  const menu =
    enabled && open
      ? createPortal(
          <div
            className={`task-syntax__menu${docked ? ' task-syntax__menu--docked' : ''}`}
            data-note-template-menu=""
            style={
              !docked && snap?.anchor
                ? {
                    position: 'fixed',
                    left: snap.anchor.left,
                    top: snap.anchor.top + 4,
                  }
                : undefined
            }
          >
            <p className="task-syntax__heading" id={`${baseId}-heading`}>
              Insert template
            </p>
            <NoteTemplateOptions
              baseId={baseId}
              templates={items}
              activeIndex={active}
              onActivate={(index) =>
                view?.dispatch({ effects: activeEffect.of(index) })
              }
              onChoose={(template) => {
                if (!view || !value?.query) return;
                insertNoteTemplate(
                  view,
                  fill(template.bodyMarkdown),
                  value.query,
                );
                view.focus();
              }}
            />
            <p className="task-syntax__hint">
              Enter inserts it here. Escape keeps the /.
            </p>
          </div>,
          document.body,
        )
      : null;

  return { extensions, menu };
}
