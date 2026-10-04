import { useCallback, useReducer } from 'react';

const RESET = Symbol('demo reset');

/**
 * A demo's whole state lives in the browser. `seed` runs again on every reset
 * so seeds relative to today stay fresh.
 */
export function useDemoReducer<S, A>(
  reducer: (state: S, action: A) => S,
  seed: () => S,
) {
  const [state, dispatchAny] = useReducer(
    (current: S, action: A | typeof RESET): S =>
      action === RESET ? seed() : reducer(current, action),
    undefined,
    seed,
  );
  const dispatch: (action: A) => void = dispatchAny;
  const reset = useCallback(() => dispatchAny(RESET), []);
  return { state, dispatch, reset };
}
