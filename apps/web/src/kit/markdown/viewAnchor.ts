import type { EditorView } from '@codemirror/view';

export function scrollParent(el: Element): Element {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }
  return document.scrollingElement ?? document.documentElement;
}

function viewportTop(scroller: Element): number {
  return scroller === document.scrollingElement
    ? 0
    : scroller.getBoundingClientRect().top;
}

/** A point in a pane, as a fraction of its height, pinned to a viewport y. */
export type PaneAnchor = { fraction: number; y: number };

/**
 * The caret when it is on screen, else the top of what is visible: the spot
 * a reader is looking at when the pane is swapped for another rendering.
 */
export function paneAnchor(pane: Element, caretY?: number): PaneAnchor | null {
  const rect = pane.getBoundingClientRect();
  if (rect.height === 0) return null;
  const top = viewportTop(scrollParent(pane));
  const visible =
    caretY !== undefined && caretY >= top && caretY <= window.innerHeight;
  const y = visible ? caretY : Math.max(rect.top, top);
  return {
    fraction: Math.min(Math.max((y - rect.top) / rect.height, 0), 1),
    y,
  };
}

/** Scrolls so `anchor`'s fraction of `pane` sits at the anchor's viewport y. */
export function restorePaneAnchor(pane: Element, anchor: PaneAnchor) {
  const rect = pane.getBoundingClientRect();
  if (rect.height === 0) return;
  scrollParent(pane).scrollTop +=
    rect.top + anchor.fraction * rect.height - anchor.y;
}

export function caretViewportY(view: EditorView): number | undefined {
  if (!view.hasFocus) return undefined;
  return view.coordsAtPos(view.state.selection.main.head)?.top;
}

/** A doc position and its viewport y: the caret if on screen, else the top visible line. */
export type DocAnchor = { pos: number; y: number };

export function docAnchor(view: EditorView): DocAnchor | null {
  const rect = view.dom.getBoundingClientRect();
  if (rect.height === 0) return null;
  const caretY = caretViewportY(view);
  const top = Math.max(viewportTop(scrollParent(view.dom)), 0);
  if (caretY !== undefined && caretY >= top && caretY <= window.innerHeight) {
    return { pos: view.state.selection.main.head, y: caretY };
  }
  const line = view.lineBlockAtHeight(Math.max(top - view.documentTop, 0));
  const y = view.coordsAtPos(line.from)?.top;
  return y === undefined ? null : { pos: line.from, y };
}

/** After a reconfigure, scrolls so `anchor.pos` is back at its viewport y. */
export function restoreDocAnchor(view: EditorView, anchor: DocAnchor) {
  view.requestMeasure({
    read: () => view.coordsAtPos(anchor.pos)?.top,
    write: (y) => {
      if (y === undefined) return;
      scrollParent(view.dom).scrollTop += y - anchor.y;
    },
  });
}
