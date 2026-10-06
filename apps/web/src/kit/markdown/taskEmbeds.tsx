import {
  EditorState,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
  type Range,
  type Text,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import { createUlid, findTaskEmbeds, taskEmbedToken } from '@gagnechris/shared';
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
import {
  parseTaskLine,
  taskLineDraftKey,
  type TaskLineDraft,
} from '../tasks/taskLine';

export type TaskEmbedCreate = { id: string; draft: TaskLineDraft };

type TaskEmbedHost = {
  attach: (el: HTMLElement, id: string) => void;
  detach: (el: HTMLElement) => void;
};

type TaskEmbedEditorOptions = {
  host: TaskEmbedHost;
  onCreate: (create: TaskEmbedCreate) => void;
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

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

function insideFence(doc: Text, lineNumber: number): boolean {
  let fence: string | null = null;
  for (let n = 1; n < lineNumber; n += 1) {
    const opener = FENCE.exec(doc.line(n).text)?.[1];
    if (!opener) continue;
    if (!fence) fence = opener;
    else if (opener[0] === fence[0] && opener.length >= fence.length) {
      fence = null;
    }
  }
  return fence !== null;
}

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

    const converted = tr.startState.field(convertedField);
    const text = doc.toString();
    const taken = new Set<string>();
    const changes: { from: number; to: number; insert: string }[] = [];
    const effects: StateEffect<TaskEmbedCreate>[] = [];
    for (const n of lineNumbers) {
      const line = doc.line(n);
      const parsed = parseTaskLine(line.text);
      if (!parsed || insideFence(doc, n)) continue;
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

  // The row's checkbox and link handle their own clicks.
  ignoreEvent() {
    return true;
  }
}

const draftLine = Decoration.line({ class: 'cm-task-draft' });

function buildDecorations(state: EditorState, host: TaskEmbedHost) {
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
  for (let n = 1; n <= doc.lines; n += 1) {
    const line = doc.line(n);
    if (parseTaskLine(line.text)) ranges.push(draftLine.range(line.from));
  }
  return Decoration.set(ranges, true);
}

export function taskEmbedEditor({
  host,
  onCreate,
  newId = createUlid,
}: TaskEmbedEditorOptions): Extension {
  const decorations = StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, host),
    update: (deco, tr) =>
      tr.docChanged ? buildDecorations(tr.state, host) : deco,
    provide: (field) => [
      EditorView.decorations.from(field),
      EditorView.atomicRanges.of((view) => view.state.field(field)),
    ],
  });

  return [
    candidateField,
    convertedField,
    convertLeftLine(newId),
    decorations,
    EditorView.updateListener.of((update) => {
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(createdEffect)) onCreate(effect.value);
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

let mountKey = 0;

/**
 * Embed rows render as React portals into CodeMirror widgets, so they share
 * the page's router and data context.
 */
export function useTaskEmbedEditor({
  onCreate,
  renderEmbed,
  newId,
}: {
  onCreate: (create: TaskEmbedCreate) => void;
  renderEmbed: (id: string) => ReactNode;
  newId?: () => string;
}) {
  const [mounts, setMounts] = useState<
    ReadonlyMap<HTMLElement, { id: string; key: number }>
  >(() => new Map());
  const onCreateRef = useRef(onCreate);
  useEffect(() => {
    onCreateRef.current = onCreate;
  }, [onCreate]);
  const host = useMemo<TaskEmbedHost>(
    () => ({
      attach: (el, id) => {
        mountKey += 1;
        const key = mountKey;
        setMounts((prev) => new Map(prev).set(el, { id, key }));
      },
      detach: (el) =>
        setMounts((prev) => {
          if (!prev.has(el)) return prev;
          const next = new Map(prev);
          next.delete(el);
          return next;
        }),
    }),
    [],
  );

  const create = useCallback((value: TaskEmbedCreate) => {
    onCreateRef.current(value);
  }, []);

  const extensions = useMemo(
    () => [taskEmbedEditor({ host, onCreate: create, newId })],
    [create, host, newId],
  );

  const portals = (
    <>
      {[...mounts].map(([el, { id, key }]) => (
        <Fragment key={key}>{createPortal(renderEmbed(id), el)}</Fragment>
      ))}
    </>
  );

  return { extensions, portals };
}
