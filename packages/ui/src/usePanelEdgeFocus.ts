import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * The collapse and expand controls replace each other, so focus on one would
 * drop to the body; `handOff` before a toggle sends it to the other.
 */
export function usePanelEdgeFocus(open: boolean) {
  const collapseRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<{ focusVisible: boolean } | null>(null);
  useLayoutEffect(() => {
    const options = pending.current;
    if (!options) return;
    pending.current = null;
    (open ? collapseRef : expandRef).current?.focus(options);
  }, [open]);
  // Focus that lands with no focused element shows a ring after a click too.
  const handOff = useCallback((focusVisible = true) => {
    pending.current = { focusVisible };
  }, []);
  return { collapseRef, expandRef, handOff };
}
