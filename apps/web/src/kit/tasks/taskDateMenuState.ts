import { tokenNeedsDate, type TaskDateKind } from './taskDateMenuItems';

/** The `@word` / `due:word` a Pick a date… replaces once the day is set. */
export type TaskDateMenuRange = {
  from: number;
  to: number;
  kind: TaskDateKind;
};

export type TaskDateMenuState = {
  active: number;
  /** The query start whose menu was closed with Esc; it stays closed. */
  dismissedAt: number | null;
  /** Set while Pick a date… asks for the day. */
  picking: TaskDateMenuRange | null;
};

export const CLOSED_TASK_DATE_MENU: TaskDateMenuState = {
  active: 0,
  dismissedAt: null,
  picking: null,
};

export type TaskDateMenuAction =
  | { type: 'move'; step: 1 | -1 | 'first' | 'last'; count: number }
  | { type: 'activate'; index: number }
  | { type: 'dismiss'; at: number | null }
  | { type: 'pick'; range: TaskDateMenuRange }
  /** A token went in, or the field lost focus mid-pick. */
  | { type: 'close-picker' }
  /** Esc in the date field: back to the text, menu closed for this query. */
  | { type: 'cancel-pick' }
  /** Typing reopens a menu closed with Esc. */
  | { type: 'typed' }
  | { type: 'query-changed' }
  /** Text changed elsewhere: positions follow it. */
  | { type: 'mapped'; mapPos: (pos: number) => number }
  | { type: 'reset' };

export const activeTaskDateIndex = (state: TaskDateMenuState, count: number) =>
  Math.min(state.active, count - 1);

/** The one state machine behind the quick-add, note-line and Snooze menus. */
export function taskDateMenuReducer(
  state: TaskDateMenuState,
  action: TaskDateMenuAction,
): TaskDateMenuState {
  switch (action.type) {
    case 'move': {
      const { count, step } = action;
      if (count === 0) return state;
      const active =
        step === 'first'
          ? 0
          : step === 'last'
            ? count - 1
            : (activeTaskDateIndex(state, count) + step + count) % count;
      return { ...state, active };
    }
    case 'activate':
      return { ...state, active: action.index };
    case 'dismiss':
      return { ...state, dismissedAt: action.at };
    case 'pick':
      return { ...state, picking: action.range };
    case 'close-picker':
      return state.picking || state.active
        ? { ...state, picking: null, active: 0 }
        : state;
    case 'cancel-pick':
      return state.picking
        ? { ...state, dismissedAt: state.picking.from, picking: null }
        : state;
    case 'typed':
      return { ...state, dismissedAt: null, active: 0 };
    case 'query-changed':
      return state.active === 0 ? state : { ...state, active: 0 };
    case 'mapped': {
      const { mapPos } = action;
      return {
        ...state,
        dismissedAt:
          state.dismissedAt === null ? null : mapPos(state.dismissedAt),
        picking: state.picking && {
          ...state.picking,
          from: mapPos(state.picking.from),
          to: mapPos(state.picking.to),
        },
      };
    }
    case 'reset':
      return CLOSED_TASK_DATE_MENU;
  }
}

export const taskDateMenuIsOpen = (
  state: TaskDateMenuState,
  queryFrom: number | null,
) =>
  state.picking !== null ||
  (queryFrom !== null && queryFrom !== state.dismissedAt);

export type TaskDateMenuKey =
  Extract<TaskDateMenuAction, { type: 'move' }> | 'choose' | 'dismiss' | null;

/** What a key does on an open option list; null leaves it to the field. */
export function taskDateMenuKey(
  key: string,
  count: number,
  { chooseWithSpace = false }: { chooseWithSpace?: boolean } = {},
): TaskDateMenuKey {
  if (key === 'ArrowDown') return { type: 'move', step: 1, count };
  if (key === 'ArrowUp') return { type: 'move', step: -1, count };
  if (key === 'Home') return { type: 'move', step: 'first', count };
  if (key === 'End') return { type: 'move', step: 'last', count };
  if (key === 'Enter' || (chooseWithSpace && key === ' ')) return 'choose';
  if (key === 'Escape') return 'dismiss';
  return null;
}

/**
 * Replaces `range` with `token`. One space follows a finished token unless
 * whitespace already does; `due:` takes none, since its date comes next.
 */
export function tokenInsertion(
  range: { from: number; to: number },
  token: string,
  following: string,
): { from: number; to: number; insert: string; caret: number } {
  const open = tokenNeedsDate(token);
  const spaced = /^\s/.test(following);
  const insert = spaced || (open && following === '') ? token : `${token} `;
  return {
    from: range.from,
    to: range.to,
    insert,
    caret: range.from + token.length + (open ? 0 : 1),
  };
}
