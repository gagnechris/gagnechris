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
import { MARKDOWN_IMAGE } from '@gagnechris/shared';

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

/** Maps a markdown `src` to a URL the app can load, now or once it resolves. */
export type ResolveImageSrc = (src: string) => string | Promise<string>;

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly resolveSrc: ResolveImageSrc,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }

  toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-md-image';
    img.alt = this.alt;
    img.loading = 'lazy';
    const resolved = this.resolveSrc(this.src);
    if (typeof resolved === 'string') {
      img.src = resolved;
    } else {
      img.classList.add('cm-md-image--loading');
      resolved.then(
        (url) => {
          img.src = url;
          img.classList.remove('cm-md-image--loading');
        },
        () => {
          img.classList.replace('cm-md-image--loading', 'cm-md-image--broken');
        },
      );
    }
    return img;
  }
}

function buildImages(
  state: EditorState,
  resolveSrc: ResolveImageSrc,
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
    for (const m of line.text.matchAll(MARKDOWN_IMAGE)) {
      const from = line.from + m.index;
      out.push(
        Decoration.replace({
          widget: new ImageWidget(m[2]!, m[1]!, resolveSrc),
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
}: { resolveSrc?: ResolveImageSrc } = {}): Extension {
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
