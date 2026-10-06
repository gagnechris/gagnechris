import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { taskDateToken } from '@gagnechris/shared';
import { useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PHONE_QUERY, useMediaQuery } from '../useMediaQuery';
import { TaskDateMenu } from '../tasks/TaskDateMenu';
import {
  openTaskDateQuery,
  taskDateMenuIds,
  taskDateMenuItems,
  tokenNeedsDate,
  tomorrowOf,
  type TaskDateKind,
  type TaskDateMenuItem,
  type TaskDateQuery,
} from '../tasks/taskDateMenuItems';

type Range = { from: number; to: number };
type PickRange = Range & { kind: TaskDateKind };

export type TaskDateMenuState = {
  /** Document positions of the `@word` or `due:word` at the caret on a `[ ]` line. */
  query: TaskDateQuery | null;
  active: number;
  dismissedAt: number | null;
  picking: PickRange | null;
};

const CLOSED: TaskDateMenuState = {
  query: null,
  active: 0,
  dismissedAt: null,
  picking: null,
};

const activeEffect = StateEffect.define<number>();
const dismissEffect = StateEffect.define<null>();
const pickEffect = StateEffect.define<PickRange | null>();

const TASK_LINE_PREFIX = /^[ \t]*\[ \][ \t]+/;

function queryAt(state: EditorState, today: string): TaskDateQuery | null {
  const { main } = state.selection;
  if (!main.empty) return null;
  const line = state.doc.lineAt(main.head);
  const prefix = TASK_LINE_PREFIX.exec(line.text);
  if (!prefix) return null;
  const q = openTaskDateQuery(line.text, main.head - line.from, today);
  if (!q || q.from < prefix[0].length) return null;
  return { ...q, from: line.from + q.from, to: line.from + q.to };
}

export const taskDateMenuOpen = (value: TaskDateMenuState) =>
  value.picking !== null ||
  (value.query !== null && value.query.from !== value.dismissedAt);

function menuField(today: string) {
  return StateField.define<TaskDateMenuState>({
    create: (state) => ({ ...CLOSED, query: queryAt(state, today) }),
    update(value, tr) {
      let next = value;
      if (tr.docChanged) {
        next = {
          ...next,
          // Typing reopens a menu closed with Esc, as in the quick-add.
          dismissedAt: tr.isUserEvent('input')
            ? null
            : next.dismissedAt === null
              ? null
              : tr.changes.mapPos(next.dismissedAt),
          picking: next.picking && {
            ...next.picking,
            from: tr.changes.mapPos(next.picking.from),
            to: tr.changes.mapPos(next.picking.to),
          },
        };
      }
      for (const effect of tr.effects) {
        if (effect.is(activeEffect)) next = { ...next, active: effect.value };
        if (effect.is(dismissEffect)) {
          next = { ...next, dismissedAt: next.query?.from ?? null };
        }
        if (effect.is(pickEffect)) next = { ...next, picking: effect.value };
      }
      if (tr.docChanged || tr.selection) {
        const query = queryAt(tr.state, today);
        const same =
          query?.from === next.query?.from &&
          query?.query === next.query?.query &&
          query?.kind === next.query?.kind;
        next = { ...next, query, active: same ? next.active : 0 };
      }
      return next;
    },
  });
}

function insertToken(view: EditorView, range: Range, token: string) {
  const following = view.state.doc.sliceString(range.to, range.to + 1);
  const spaced = /^\s/.test(following);
  const open = tokenNeedsDate(token);
  const insert = spaced || (open && following === '') ? token : `${token} `;
  const caret = range.from + token.length + (open ? 0 : 1);
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(caret),
    effects: pickEffect.of(null),
    userEvent: 'input.complete',
  });
}

export type TaskDateMenuEditorOptions = {
  today: string;
  baseId: string;
  onChange: (view: EditorView, value: TaskDateMenuState) => void;
};

/** The `@` and `due:` date menu on `[ ] …` lines; React renders it from `onChange`. */
export function taskDateMenuEditor({
  today,
  baseId,
  onChange,
}: TaskDateMenuEditorOptions): Extension {
  const field = menuField(today);
  const ids = taskDateMenuIds(baseId);
  const itemsOf = (value: TaskDateMenuState) =>
    value.query
      ? taskDateMenuItems(today, value.query.query, value.query.kind)
      : [];

  const whenOpen =
    (run: (view: EditorView, value: TaskDateMenuState) => void) =>
    (view: EditorView) => {
      const value = view.state.field(field);
      if (!taskDateMenuOpen(value) || value.picking) return false;
      run(view, value);
      return true;
    };
  const move = (step: number | 'first' | 'last') =>
    whenOpen((view, value) => {
      const count = itemsOf(value).length;
      const active =
        step === 'first'
          ? 0
          : step === 'last'
            ? count - 1
            : (Math.min(value.active, count - 1) + step + count) % count;
      view.dispatch({ effects: activeEffect.of(active) });
    });

  return [
    field,
    Prec.highest(
      keymap.of([
        { key: 'ArrowDown', run: move(1) },
        { key: 'ArrowUp', run: move(-1) },
        { key: 'Home', run: move('first') },
        { key: 'End', run: move('last') },
        {
          key: 'Enter',
          run: whenOpen((view, value) => {
            const items = itemsOf(value);
            const item = items[Math.min(value.active, items.length - 1)];
            if (item) chooseTaskDate(view, value, item);
          }),
        },
        {
          key: 'Escape',
          run: whenOpen((view) => {
            view.dispatch({ effects: dismissEffect.of(null) });
          }),
          stopPropagation: true,
        },
      ]),
    ),
    EditorView.contentAttributes.of((view) => {
      const value = view.state.field(field);
      const base = { 'aria-haspopup': 'listbox', 'aria-autocomplete': 'list' };
      if (!taskDateMenuOpen(value) || value.picking) return base;
      const items = itemsOf(value);
      const item = items[Math.min(value.active, items.length - 1)];
      return {
        ...base,
        'aria-controls': ids.listbox,
        'aria-describedby': ids.hint,
        ...(item ? { 'aria-activedescendant': ids.option(item.id) } : {}),
      };
    }),
    EditorView.updateListener.of((update) => {
      const before = update.startState.field(field);
      const after = update.state.field(field);
      if (
        before !== after ||
        update.focusChanged ||
        ((update.geometryChanged || update.viewportChanged) &&
          taskDateMenuOpen(after))
      ) {
        onChange(update.view, after);
      }
    }),
  ];
}

function chooseTaskDate(
  view: EditorView,
  value: TaskDateMenuState,
  item: TaskDateMenuItem,
) {
  if (!value.query) return;
  if (item.token) {
    insertToken(view, value.query, item.token);
  } else {
    view.dispatch({
      effects: pickEffect.of({
        from: value.query.from,
        to: value.query.to,
        kind: value.query.kind,
      }),
    });
  }
}

type Snapshot = {
  view: EditorView;
  value: TaskDateMenuState;
  focused: boolean;
  anchor: { left: number; top: number } | null;
};

/** Wires the editor extension to a portalled `TaskDateMenu`. */
export function useTaskDateMenuEditor({
  today,
  hint,
}: {
  today: string;
  hint: string;
}) {
  const baseId = useId();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [picked, setPicked] = useState('');
  const docked = useMediaQuery(PHONE_QUERY);

  const extensions = useMemo(
    () => [
      taskDateMenuEditor({
        today,
        baseId,
        onChange: (view, value) => {
          const coords =
            value.query && taskDateMenuOpen(value)
              ? view.coordsAtPos(value.query.from)
              : null;
          setSnap({
            view,
            value,
            focused: view.hasFocus,
            anchor: coords ? { left: coords.left, top: coords.bottom } : null,
          });
        },
      }),
    ],
    [today, baseId],
  );

  const value = snap?.value ?? CLOSED;
  // Pick a date… holds focus in the menu while the line waits for its day.
  const open =
    taskDateMenuOpen(value) && (value.picking !== null || !!snap?.focused);
  const items = value.query
    ? taskDateMenuItems(today, value.query.query, value.query.kind)
    : [];
  const view = snap?.view;
  const picking = value.picking;
  const pickedDay = picked || tomorrowOf(today);

  const menu = createPortal(
    <TaskDateMenu
      baseId={baseId}
      open={open}
      kind={picking?.kind ?? value.query?.kind ?? 'start'}
      items={items}
      activeIndex={Math.min(value.active, items.length - 1)}
      onActivate={(i) => view?.dispatch({ effects: activeEffect.of(i) })}
      onChoose={(item) => {
        if (view) chooseTaskDate(view, value, item);
      }}
      hint={hint}
      docked={docked}
      style={
        snap?.anchor
          ? {
              position: 'fixed',
              left: snap.anchor.left,
              top: snap.anchor.top + 4,
            }
          : undefined
      }
      picker={
        picking && view
          ? {
              value: pickedDay,
              onChange: setPicked,
              onSet: () => {
                if (!pickedDay) return;
                setPicked('');
                insertToken(
                  view,
                  picking,
                  taskDateToken(
                    pickedDay,
                    today,
                    picking.kind === 'due' ? 'due:' : '@',
                  ),
                );
                view.focus();
              },
              onCancel: () => {
                setPicked('');
                view.dispatch({
                  selection: EditorSelection.cursor(picking.to),
                  effects: [pickEffect.of(null), dismissEffect.of(null)],
                });
                view.focus();
              },
            }
          : null
      }
    />,
    document.body,
  );

  return { extensions, menu };
}
