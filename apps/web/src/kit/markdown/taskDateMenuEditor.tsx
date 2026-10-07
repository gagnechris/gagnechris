import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  activeTaskDateIndex,
  CLOSED_TASK_DATE_MENU,
  openTaskDateQuery,
  type TaskDateMenuAction,
  taskDateMenuIds,
  taskDateMenuIsOpen,
  type TaskDateMenuItem,
  taskDateMenuItems,
  taskDateMenuKey,
  taskDateMenuReducer,
  type TaskDateMenuState as MenuState,
  type TaskDateQuery,
  taskDateToken,
  tokenInsertion,
  tomorrowOf,
} from '@gagnechris/shared';
import { useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PHONE_QUERY, useMediaQuery } from '../useMediaQuery';
import { TaskDateMenu } from '../tasks/TaskDateMenu';
import { TASK_LINE_PREFIX } from '../tasks/taskLine';

type Range = { from: number; to: number };

export type TaskDateMenuState = MenuState & {
  /** Document positions of the `@word` or `due:word` at the caret on a `[ ]` line. */
  query: TaskDateQuery | null;
};

const CLOSED: TaskDateMenuState = { ...CLOSED_TASK_DATE_MENU, query: null };

const menuEffect = StateEffect.define<TaskDateMenuAction>();

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
  taskDateMenuIsOpen(value, value.query?.from ?? null);

const reduce = (
  value: TaskDateMenuState,
  action: TaskDateMenuAction,
): TaskDateMenuState => ({
  ...taskDateMenuReducer(value, action),
  query: value.query,
});

function menuField(today: string) {
  return StateField.define<TaskDateMenuState>({
    create: (state) => ({ ...CLOSED, query: queryAt(state, today) }),
    update(value, tr) {
      let next = value;
      if (tr.docChanged) {
        next = reduce(next, {
          type: 'mapped',
          mapPos: (p) => tr.changes.mapPos(p),
        });
        if (tr.isUserEvent('input')) next = reduce(next, { type: 'typed' });
      }
      for (const effect of tr.effects) {
        if (effect.is(menuEffect)) next = reduce(next, effect.value);
      }
      if (tr.docChanged || tr.selection) {
        const query = queryAt(tr.state, today);
        const same =
          query?.from === next.query?.from &&
          query?.query === next.query?.query &&
          query?.kind === next.query?.kind;
        next = {
          ...(same ? next : reduce(next, { type: 'query-changed' })),
          query,
        };
      }
      return next;
    },
  });
}

function insertToken(view: EditorView, range: Range, token: string) {
  const change = tokenInsertion(
    range,
    token,
    view.state.doc.sliceString(range.to, range.to + 1),
  );
  view.dispatch({
    changes: { from: change.from, to: change.to, insert: change.insert },
    selection: EditorSelection.cursor(change.caret),
    effects: menuEffect.of({ type: 'close-picker' }),
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

  const onKey = (key: string) => (view: EditorView) => {
    const value = view.state.field(field);
    if (!taskDateMenuOpen(value) || value.picking) return false;
    const items = itemsOf(value);
    const action = taskDateMenuKey(key, items.length);
    if (action === 'choose') {
      const item = items[activeTaskDateIndex(value, items.length)];
      if (item) chooseTaskDate(view, value, item);
    } else if (action === 'dismiss') {
      view.dispatch({
        effects: menuEffect.of({
          type: 'dismiss',
          at: value.query?.from ?? null,
        }),
      });
    } else if (action) {
      view.dispatch({ effects: menuEffect.of(action) });
    }
    return action !== null;
  };

  return [
    field,
    Prec.highest(
      keymap.of([
        ...['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].map((key) => ({
          key,
          run: onKey(key),
        })),
        { key: 'Escape', run: onKey('Escape'), stopPropagation: true },
      ]),
    ),
    EditorView.contentAttributes.of((view) => {
      const value = view.state.field(field);
      const base = { 'aria-haspopup': 'listbox', 'aria-autocomplete': 'list' };
      if (!taskDateMenuOpen(value) || value.picking) return base;
      const items = itemsOf(value);
      const item = items[activeTaskDateIndex(value, items.length)];
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
    const { from, to, kind } = value.query;
    view.dispatch({
      effects: menuEffect.of({ type: 'pick', range: { from, to, kind } }),
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
      activeIndex={activeTaskDateIndex(value, items.length)}
      onActivate={(index) =>
        view?.dispatch({ effects: menuEffect.of({ type: 'activate', index }) })
      }
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
                  effects: menuEffect.of({ type: 'cancel-pick' }),
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
