import type { EditorState, Extension, Range, Text } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import {
  fenceLineKind,
  liveMarkdownLine,
  parseTaskEmbedLine,
  scanFences,
  type FenceBlock,
  type LiveLineStyle,
  type LiveMark,
} from '@gagnechris/shared';

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

const lineDecorations: Record<LiveLineStyle, Decoration> = {
  h1: headingLines[0]!,
  h2: headingLines[1]!,
  h3: headingLines[2]!,
  h4: headingLines[3]!,
  h5: headingLines[4]!,
  h6: headingLines[5]!,
  quote: quoteLine,
  fence: fenceLine,
  code: codeLine,
};

function markDecoration(mark: LiveMark): Decoration {
  switch (mark.kind) {
    case 'hide':
      return hide;
    case 'bullet':
      return bullet;
    case 'strong':
      return strongMark;
    case 'em':
      return emphasisMark;
    case 'code':
      return codeMark;
    case 'link':
      return Decoration.mark({
        class: 'cm-md-link',
        attributes: { title: mark.href ?? '' },
      });
  }
}

const fencesOf = (doc: Text) => scanFences(doc.iterLines());

/** Decorations for the lines in `ranges` (the viewport, or the whole doc). */
export function buildLivePreview(
  state: EditorState,
  ranges: readonly { from: number; to: number }[] = [
    { from: 0, to: state.doc.length },
  ],
  fences: readonly FenceBlock[] = fencesOf(state.doc),
): DecorationSet {
  const doc = state.doc;
  const active = activeLines(state);
  const out: Range<Decoration>[] = [];
  let last = 0;
  for (const range of ranges) {
    const first = Math.max(doc.lineAt(range.from).number, last + 1);
    const end = doc.lineAt(range.to).number;
    for (let n = first; n <= end; n += 1) {
      decorateLine(doc.line(n), n, active, fences, out);
    }
    last = Math.max(last, end);
  }
  return Decoration.set(out, true);
}

function decorateLine(
  line: { from: number; text: string },
  n: number,
  active: Set<number>,
  fences: readonly FenceBlock[],
  out: Range<Decoration>[],
) {
  const fenced = fenceLineKind(fences, n - 1);
  if (fenced) {
    out.push(lineDecorations[fenced].range(line.from));
    return;
  }
  if (parseTaskEmbedLine(line.text)) return;

  const { style, marks } = liveMarkdownLine(line.text);
  if (style) out.push(lineDecorations[style].range(line.from));
  if (active.has(n)) return;
  for (const mark of marks) {
    out.push(
      markDecoration(mark).range(line.from + mark.from, line.from + mark.to),
    );
  }
}

// Fences are rescanned only when the doc changes; decorations cover the viewport.
const plugin = ViewPlugin.fromClass(
  class {
    fences: readonly FenceBlock[];
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.fences = fencesOf(view.state.doc);
      this.decorations = buildLivePreview(
        view.state,
        view.visibleRanges,
        this.fences,
      );
    }

    update(update: ViewUpdate) {
      if (update.docChanged) this.fences = fencesOf(update.state.doc);
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLivePreview(
          update.state,
          update.view.visibleRanges,
          this.fences,
        );
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
