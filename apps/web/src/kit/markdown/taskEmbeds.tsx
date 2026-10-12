import {
  EditorState,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import {
  createUlid,
  fenceLineKind,
  findTaskEmbeds,
  parseTaskLine,
  scanFences,
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

function buildWidgets(state: EditorState, host: TaskEmbedHost) {
  const doc = state.doc;
  const ranges: Range<Decoration>[] = [];
  for (const embed of findTaskEmbeds(doc.toString())) {
    const line = doc.line(embed.line + 1);
    const from = line.from + embed.indent.length;
    const to = line.from + line.text.trimEnd().length;
    ranges.push(
      Decoration.replace({
        widget: new TaskEmbedWidget(embed.id, host),
      }).range(from, to),
    );
  }
  return Decoration.set(ranges);
}

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
    draftLines,
    EditorView.updateListener.of((update) => {
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(createdEffect)) onCreate(effect.value);
        }
        const removed = onRemove ? removedEmbeds(tr) : [];
        if (removed.length > 0) onRemove?.(removed);
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
 * below it (adding one unless the next line is already blank), or to the end
 * of the embed's own line.
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
  } else if (
    line.number < doc.lines &&
    !doc.line(line.number + 1).text.trim()
  ) {
    const next = doc.line(line.number + 1);
    view.dispatch({ selection: { anchor: next.to }, scrollIntoView: true });
  } else {
    view.dispatch({
      changes: { from: line.to, insert: '\n' },
      selection: { anchor: line.to + 1 },
      scrollIntoView: true,
      userEvent: 'input',
    });
  }
}

/** Deletes the embed's line as a user edit; the caret ends the line above. */
export function deleteTaskEmbedLine(view: EditorView, widget: HTMLElement) {
  const at = view.posAtDOM(widget);
  view.focus();
  const { doc } = view.state;
  const line = doc.lineAt(at);
  const [from, to] =
    line.number > 1
      ? [line.from - 1, line.to]
      : [line.from, Math.min(line.to + 1, doc.length)];
  view.dispatch({
    changes: { from, to },
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
  renderEmbed: (
    id: string,
    leave: (below: boolean) => void,
    remove: () => void,
  ) => ReactNode;
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
          {createPortal(renderEmbed(id, leaveFrom(el), deleteFrom(el)), el)}
        </Fragment>
      ))}
    </>
  );

  return { extensions, portals };
}
