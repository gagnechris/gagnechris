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

/** Position on the line the user last typed on; mapped through every change. */
const candidateField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    if (tr.effects.some((e) => e.is(createdEffect))) return null;
    if (tr.docChanged && isProgrammatic(tr)) return null;
    if (
      tr.docChanged &&
      (tr.isUserEvent('input') || tr.isUserEvent('delete'))
    ) {
      return tr.newSelection.main.head;
    }
    return value === null ? null : tr.changes.mapPos(value);
  },
});

/**
 * Converted line text → task id, so undo then leaving the same line again
 * re-embeds the task already created instead of creating a second one.
 */
const convertedField = StateField.define<ReadonlyMap<string, string>>({
  create: () => new Map(),
  update(value, tr) {
    const created = tr.effects.filter((e) => e.is(createdEffect));
    if (created.length === 0) return value;
    const next = new Map(value);
    for (const effect of created) {
      next.set(taskLineDraftKey(effect.value.draft), effect.value.id);
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

function convertLeftLine(newId: () => string) {
  return EditorState.transactionFilter.of((tr) => {
    const candidate = tr.startState.field(candidateField, false);
    if (candidate == null) return tr;
    const flush = tr.effects.some((e) => e.is(flushEffect));
    if (!flush && !tr.selection && !tr.docChanged) return tr;
    if (tr.docChanged && isProgrammatic(tr)) return tr;

    const doc = tr.newDoc;
    const line = doc.lineAt(tr.changes.mapPos(candidate));
    const head = doc.lineAt(tr.newSelection.main.head);
    if (!flush && head.number === line.number) return tr;

    const parsed = parseTaskLine(line.text);
    if (!parsed || insideFence(doc, line.number)) return tr;
    const id =
      tr.startState.field(convertedField).get(taskLineDraftKey(parsed.draft)) ??
      newId();
    return [
      tr,
      {
        changes: {
          from: line.from + parsed.indent.length,
          to: line.to,
          insert: taskEmbedToken(id),
        },
        effects: createdEffect.of({ id, draft: parsed.draft }),
        sequential: true,
      },
    ];
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
