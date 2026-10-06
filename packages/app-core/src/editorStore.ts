import { useCallback, useReducer, useState } from 'react';

/** `adopting`: an unmounted editor's unsaved edits to this document are still settling. */
export type EditorPhase = 'adopting' | 'hydrating' | 'editing';

export type EditorState<TDraft> = {
  phase: EditorPhase;
  hydratedId: string | null;
  /** Edits taken over from an unmounted editor; they win over the server copy at hydration. */
  adopted: { draft: TDraft; version: number } | null;
  draft: TDraft;
  /** The server version the draft is based on: what the next save or publish sends. */
  boundVersion: number;
  dirty: boolean;
  busy: boolean;
};

export type EditorAction<TDraft> =
  | { type: 'adoptStart' }
  | {
      type: 'adoptDone';
      adopted: { draft: TDraft; version: number } | null;
    }
  | {
      type: 'hydrate';
      id: string;
      draft: TDraft;
      version: number;
      dirty: boolean;
    }
  | { type: 'edit'; update: (prev: TDraft) => TDraft }
  | { type: 'replace'; draft: TDraft; version: number }
  | { type: 'bind'; version: number }
  | { type: 'dirty'; dirty: boolean }
  | { type: 'busy'; busy: boolean };

const patch = <TDraft>(
  state: EditorState<TDraft>,
  next: Partial<EditorState<TDraft>>,
): EditorState<TDraft> => {
  const changed = (Object.keys(next) as (keyof EditorState<TDraft>)[]).some(
    (key) => !Object.is(state[key], next[key]),
  );
  return changed ? { ...state, ...next } : state;
};

export function editorReducer<TDraft>(
  state: EditorState<TDraft>,
  action: EditorAction<TDraft>,
): EditorState<TDraft> {
  switch (action.type) {
    case 'adoptStart':
      return patch(state, { phase: 'adopting' });
    case 'adoptDone':
      return patch(state, {
        phase: state.hydratedId === null ? 'hydrating' : 'editing',
        adopted: action.adopted ?? state.adopted,
      });
    case 'hydrate':
      return patch(state, {
        phase: 'editing',
        hydratedId: action.id,
        draft: action.draft,
        boundVersion: action.version,
        dirty: action.dirty,
      });
    case 'edit':
      return patch(state, { draft: action.update(state.draft), dirty: true });
    case 'replace':
      return patch(state, {
        draft: action.draft,
        boundVersion: action.version,
      });
    case 'bind':
      return patch(state, { boundVersion: action.version });
    case 'dirty':
      return patch(state, { dirty: action.dirty });
    case 'busy':
      return patch(state, { busy: action.busy });
  }
}

/**
 * Editor state that callbacks read synchronously: an async save or publish
 * sees the version the previous request bound before React re-renders. It
 * outlives unmount so a background flush keeps its version current.
 */
export function useEditorStore<TDraft>(init: () => EditorState<TDraft>) {
  const [store] = useState(() => {
    let state = init();
    return {
      getState: () => state,
      apply: (action: EditorAction<TDraft>): boolean => {
        const next = editorReducer(state, action);
        if (next === state) return false;
        state = next;
        return true;
      },
    };
  });
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // Safe during render too: React re-runs the component, which then reads the new state.
  const dispatch = useCallback(
    (action: EditorAction<TDraft>) => {
      if (store.apply(action)) rerender();
    },
    [store],
  );
  return { state: store.getState(), getState: store.getState, dispatch };
}
