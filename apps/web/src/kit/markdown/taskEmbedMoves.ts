import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { findTaskEmbeds } from '@gagnechris/shared';
import { moveLinesDown, moveLinesUp } from './lineMoves';
import {
  blockAt,
  jumpSection,
  moveBlock,
  moveBlockToSection,
  noteHeadings,
  sectionOf,
  type LineBlock,
} from './taskBlockMoves';

let liveRegion: HTMLElement | null = null;

/** Says a move out loud to screen readers. */
export function announceMove(text: string) {
  if (!liveRegion?.isConnected) {
    liveRegion = document.createElement('div');
    liveRegion.className = 'kit-visually-hidden';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    document.body.append(liveRegion);
  }
  // A repeat of the same words is announced again only after a change.
  liveRegion.textContent = '';
  const region = liveRegion;
  setTimeout(() => {
    region.textContent = text;
  }, 50);
}

const lineOf = (view: EditorView, widget: HTMLElement) =>
  view.state.doc.lineAt(view.posAtDOM(widget)).number;

const sectionTitle = (view: EditorView, line: number) =>
  sectionOf(noteHeadings(view.state.doc), line)?.title ?? null;

/** Where the embed with `id` sits now, for the announcement after a move. */
function lineOfId(view: EditorView, id: string): number | null {
  const embed = findTaskEmbeds(view.state.doc.toString()).find(
    (e) => e.id === id,
  );
  return embed ? embed.line + 1 : null;
}

/** The row is drawn again after a move; focus goes back into it. */
export function refocusTaskEmbed(
  view: EditorView,
  id: string,
  selector: string,
) {
  setTimeout(() => {
    const el = view.contentDOM.querySelector<HTMLElement>(
      `.cm-task-embed[data-task-id="${id}"] ${selector}`,
    );
    el?.focus();
  }, 0);
}

function announceAfter(
  view: EditorView,
  id: string,
  before: string | null,
  dir: 'up' | 'down',
) {
  const line = lineOfId(view, id);
  const after = line === null ? null : sectionTitle(view, line);
  announceMove(
    after !== before && after
      ? `Moved to ${after}`
      : dir === 'up'
        ? 'Moved up'
        : 'Moved down',
  );
}

/**
 * ⌥↑ / ⌥↓ moves the task's line like a list item; with ⇧ it jumps to the
 * section before or after.
 */
export function shiftTaskEmbed(
  view: EditorView,
  line: number,
  dir: 'up' | 'down',
  bySection: boolean,
) {
  const { state } = view;
  const id = findTaskEmbeds(state.doc.line(line).text)[0]?.id;
  if (!id) return;
  const block = blockAt(state.doc, line);
  if (bySection) {
    const jump = jumpSection(state, block, dir);
    if (!jump) return;
    view.dispatch(jump.spec);
    announceMove(jump.to ? `Moved to ${jump.to.title}` : 'Moved to the top');
    return;
  }
  const before = sectionTitle(view, line);
  const head = state.doc.line(line).from;
  if (state.selection.main.head !== head || !state.selection.main.empty) {
    view.dispatch({ selection: { anchor: head } });
  }
  const docBefore = view.state.doc;
  (dir === 'up' ? moveLinesUp : moveLinesDown)(view);
  if (view.state.doc !== docBefore) announceAfter(view, id, before, dir);
}

export function shiftTaskEmbedFrom(
  view: EditorView,
  widget: HTMLElement,
  dir: 'up' | 'down',
  bySection: boolean,
) {
  shiftTaskEmbed(view, lineOf(view, widget), dir, bySection);
}

/** The note's `##` section titles, for Move to. */
export const taskEmbedSections = (view: EditorView) =>
  noteHeadings(view.state.doc).map((h) => h.title);

export function moveTaskEmbedToSection(
  view: EditorView,
  widget: HTMLElement,
  index: number,
) {
  const heading = noteHeadings(view.state.doc)[index];
  if (!heading) return;
  const block = blockAt(view.state.doc, lineOf(view, widget));
  const spec = moveBlockToSection(view.state, block, heading);
  if (spec) view.dispatch(spec);
  announceMove(`Moved to ${heading.title}`);
}

/**
 * The task's line and the lines under it, with the row's own indent taken off,
 * and a way to take them out of the note later. Taking them out keeps their
 * tasks and leaves undo alone: they now live in another note.
 */
export function taskEmbedBlock(view: EditorView, widget: HTMLElement) {
  const id = widget.dataset.taskId ?? '';
  const { doc } = view.state;
  const { first, last } = blockAt(doc, lineOf(view, widget));
  const rows: string[] = [];
  for (let n = first; n <= last; n += 1) rows.push(doc.line(n).text);
  const indent = /^[ \t]*/.exec(rows[0]!)![0].length;
  const lines = rows
    .map((row) => row.slice(Math.min(indent, /^[ \t]*/.exec(row)![0].length)))
    .join('\n');
  const remove = () => {
    const line = lineOfId(view, id);
    if (line === null) return;
    const now = view.state.doc;
    const block = blockAt(now, line);
    const [from, to] =
      block.last < now.lines
        ? [now.line(block.first).from, now.line(block.last + 1).from]
        : [
            block.first > 1 ? now.line(block.first - 1).to : 0,
            now.line(block.last).to,
          ];
    view.dispatch({
      changes: { from, to },
      annotations: Transaction.addToHistory.of(false),
    });
  };
  return { lines, remove };
}

const EDGE = 48;
const HEADING_LINE = /^##[ \t]/;

/** The nearest scrolling box: the editor's own, or the page. */
function scroller(view: EditorView): HTMLElement | null {
  const own = view.scrollDOM;
  return own.scrollHeight > own.clientHeight + 1 ? own : null;
}

/** Drags the task's row, with the lines under it, to another place in the note. */
export function dragTaskEmbed(
  view: EditorView,
  widget: HTMLElement,
  start: PointerEvent,
) {
  if (start.button !== 0) return;
  start.preventDefault();
  const id = widget.dataset.taskId ?? '';
  const startDoc = view.state.doc;
  const block: LineBlock = blockAt(startDoc, lineOf(view, widget));
  const before = sectionTitle(view, block.first);
  const rect = widget.getBoundingClientRect();
  const offsetY = start.clientY - rect.top;
  const row = widget.querySelector<HTMLElement>('.task-embed') ?? widget;

  const ghost = row.cloneNode(true) as HTMLElement;
  ghost.classList.add('task-embed-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
  });
  document.body.append(ghost);
  const indicator = document.createElement('div');
  indicator.className = 'task-drop-indicator';
  indicator.hidden = true;
  document.body.append(indicator);
  widget.classList.add('cm-task-embed--lifted');

  let target: number | null = null;
  let y = start.clientY;
  let frame = 0;

  const place = () => {
    ghost.style.top = `${y - offsetY}px`;
    const { doc } = view.state;
    const content = view.contentDOM.getBoundingClientRect();
    const pos = view.posAtCoords({ x: content.left + 4, y }, false);
    const line = doc.lineAt(pos);
    const box = view.lineBlockAt(line.from);
    const mid = view.documentTop + (box.top + box.bottom) / 2;
    const next = HEADING_LINE.test(line.text)
      ? line.number + 1
      : y < mid
        ? line.number
        : line.number + 1;
    target = next >= block.first && next <= block.last + 1 ? null : next;
    indicator.hidden = target === null;
    if (target === null) return;
    const at =
      target > doc.lines
        ? view.documentTop + view.lineBlockAt(doc.length).bottom
        : view.documentTop + view.lineBlockAt(doc.line(target).from).top;
    Object.assign(indicator.style, {
      left: `${content.left}px`,
      width: `${content.width}px`,
      top: `${at - 1}px`,
    });
  };

  const scroll = () => {
    const step =
      y < EDGE
        ? -(EDGE - y) / 3
        : y > window.innerHeight - EDGE
          ? (y - (window.innerHeight - EDGE)) / 3
          : 0;
    if (step) {
      const box = scroller(view);
      if (box) box.scrollTop += step;
      else window.scrollBy(0, step);
      place();
    }
    frame = requestAnimationFrame(scroll);
  };

  const onMove = (e: PointerEvent) => {
    y = e.clientY;
    place();
  };
  const finish = (drop: boolean) => {
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey, true);
    ghost.remove();
    indicator.remove();
    widget.classList.remove('cm-task-embed--lifted');
    if (!drop || target === null || view.state.doc !== startDoc) return;
    const spec = moveBlock(view.state, block, target, 'move.drop');
    if (!spec) return;
    view.dispatch(spec);
    announceAfter(view, id, before, target < block.first ? 'up' : 'down');
  };
  const onUp = () => finish(true);
  const onCancel = () => finish(false);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    finish(false);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey, true);
  place();
  frame = requestAnimationFrame(scroll);
}
