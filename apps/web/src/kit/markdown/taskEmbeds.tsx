import {
  EditorState,
  Prec,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
  type Line,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import {
  createUlid,
  fenceLineKind,
  findTaskEmbeds,
  indentWidth,
  lineAfterOuterBlock,
  parseTaskEmbedLine,
  parseTaskLine,
  removeTaskLine,
  scanFences,
  taskEmbedNesting,
  taskEmbedToken,
  taskLineDraftKey,
  type TaskLineDraft,
} from '@gagnechris/shared';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { blockEnd } from './lineMoves';
import {
  dragTaskEmbed,
  indentTaskEmbed,
  indentTaskEmbedFrom,
  moveTaskEmbedToSection,
  refocusTaskEmbed,
  shiftTaskEmbed,
  shiftTaskEmbedFrom,
  taskEmbedBlock,
  taskEmbedSections,
} from './taskEmbedMoves';

export type TaskEmbedCreate = { id: string; draft: TaskLineDraft };

type TaskEmbedHost = {
  attach: (el: HTMLElement, id: string) => void;
  detach: (el: HTMLElement) => void;
};

type TaskEmbedEditorOptions = {
  host: TaskEmbedHost;
  onCreate: (create: TaskEmbedCreate) => void;
  /** Embeds the user deleted, so their tasks can be deleted too. */
  onRemove?: (ids: string[]) => void;
  newId?: () => string;
};

const createdEffect = StateEffect.define<TaskEmbedCreate>();
const flushEffect = StateEffect.define<null>();
/** Text typed beside an embed, for its title field. */
const typedEffect = StateEffect.define<{
  at: number;
  text: string;
  atStart: boolean;
}>();

const isProgrammatic = (tr: Transaction) =>
  tr.annotation(Transaction.userEvent) === undefined;

const isEdit = (tr: Transaction) =>
  tr.docChanged && (tr.isUserEvent('input') || tr.isUserEvent('delete'));

/** One position on each line the transaction typed, pasted or deleted on. */
function editedLines(tr: Transaction): number[] {
  const positions: number[] = [];
  tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    for (let pos = fromB; ;) {
      const line = tr.newDoc.lineAt(pos);
      positions.push(line.from);
      if (line.to >= toB) break;
      pos = line.to + 1;
    }
  });
  return positions;
}

/** Position on the line the user is typing on; mapped through every change. */
const candidateField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    if (tr.docChanged && isProgrammatic(tr)) return null;
    if (tr.effects.some((e) => e.is(flushEffect))) return null;
    const positions = [
      ...(value === null ? [] : [tr.changes.mapPos(value)]),
      ...(isEdit(tr) ? editedLines(tr) : []),
    ];
    // Every other line was converted or left as text by `convertLeftLine`.
    const head = tr.newDoc.lineAt(tr.newSelection.main.head);
    return positions.find((p) => p >= head.from && p <= head.to) ?? null;
  },
});

type Converted = {
  key: string;
  /** Where an undo took the token out, so leaving that line again reuses the id. */
  undoneAt: number | null;
};

/** Every task this editor created, so an undone conversion keeps its task. */
const convertedField = StateField.define<ReadonlyMap<string, Converted>>({
  create: () => new Map(),
  update(value, tr) {
    const created = tr.effects.filter((e) => e.is(createdEffect));
    if (created.length === 0 && !tr.docChanged) return value;
    const next = new Map<string, Converted>();
    const undo = tr.isUserEvent('undo');
    const before = undo ? tr.startState.doc.toString() : '';
    const after = undo ? tr.newDoc.toString() : '';
    for (const [id, entry] of value) {
      let undoneAt =
        entry.undoneAt === null ? null : tr.changes.mapPos(entry.undoneAt, -1);
      if (undo) {
        const token = taskEmbedToken(id);
        const at = before.indexOf(token);
        if (at >= 0 && !after.includes(token)) {
          undoneAt = tr.changes.mapPos(at, -1);
        }
      }
      next.set(id, { ...entry, undoneAt });
    }
    for (const effect of created) {
      next.set(effect.value.id, {
        key: taskLineDraftKey(effect.value.draft),
        undoneAt: null,
      });
    }
    return next;
  },
});

/**
 * An id is reused only when its token is gone from the doc: first the task
 * whose conversion was undone on this line, then one with the same text.
 */
function reusableId(
  converted: ReadonlyMap<string, Converted>,
  doc: string,
  line: { from: number; to: number },
  key: string,
  taken: ReadonlySet<string>,
  mapPos: (pos: number) => number,
): string | undefined {
  const absent = [...converted].filter(
    ([id]) => !taken.has(id) && !doc.includes(taskEmbedToken(id)),
  );
  const undone = absent.find(([, entry]) => {
    if (entry.undoneAt === null) return false;
    const at = mapPos(entry.undoneAt);
    return at >= line.from && at <= line.to;
  });
  return (undone ?? absent.find(([, entry]) => entry.key === key))?.[0];
}

function convertLeftLine(newId: () => string) {
  return EditorState.transactionFilter.of((tr) => {
    const flush = tr.effects.some((e) => e.is(flushEffect));
    if (!flush && !tr.selection && !tr.docChanged) return tr;
    if (tr.docChanged && isProgrammatic(tr)) return tr;
    const candidate = tr.startState.field(candidateField, false);
    const positions = [
      ...(candidate == null ? [] : [tr.changes.mapPos(candidate)]),
      ...(isEdit(tr) ? editedLines(tr) : []),
    ];
    if (positions.length === 0) return tr;

    const doc = tr.newDoc;
    const head = doc.lineAt(tr.newSelection.main.head).number;
    const lineNumbers = [...new Set(positions.map((p) => doc.lineAt(p).number))]
      .filter((n) => flush || n !== head)
      .sort((a, b) => a - b);
    if (lineNumbers.length === 0) return tr;

    const fences = scanFences(doc.iterLines());
    const converted = tr.startState.field(convertedField);
    const text = doc.toString();
    const taken = new Set<string>();
    const changes: { from: number; to: number; insert: string }[] = [];
    const effects: StateEffect<TaskEmbedCreate>[] = [];
    for (const n of lineNumbers) {
      const line = doc.line(n);
      const parsed = parseTaskLine(line.text);
      if (!parsed || fenceLineKind(fences, n - 1)) continue;
      const id =
        reusableId(
          converted,
          text,
          line,
          taskLineDraftKey(parsed.draft),
          taken,
          (pos) => tr.changes.mapPos(pos, -1),
        ) ?? newId();
      taken.add(id);
      changes.push({
        from: line.from + parsed.indent.length,
        to: line.to,
        insert: taskEmbedToken(id),
      });
      effects.push(createdEffect.of({ id, draft: parsed.draft }));
    }
    if (changes.length === 0) return tr;
    return [tr, { changes, effects, sequential: true }];
  });
}

class TaskEmbedWidget extends WidgetType {
  constructor(
    readonly id: string,
    private readonly host: TaskEmbedHost,
  ) {
    super();
  }

  eq(other: TaskEmbedWidget) {
    return other.id === this.id;
  }

  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-task-embed';
    el.dataset.taskId = this.id;
    this.host.attach(el, this.id);
    return el;
  }

  destroy(dom: HTMLElement) {
    this.host.detach(dom);
  }

  // The row's checkbox, title field and link handle their own events; keys,
  // paste and selection in the field must not edit the note.
  ignoreEvent() {
    return true;
  }
}

/**
 * Embeds a user edit took out of the doc. A cut is a move in progress, and an
 * undone conversion keeps its task for when the line is left again.
 */
function removedEmbeds(tr: Transaction): string[] {
  if (!tr.docChanged || isProgrammatic(tr) || tr.isUserEvent('delete.cut')) {
    return [];
  }
  let touched = false;
  tr.changes.iterChangedRanges((fromA, toA) => {
    if (tr.startState.sliceDoc(fromA, toA).includes('{{task:')) touched = true;
  });
  if (!touched) return [];
  const after = new Set(findTaskEmbeds(tr.newDoc.toString()).map((e) => e.id));
  const converted = tr.state.field(convertedField);
  return [
    ...new Set(findTaskEmbeds(tr.startState.doc.toString()).map((e) => e.id)),
  ].filter((id) => !after.has(id) && converted.get(id)?.undoneAt == null);
}

const draftLine = Decoration.line({ class: 'cm-task-draft' });

const embedIndent = Decoration.replace({});

/**
 * Each embed becomes its row. Its indent is drawn as padding rather than
 * spaces, so a subtask sits a step in, with a guide back to its parent.
 */
function buildWidgets(state: EditorState, host: TaskEmbedHost) {
  const doc = state.doc;
  const ranges: Range<Decoration>[] = [];
  for (const embed of taskEmbedNesting(doc.toString())) {
    const line = doc.line(embed.line + 1);
    const from = line.from + embed.indent.length;
    const to = line.from + line.text.trimEnd().length;
    const columns = embed.indent.length;
    if (columns > 0 || embed.depth > 0) {
      ranges.push(
        Decoration.line({
          class:
            embed.depth > 0 ? 'cm-task-line cm-task-line--sub' : 'cm-task-line',
          attributes: {
            style: `--task-indent: ${columns}; --task-guide: ${Math.max(0, columns - 2)}`,
          },
        }).range(line.from),
      );
    }
    if (columns > 0) ranges.push(embedIndent.range(line.from, from));
    ranges.push(
      Decoration.replace({
        widget: new TaskEmbedWidget(embed.id, host),
      }).range(from, to),
    );
  }
  return Decoration.set(ranges, true);
}

const foldEffect = StateEffect.define<{ id: string; folded: boolean }>();

/** Parent tasks whose subtasks, and the lines under them, are hidden. */
const foldedTasksField = StateField.define<ReadonlySet<string>>({
  create: () => new Set(),
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (!effect.is(foldEffect)) continue;
      const { id, folded } = effect.value;
      if (next.has(id) === folded) continue;
      const copy = new Set(next);
      if (folded) copy.add(id);
      else copy.delete(id);
      next = copy;
    }
    return next;
  },
});

const hiddenLines = Decoration.replace({});

function buildFolds(state: EditorState) {
  const folded = state.field(foldedTasksField);
  if (folded.size === 0) return Decoration.none;
  const { doc } = state;
  const ranges: Range<Decoration>[] = [];
  let hiddenTo = -1;
  for (const embed of findTaskEmbeds(doc.toString())) {
    if (!folded.has(embed.id)) continue;
    const line = doc.line(embed.line + 1);
    if (line.from <= hiddenTo) continue;
    const last = blockEnd(doc, line.number);
    if (last === line.number) continue;
    hiddenTo = doc.line(last).to;
    ranges.push(hiddenLines.range(line.to, hiddenTo));
  }
  return Decoration.set(ranges);
}

const foldDecorations = StateField.define<DecorationSet>({
  create: buildFolds,
  update: (deco, tr) =>
    tr.docChanged || tr.effects.some((e) => e.is(foldEffect))
      ? buildFolds(tr.state)
      : deco,
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

const unindented = (text: string) => text.replace(/^[ \t]+/gm, '');

/**
 * A typed or deleted change that would remove or join the lines a fold hides
 * is dropped: nothing on screen says they would go. Taking out the parent's
 * whole line, or only changing the hidden lines' indent, is fine.
 */
const keepFoldedLines = EditorState.transactionFilter.of((tr) => {
  if (
    !tr.docChanged ||
    !(tr.isUserEvent('input') || tr.isUserEvent('delete'))
  ) {
    return tr;
  }
  const folds = tr.startState.field(foldDecorations);
  if (folds.size === 0) return tr;
  const { doc } = tr.startState;
  let hidden = false;
  tr.changes.iterChanges((a, b, _fromB, _toB, inserted) => {
    if (a === b) return;
    const reindented =
      unindented(doc.sliceString(a, b)) === unindented(inserted.toString());
    folds.between(a, b, (from, to) => {
      const parentLine = a <= doc.lineAt(from).from && b === from + 1;
      if (a <= to && b > from && !parentLine && !reindented) hidden = true;
    });
  });
  return hidden ? {} : tr;
});

function buildDraftLines(view: EditorView) {
  const { doc } = view.state;
  const ranges: Range<Decoration>[] = [];
  let last = 0;
  for (const { from, to } of view.visibleRanges) {
    const end = doc.lineAt(to).number;
    for (
      let n = Math.max(doc.lineAt(from).number, last + 1);
      n <= end;
      n += 1
    ) {
      const line = doc.line(n);
      if (parseTaskLine(line.text)) ranges.push(draftLine.range(line.from));
    }
    last = Math.max(last, end);
  }
  return Decoration.set(ranges);
}

const draftLines = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDraftLines(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDraftLines(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** The embed widget's range on `line`, if the line is an embed. */
function embedOn(widgets: DecorationSet, line: Line) {
  let range: { from: number; to: number } | null = null;
  widgets.between(line.from, line.to, (from, to, deco) => {
    if (!(deco.spec.widget instanceof TaskEmbedWidget)) return;
    range = { from, to };
    return false;
  });
  return range as { from: number; to: number } | null;
}

const setTextareaValue = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  'value',
)?.set;

const embedWidgetAt = (view: EditorView, at: number) =>
  [...view.contentDOM.querySelectorAll<HTMLElement>('.cm-task-embed')].find(
    (el) => view.posAtDOM(el) === at,
  );

/**
 * Puts the caret in the title field of the embed widget at `at`, at its start
 * or end, inserting `text` there as if typed. False when the row has no field.
 */
function focusEmbedTitle(
  view: EditorView,
  at: number,
  atStart: boolean,
  text = '',
): boolean {
  const field = embedWidgetAt(view, at)?.querySelector('textarea');
  if (!field) return false;
  field.focus();
  let caret = atStart ? 0 : field.value.length;
  if (text && setTextareaValue) {
    const { value } = field;
    setTextareaValue.call(
      field,
      value.slice(0, caret) + text + value.slice(caret),
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
    caret += text.length;
  }
  field.setSelectionRange(caret, caret);
  return true;
}

// Focus moves after the update, since the editor's blur handler dispatches.
const focusEmbedTitleSoon = (
  view: EditorView,
  at: number,
  atStart: boolean,
  text?: string,
) => {
  setTimeout(() => {
    if (view.dom.isConnected) focusEmbedTitle(view, at, atStart, text);
  }, 0);
};

/**
 * Text typed on an embed's line would break its token, so it goes to the
 * title field instead. Lines pasted or inserted there land after the outer
 * block, so they never come between a parent and its subtasks; only above a
 * top-level row do they go before it.
 */
function guardEmbedLines(widgets: StateField<DecorationSet>) {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || !tr.isUserEvent('input')) return tr;
    const edits: { from: number; to: number; text: string }[] = [];
    tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
      edits.push({ from, to, text: inserted.toString() });
    });
    const edit = edits.length === 1 ? edits[0]! : null;
    if (!edit || edit.from !== edit.to) return tr;
    const line = tr.startState.doc.lineAt(edit.from);
    const embed = embedOn(tr.startState.field(widgets), line);
    if (!embed) return tr;
    const atStart = edit.from <= embed.from;
    if (!edit.text.includes('\n')) {
      return {
        effects: typedEffect.of({ at: embed.from, text: edit.text, atStart }),
      };
    }
    const userEvent = tr.annotation(Transaction.userEvent);
    if (atStart && indentWidth(line.text) === 0) {
      if (edit.text.endsWith('\n')) return tr;
      const insert = `${edit.text}\n`;
      return {
        changes: { from: line.from, insert },
        selection: { anchor: line.from + insert.length - 1 },
        userEvent,
      };
    }
    const { doc } = tr.startState;
    // Zero-based, the line after the block is its last line's number.
    const end = doc.line(lineAfterOuterBlock(doc.toJSON(), line.number - 1));
    if (!atStart && end.number === line.number && edit.text.startsWith('\n')) {
      return tr;
    }
    // A whole-line paste before a subtask ends in the break that went before it.
    const text = atStart ? edit.text.replace(/\n$/, '') : edit.text;
    const insert = text.startsWith('\n') ? text : `\n${text}`;
    return {
      changes: { from: end.to, insert },
      selection: { anchor: end.to + insert.length },
      scrollIntoView: true,
      userEvent,
    };
  });
}

/**
 * Backspace at the start of the line under an embed, or Delete at the end of
 * the line above one, would join text onto its token: an empty line goes,
 * and the caret moves into the title. With the caret beside a row, Enter
 * leaves its block, Backspace deletes it the way the title's Backspace does,
 * and nothing joins another line onto the row or splits it from its subtasks.
 */
function embedEdgeKeys(widgets: StateField<DecorationSet>) {
  const onRow = (view: EditorView) => {
    const { state } = view;
    const sel = state.selection.main;
    if (!sel.empty) return null;
    const line = state.doc.lineAt(sel.head);
    const embed = embedOn(state.field(widgets), line);
    return embed ? { line, embed, atStart: sel.head <= embed.from } : null;
  };
  const rowEnter = (view: EditorView) => {
    const row = onRow(view);
    if (!row) return false;
    // A new line above a top-level row splits nothing.
    if (row.atStart && indentWidth(row.line.text) === 0) return false;
    const el = embedWidgetAt(view, row.embed.from);
    if (!el) return false;
    leaveTaskEmbed(view, el, true);
    return true;
  };
  const rowBackspace = (view: EditorView) => {
    const row = onRow(view);
    if (!row) return false;
    if (!row.atStart) {
      const el = embedWidgetAt(view, row.embed.from);
      if (el) deleteTaskEmbedLine(view, el);
      return true;
    }
    const { doc } = view.state;
    const above = row.line.number > 1 ? doc.line(row.line.number - 1) : null;
    let at = row.embed.from;
    if (above && above.length === 0) {
      view.dispatch({
        changes: { from: above.from, to: above.to + 1 },
        userEvent: 'delete.backward',
      });
      at -= 1;
    }
    focusEmbedTitleSoon(view, at, true);
    return true;
  };
  const rowDelete = (view: EditorView) => {
    const row = onRow(view);
    if (!row) return false;
    if (row.atStart) {
      focusEmbedTitleSoon(view, row.embed.from, true);
      return true;
    }
    const { state } = view;
    const { line } = row;
    if (line.number === state.doc.lines) return true;
    let folded = false;
    state.field(foldDecorations).between(line.to, line.to, (from) => {
      if (from === line.to) folded = true;
    });
    if (folded) return true;
    const next = state.doc.line(line.number + 1);
    if (next.length === 0) {
      view.dispatch({
        changes: { from: line.to, to: next.from },
        userEvent: 'delete.forward',
      });
      return true;
    }
    const embed = embedOn(state.field(widgets), next);
    if (embed) focusEmbedTitleSoon(view, embed.from, true);
    return true;
  };
  const neighbour = (view: EditorView, dir: -1 | 1) => {
    const { state } = view;
    const sel = state.selection.main;
    if (!sel.empty) return null;
    const line = state.doc.lineAt(sel.head);
    if (sel.head !== (dir < 0 ? line.from : line.to)) return null;
    const n = line.number + dir;
    if (n < 1 || n > state.doc.lines) return null;
    const embed = embedOn(state.field(widgets), state.doc.line(n));
    return embed ? { line, embed } : null;
  };
  const shiftKey = (dir: 'up' | 'down', bySection: boolean) => ({
    key: `${bySection ? 'Shift-' : ''}Alt-Arrow${dir === 'up' ? 'Up' : 'Down'}`,
    run: (view: EditorView) => {
      const { state } = view;
      const line = state.doc.lineAt(state.selection.main.head);
      if (!embedOn(state.field(widgets), line)) return false;
      shiftTaskEmbed(view, line.number, dir, bySection);
      return true;
    },
  });
  const indentKey = (key: string, dir: 'in' | 'out') => ({
    key,
    run: (view: EditorView) => {
      const { state } = view;
      const line = state.doc.lineAt(state.selection.main.head);
      if (!embedOn(state.field(widgets), line)) return false;
      indentTaskEmbed(view, line.number, dir);
      return true;
    },
  });
  return Prec.high(
    keymap.of([
      indentKey('Tab', 'in'),
      indentKey('Shift-Tab', 'out'),
      shiftKey('up', false),
      shiftKey('down', false),
      shiftKey('up', true),
      shiftKey('down', true),
      { key: 'Enter', run: rowEnter },
      {
        key: 'Backspace',
        run: (view) => {
          if (rowBackspace(view)) return true;
          const hit = neighbour(view, -1);
          if (!hit) return false;
          if (hit.line.length === 0) {
            view.dispatch({
              changes: { from: hit.line.from - 1, to: hit.line.from },
              userEvent: 'delete.backward',
            });
          }
          focusEmbedTitleSoon(view, hit.embed.from, false);
          return true;
        },
      },
      {
        key: 'Delete',
        run: (view) => {
          if (rowDelete(view)) return true;
          const hit = neighbour(view, 1);
          if (!hit) return false;
          const at =
            hit.line.length === 0 ? hit.embed.from - 1 : hit.embed.from;
          if (hit.line.length === 0) {
            view.dispatch({
              changes: { from: hit.line.from, to: hit.line.to + 1 },
              userEvent: 'delete.forward',
            });
          }
          focusEmbedTitleSoon(view, at, true);
          return true;
        },
      },
    ]),
  );
}

export function taskEmbedEditor({
  host,
  onCreate,
  onRemove,
  newId = createUlid,
}: TaskEmbedEditorOptions): Extension {
  const widgets = StateField.define<DecorationSet>({
    create: (state) => buildWidgets(state, host),
    update: (deco, tr) => (tr.docChanged ? buildWidgets(tr.state, host) : deco),
    provide: (field) => [
      EditorView.decorations.from(field),
      EditorView.atomicRanges.of((view) => view.state.field(field)),
    ],
  });

  return [
    candidateField,
    convertedField,
    convertLeftLine(newId),
    widgets,
    foldedTasksField,
    foldDecorations,
    keepFoldedLines,
    guardEmbedLines(widgets),
    embedEdgeKeys(widgets),
    draftLines,
    EditorView.updateListener.of((update) => {
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(createdEffect)) onCreate(effect.value);
          if (effect.is(typedEffect)) {
            const { at, atStart, text } = effect.value;
            focusEmbedTitleSoon(update.view, at, atStart, text);
          }
        }
        const removed = onRemove ? removedEmbeds(tr) : [];
        if (removed.length > 0) onRemove?.(removed);
        // Arrow keys onto an embed's line go into its title.
        const sel = tr.selection?.main;
        if (
          sel?.empty &&
          tr.isUserEvent('select') &&
          !tr.isUserEvent('select.pointer')
        ) {
          const embed = embedOn(
            tr.state.field(widgets),
            tr.state.doc.lineAt(sel.head),
          );
          if (embed) {
            focusEmbedTitleSoon(
              update.view,
              embed.from,
              sel.head <= embed.from,
            );
          }
        }
      }
    }),
    EditorView.domEventHandlers({
      blur(event, view) {
        // Pick a date… takes focus but the line is still being written.
        const to = event.relatedTarget;
        if (to instanceof Element && to.closest('[data-task-date-menu]')) {
          return false;
        }
        if (view.dom.isConnected && view.state.field(candidateField) !== null) {
          view.dispatch({ effects: flushEffect.of(null) });
        }
        return false;
      },
    }),
  ];
}

/**
 * Moves the caret out of an embed row back into the note: onto the blank line
 * after its block (adding one unless the next line is already blank), or to
 * the end of the embed's own line.
 */
export function leaveTaskEmbed(
  view: EditorView,
  widget: HTMLElement,
  below: boolean,
) {
  const at = view.posAtDOM(widget);
  // Focus first: on focus the editor reads the DOM selection, which is still
  // wherever it was before the field took focus.
  view.focus();
  const { doc } = view.state;
  const line = doc.lineAt(at);
  if (!below) {
    view.dispatch({ selection: { anchor: line.to } });
    return;
  }
  const end = doc.line(lineAfterOuterBlock(doc.toJSON(), line.number - 1));
  if (end.number < doc.lines && !doc.line(end.number + 1).text.trim()) {
    const next = doc.line(end.number + 1);
    view.dispatch({ selection: { anchor: next.to }, scrollIntoView: true });
  } else {
    view.dispatch({
      changes: { from: end.to, insert: '\n' },
      selection: { anchor: end.to + 1 },
      scrollIntoView: true,
      userEvent: 'input',
    });
  }
}

/**
 * Arrow keys out of an embed's title: into the next embed's title, or onto the
 * end of the line above / the start of the line below (adding one at the end
 * of the note).
 */
export function moveFromTaskEmbed(
  view: EditorView,
  widget: HTMLElement,
  dir: 'up' | 'down',
) {
  const { doc } = view.state;
  const line = doc.lineAt(view.posAtDOM(widget));
  let n = line.number + (dir === 'up' ? -1 : 1);
  if (n < 1) return;
  // A folded block is one row: step onto its parent or past its hidden lines.
  if (n <= doc.lines) {
    const at = doc.line(n).from;
    view.state.field(foldDecorations).between(at, at, (from, to) => {
      if (from >= at || to < at) return;
      n = doc.lineAt(dir === 'up' ? from : to).number + (dir === 'up' ? 0 : 1);
      return false;
    });
  }
  if (n > doc.lines) {
    leaveTaskEmbed(view, widget, true);
    return;
  }
  const target = doc.line(n);
  const embed = parseTaskEmbedLine(target.text);
  if (
    embed &&
    focusEmbedTitle(view, target.from + embed.indent.length, dir === 'down')
  ) {
    return;
  }
  view.focus();
  view.dispatch({
    selection: { anchor: dir === 'up' ? target.to : target.from },
    scrollIntoView: true,
  });
}

/**
 * Deletes the embed's line as a user edit; the caret ends the line above. The
 * lines under it move out to its level, so its subtasks don't nest under the
 * task above instead.
 */
export function deleteTaskEmbedLine(view: EditorView, widget: HTMLElement) {
  const at = view.posAtDOM(widget);
  view.focus();
  const { doc } = view.state;
  const line = doc.lineAt(at);
  const [from, to] =
    line.number > 1
      ? [line.from - 1, line.to]
      : [line.from, Math.min(line.to + 1, doc.length)];
  const last = blockEnd(doc, line.number);
  const changes = [{ from, to, insert: '' }];
  if (last > line.number) {
    const kept = removeTaskLine(doc.toJSON(), line.number - 1);
    changes.push({
      from: line.to + 1,
      to: doc.line(last).to,
      insert: kept.slice(line.number - 1, last - 1).join('\n'),
    });
  }
  view.dispatch({
    changes,
    selection: { anchor: from },
    scrollIntoView: true,
    userEvent: 'delete',
  });
}

const viewOf = (el: HTMLElement) => {
  const editor = el.closest<HTMLElement>('.cm-editor');
  return editor ? EditorView.findFromDOM(editor) : null;
};

const leaveFrom = (el: HTMLElement) => (below: boolean) => {
  const view = viewOf(el);
  if (view) leaveTaskEmbed(view, el, below);
};

const deleteFrom = (el: HTMLElement) => () => {
  const view = viewOf(el);
  if (view) deleteTaskEmbedLine(view, el);
};

const moveFrom = (el: HTMLElement) => (dir: 'up' | 'down') => {
  const view = viewOf(el);
  if (view) moveFromTaskEmbed(view, el, dir);
};

const controlsFor = (el: HTMLElement): TaskEmbedControls => {
  const withView = <T,>(run: (view: EditorView) => T, fallback: T) => {
    const view = viewOf(el);
    return view ? run(view) : fallback;
  };
  return {
    leave: leaveFrom(el),
    remove: deleteFrom(el),
    move: moveFrom(el),
    shift: (dir, bySection, refocus) =>
      withView((view) => {
        const id = el.dataset.taskId ?? '';
        shiftTaskEmbedFrom(view, el, dir, bySection);
        refocusTaskEmbed(view, id, refocus);
      }, undefined),
    indent: (dir, refocus) =>
      withView((view) => {
        const id = el.dataset.taskId ?? '';
        if (!indentTaskEmbedFrom(view, el, dir)) return false;
        refocusTaskEmbed(view, id, refocus);
        return true;
      }, false),
    fold: (folded) =>
      withView((view) => {
        const id = el.dataset.taskId ?? '';
        if (view.state.field(foldedTasksField).has(id) === folded) return;
        view.dispatch({ effects: foldEffect.of({ id, folded }) });
      }, undefined),
    drag: (event) =>
      withView((view) => dragTaskEmbed(view, el, event), undefined),
    sections: () => withView(taskEmbedSections, []),
    toSection: (index) =>
      withView((view) => moveTaskEmbedToSection(view, el, index), undefined),
    takeBlock: () => withView((view) => taskEmbedBlock(view, el), null),
  };
};

/** What an embed row does to the note around it. */
export type TaskEmbedControls = {
  leave: (below: boolean) => void;
  remove: () => void;
  move: (dir: 'up' | 'down') => void;
  /** Moves the task's block a step or a section; then focuses `refocus` in the row. */
  shift: (dir: 'up' | 'down', bySection: boolean, refocus: string) => void;
  /** Tab / ⇧Tab: nests the task under the line above, or takes it out; false when it can't. */
  indent: (dir: 'in' | 'out', refocus: string) => boolean;
  /** Hides or shows the lines under the task. */
  fold: (folded: boolean) => void;
  drag: (event: PointerEvent) => void;
  /** The note's `##` section titles. */
  sections: () => string[];
  toSection: (index: number) => void;
  /**
   * The task's line and the lines under it, for another note, and a way to
   * take them out of this one afterwards, keeping their tasks; false once the
   * editor is gone.
   */
  takeBlock: () => {
    lines: () => string | null;
    remove: () => boolean;
  } | null;
};

/**
 * Embed rows render as React portals into CodeMirror widgets, so they share
 * the page's router and data context.
 */
export function useTaskEmbedEditor({
  onCreate,
  onRemove,
  renderEmbed,
  newId,
}: {
  onCreate: (create: TaskEmbedCreate) => void;
  onRemove?: (ids: string[]) => void;
  renderEmbed: (id: string, controls: TaskEmbedControls) => ReactNode;
  newId?: () => string;
}) {
  // `seq` keys each mount, so a widget rebuilt for the same id remounts its row.
  const [mounts, setMounts] = useState<{
    seq: number;
    byEl: ReadonlyMap<HTMLElement, { id: string; key: number }>;
  }>(() => ({ seq: 0, byEl: new Map() }));
  const onCreateRef = useRef(onCreate);
  const onRemoveRef = useRef(onRemove);
  useEffect(() => {
    onCreateRef.current = onCreate;
    onRemoveRef.current = onRemove;
  }, [onCreate, onRemove]);
  const host = useMemo<TaskEmbedHost>(
    () => ({
      attach: (el, id) =>
        setMounts(({ seq, byEl }) => ({
          seq: seq + 1,
          byEl: new Map(byEl).set(el, { id, key: seq + 1 }),
        })),
      detach: (el) =>
        setMounts((prev) => {
          if (!prev.byEl.has(el)) return prev;
          const byEl = new Map(prev.byEl);
          byEl.delete(el);
          return { ...prev, byEl };
        }),
    }),
    [],
  );

  const create = useCallback((value: TaskEmbedCreate) => {
    onCreateRef.current(value);
  }, []);
  const remove = useCallback((ids: string[]) => {
    onRemoveRef.current?.(ids);
  }, []);

  const extensions = useMemo(
    () => [
      taskEmbedEditor({ host, onCreate: create, onRemove: remove, newId }),
    ],
    [create, remove, host, newId],
  );

  const portals = (
    <>
      {[...mounts.byEl].map(([el, { id, key }]) => (
        <Fragment key={key}>
          {createPortal(renderEmbed(id, controlsFor(el)), el)}
        </Fragment>
      ))}
    </>
  );

  return { extensions, portals };
}
