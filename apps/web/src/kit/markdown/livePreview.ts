import type { EditorState, Extension, Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { parseTaskEmbedLine } from '@gagnechris/shared';

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const HEADING = /^(#{1,6})([ \t]+)/;
const QUOTE = /^([ \t]{0,3}>[ \t]?)/;
const BULLET = /^([ \t]*)([-*+])([ \t]+)(?!\[[ xX]\])/;
const CODE_SPAN = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;
const LINK = /(?<!!)\[([^\]\n]+)\]\(([^)\s]+)(?:[ \t]+"[^"\n]*")?\)/g;
const STRONG = /(\*\*|__)(?=\S)([^\n]*?\S)\1/g;
const EMPHASIS = /(?<![*_\w])([*_])(?=[^\s*_])([^\n*_]*?[^\s*_])\1(?![*_\w])/g;

const hide = Decoration.replace({});
const lineClass = (cls: string) => Decoration.line({ class: cls });
const headingLines = [1, 2, 3, 4, 5, 6].map((n) => lineClass(`cm-md-h${n}`));
const quoteLine = lineClass('cm-md-quote');
const fenceLine = lineClass('cm-md-fence');
const codeLine = lineClass('cm-md-code-block');
const strongMark = Decoration.mark({ class: 'cm-md-strong' });
const emphasisMark = Decoration.mark({ class: 'cm-md-em' });
const codeMark = Decoration.mark({ class: 'cm-md-code' });

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-md-bullet';
    el.textContent = '•';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
}

const bullet = Decoration.replace({ widget: new BulletWidget() });

/** Lines any selection range touches; their markdown stays visible. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n += 1) lines.add(n);
  }
  return lines;
}

type Span = { from: number; to: number };

const overlaps = (taken: Span[], from: number, to: number) =>
  taken.some((s) => from < s.to && to > s.from);

function inlineDecorations(
  text: string,
  offset: number,
  out: Range<Decoration>[],
) {
  const taken: Span[] = [];
  for (const m of text.matchAll(CODE_SPAN)) {
    const from = m.index;
    const to = from + m[0].length;
    const tick = m[1]!.length;
    taken.push({ from, to });
    out.push(hide.range(offset + from, offset + from + tick));
    out.push(codeMark.range(offset + from + tick, offset + to - tick));
    out.push(hide.range(offset + to - tick, offset + to));
  }
  for (const m of text.matchAll(LINK)) {
    const from = m.index;
    const to = from + m[0].length;
    if (overlaps(taken, from, to)) continue;
    taken.push({ from, to });
    const labelEnd = from + 1 + m[1]!.length;
    out.push(hide.range(offset + from, offset + from + 1));
    out.push(
      Decoration.mark({
        class: 'cm-md-link',
        attributes: { title: m[2]! },
      }).range(offset + from + 1, offset + labelEnd),
    );
    out.push(hide.range(offset + labelEnd, offset + to));
  }
  for (const [pattern, mark] of [
    [STRONG, strongMark],
    [EMPHASIS, emphasisMark],
  ] as const) {
    for (const m of text.matchAll(pattern)) {
      const from = m.index;
      const to = from + m[0].length;
      const marker = m[1]!.length;
      if (
        overlaps(taken, from, from + marker) ||
        overlaps(taken, to - marker, to)
      ) {
        continue;
      }
      taken.push({ from, to: from + marker }, { from: to - marker, to });
      out.push(hide.range(offset + from, offset + from + marker));
      out.push(mark.range(offset + from + marker, offset + to - marker));
      out.push(hide.range(offset + to - marker, offset + to));
    }
  }
}

export function buildLivePreview(state: EditorState): DecorationSet {
  const doc = state.doc;
  const active = activeLines(state);
  const out: Range<Decoration>[] = [];
  let fence: string | null = null;
  for (let n = 1; n <= doc.lines; n += 1) {
    const line = doc.line(n);
    const text = line.text;
    const opener = FENCE.exec(text)?.[1];
    if (fence) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length) {
        fence = null;
        out.push(fenceLine.range(line.from));
      } else {
        out.push(codeLine.range(line.from));
      }
      continue;
    }
    if (opener) {
      fence = opener;
      out.push(fenceLine.range(line.from));
      continue;
    }
    if (parseTaskEmbedLine(text)) continue;

    const isActive = active.has(n);
    let bodyStart = 0;
    const heading = HEADING.exec(text);
    if (heading) {
      out.push(headingLines[heading[1]!.length - 1]!.range(line.from));
      bodyStart = heading[0].length;
      if (!isActive) out.push(hide.range(line.from, line.from + bodyStart));
    } else {
      const quote = QUOTE.exec(text);
      if (quote) {
        out.push(quoteLine.range(line.from));
        bodyStart = quote[0].length;
        if (!isActive) out.push(hide.range(line.from, line.from + bodyStart));
      }
      const item = BULLET.exec(text.slice(bodyStart));
      if (item && !isActive) {
        const at = line.from + bodyStart + item[1]!.length;
        out.push(bullet.range(at, at + 1));
      }
    }
    if (!isActive) {
      inlineDecorations(text.slice(bodyStart), line.from + bodyStart, out);
    }
  }
  return Decoration.set(out, true);
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreview(view.state);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = buildLivePreview(update.state);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * Renders markdown syntax in place and shows it again on the lines the
 * selection touches. Line-based: no markdown parser, which keeps the editor
 * chunk small.
 */
export function livePreview(): Extension {
  return [plugin, EditorView.editorAttributes.of({ class: 'cm-live' })];
}
