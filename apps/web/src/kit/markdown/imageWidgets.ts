import {
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const IMAGE = /!\[([^\]\n]*)\]\(([^)\s]+)(?:[ \t]+"[^"\n]*")?\)/g;

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-md-image';
    img.src = this.src;
    img.alt = this.alt;
    img.loading = 'lazy';
    return img;
  }
}

function buildImages(
  state: EditorState,
  resolveSrc: (src: string) => string,
): DecorationSet {
  const doc = state.doc;
  const out: Range<Decoration>[] = [];
  let fence: string | null = null;
  for (let n = 1; n <= doc.lines; n += 1) {
    const line = doc.line(n);
    const opener = FENCE.exec(line.text)?.[1];
    if (fence) {
      if (opener && opener[0] === fence[0] && opener.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (opener) {
      fence = opener;
      continue;
    }
    for (const m of line.text.matchAll(IMAGE)) {
      const from = line.from + m.index;
      out.push(
        Decoration.replace({
          widget: new ImageWidget(resolveSrc(m[2]!), m[1]!),
        }).range(from, from + m[0].length),
      );
    }
  }
  return Decoration.set(out);
}

/**
 * `![alt](src)` renders as the image. The widget is atomic: the caret steps
 * over it and Backspace removes the whole markdown; Markdown view edits it.
 */
export function markdownImages({
  resolveSrc = (src) => src,
}: { resolveSrc?: (src: string) => string } = {}): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => buildImages(state, resolveSrc),
    update: (deco, tr) =>
      tr.docChanged ? buildImages(tr.state, resolveSrc) : deco,
    provide: (f) => [
      EditorView.decorations.from(f),
      EditorView.atomicRanges.of((view) => view.state.field(f)),
    ],
  });
  return field;
}
