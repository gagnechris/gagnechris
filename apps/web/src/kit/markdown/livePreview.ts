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
  shortenUrl,
  type FenceBlock,
  type LiveLineStyle,
  type LiveMark,
} from '@gagnechris/shared';

const hide = Decoration.replace({});
const lineClass = (cls: string) => Decoration.line({ class: cls });
const headingLines = [1, 2, 3, 4, 5, 6].map((n) => lineClass(`cm-md-h${n}`));
const quoteLine = lineClass('cm-md-quote');
// Code is not prose: the browser spellchecker would underline every identifier.
const noSpellcheck = { spellcheck: 'false' };
const codeLineClass = (cls: string) =>
  Decoration.line({ class: cls, attributes: noSpellcheck });
const fenceLine = codeLineClass('cm-md-fence');
const idleFenceLine = codeLineClass('cm-md-fence cm-md-fence--idle');
const codeLine = codeLineClass('cm-md-code-block');
const doneLine = lineClass('cm-md-check-done');
const strongMark = Decoration.mark({ class: 'cm-md-strong' });
const emphasisMark = Decoration.mark({ class: 'cm-md-em' });
const codeMark = Decoration.mark({
  class: 'cm-md-code',
  attributes: noSpellcheck,
});
const syntaxMark = Decoration.mark({ class: 'cm-md-syntax' });

const CHECKLIST = /^([ \t]*)[-*+][ \t]+\[([ xX])\](?!\()[ \t]?/;

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

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-md-checkbox';
    box.checked = this.checked;
    box.setAttribute('aria-label', this.checked ? 'Done' : 'Not done');
    box.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (view.state.readOnly) return;
      const line = view.state.doc.lineAt(view.posAtDOM(box));
      const at = line.text.indexOf('[');
      if (at < 0) return;
      view.dispatch({
        changes: {
          from: line.from + at,
          to: line.from + at + 3,
          insert: this.checked ? '[ ]' : '[x]',
        },
        userEvent: 'input.toggleTask',
      });
    });
    return box;
  }

  ignoreEvent() {
    return true;
  }
}

const checkboxes = [new CheckboxWidget(false), new CheckboxWidget(true)].map(
  (widget) => Decoration.replace({ widget }),
);

class UrlWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: UrlWidget) {
    return other.text === this.text;
  }

  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-md-syntax';
    el.textContent = this.text;
    return el;
  }
}

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

function styleDecoration(mark: LiveMark): Decoration | null {
  switch (mark.kind) {
    case 'hide':
    case 'bullet':
      return null;
    case 'strong':
      return strongMark;
    case 'em':
      return emphasisMark;
    case 'code':
      return codeMark;
    case 'link':
      return Decoration.mark({
        class: 'cm-md-link',
        attributes: { title: mark.href ?? '', 'data-href': mark.href ?? '' },
      });
  }
}

const fencesOf = (doc: Text) => scanFences(doc.iterLines());

function blockOf(
  fences: readonly FenceBlock[],
  line: number,
): FenceBlock | undefined {
  return fences.find(
    (b) => line >= b.open && (b.close === null || line <= b.close),
  );
}

type Ctx = {
  state: EditorState;
  active: Set<number>;
  fences: readonly FenceBlock[];
  out: Range<Decoration>[];
};

/** Decorations for the lines in `ranges` (the viewport, or the whole doc). */
export function buildLivePreview(
  state: EditorState,
  ranges: readonly { from: number; to: number }[] = [
    { from: 0, to: state.doc.length },
  ],
  fences: readonly FenceBlock[] = fencesOf(state.doc),
): DecorationSet {
  const doc = state.doc;
  const ctx: Ctx = { state, active: activeLines(state), fences, out: [] };
  let last = 0;
  for (const range of ranges) {
    const first = Math.max(doc.lineAt(range.from).number, last + 1);
    const end = doc.lineAt(range.to).number;
    for (let n = first; n <= end; n += 1) decorateLine(doc.line(n), n, ctx);
    last = Math.max(last, end);
  }
  return Decoration.set(ctx.out, true);
}

function decorateLine(
  line: { from: number; to: number; text: string },
  n: number,
  { state, active, fences, out }: Ctx,
) {
  const fenced = fenceLineKind(fences, n - 1);
  if (fenced === 'code') {
    out.push(codeLine.range(line.from));
    return;
  }
  if (fenced === 'fence') {
    const block = blockOf(fences, n - 1)!;
    const last = (block.close ?? state.doc.lines - 1) + 1;
    let editing = false;
    for (let k = block.open + 1; k <= last && !editing; k += 1) {
      editing = active.has(k);
    }
    if (editing) {
      out.push(fenceLine.range(line.from));
    } else {
      out.push(idleFenceLine.range(line.from), hide.range(line.from, line.to));
    }
    return;
  }
  if (parseTaskEmbedLine(line.text)) return;

  const { style, marks } = liveMarkdownLine(line.text);
  if (style) out.push(lineDecorations[style].range(line.from));
  const check = CHECKLIST.exec(line.text);
  const isActive = active.has(n);

  if (!isActive) {
    if (check) {
      const checked = check[2] !== ' ';
      if (checked) out.push(doneLine.range(line.from));
      out.push(
        checkboxes[checked ? 1 : 0]!.range(
          line.from + check[1]!.length,
          line.from + check[0].length,
        ),
      );
    }
    for (const mark of marks) {
      const deco =
        mark.kind === 'hide'
          ? hide
          : mark.kind === 'bullet'
            ? bullet
            : styleDecoration(mark)!;
      out.push(deco.range(line.from + mark.from, line.from + mark.to));
    }
    return;
  }

  if (check) {
    out.push(
      syntaxMark.range(
        line.from + check[1]!.length,
        line.from + check[0].length,
      ),
    );
  }
  const heads = state.selection.ranges.map((r) => r.head);
  for (let i = 0; i < marks.length; i += 1) {
    const mark = marks[i]!;
    const from = line.from + mark.from;
    const to = line.from + mark.to;
    if (mark.kind === 'hide' || mark.kind === 'bullet') {
      if (from < to) out.push(syntaxMark.range(from, to));
      continue;
    }
    out.push(styleDecoration(mark)!.range(from, to));
    const tail = marks[i + 1];
    if (mark.kind !== 'link' || !mark.href || tail?.kind !== 'hide') continue;
    // The link is `[` label `](url …)`: the caret inside it shows the full URL.
    const linkFrom = from - 1;
    const linkTo = line.from + tail.to;
    const inside = heads.some((h) => h > linkFrom && h < linkTo);
    const short = shortenUrl(mark.href);
    if (inside || short === mark.href) continue;
    out.push(
      syntaxMark.range(to, to + 2),
      Decoration.replace({ widget: new UrlWidget(short) }).range(
        to + 2,
        linkTo - 1,
      ),
      syntaxMark.range(linkTo - 1, linkTo),
    );
    i += 1;
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

/** Hrefs a click may open; anything else (`javascript:` and the like) stays text. */
export function openableHref(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * A click on a rendered link opens it in a new tab. On the lines being
 * edited, where the syntax shows, only Cmd/Ctrl+click does, so a plain click
 * still places the caret.
 */
const openLinks = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || !(event.target instanceof Element)) return false;
    const link = event.target.closest<HTMLElement>('.cm-md-link');
    const href = link?.dataset.href;
    if (!link || !href) return false;
    const line = view.state.doc.lineAt(view.posAtDOM(link)).number;
    const editing = activeLines(view.state).has(line) && view.hasFocus;
    if (editing && !event.metaKey && !event.ctrlKey) return false;
    const url = openableHref(href, window.location.href);
    if (!url) return false;
    event.preventDefault();
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  },
});

/**
 * Renders markdown in place. The lines a selection touches keep their
 * formatting and show their syntax, dimmed; code fences show only while the
 * selection is in the block. Line-based: no markdown parser, which keeps the
 * editor chunk small.
 */
export function livePreview(): Extension {
  return [
    plugin,
    openLinks,
    EditorView.editorAttributes.of({ class: 'cm-live' }),
  ];
}
