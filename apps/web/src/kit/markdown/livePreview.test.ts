import { deleteCharBackward } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { livePreview, shortenUrl } from './livePreview';
import { taskEmbedEditor } from './taskEmbeds';

const TASK = '01JAAAAAAAAAAAAAAAAAAAAAAA';

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view?.dom.remove();
  view = undefined;
});

function setup(doc: string, cursor = doc.length) {
  view = new EditorView({
    parent: document.body.appendChild(document.createElement('div')),
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [
        livePreview(),
        taskEmbedEditor({
          host: { attach: () => {}, detach: () => {} },
          onCreate: () => {},
        }),
      ],
    }),
  });
  return view;
}

const lineText = (v: EditorView, n: number) =>
  v.contentDOM.querySelectorAll('.cm-line')[n - 1]!.textContent;

const lineEl = (v: EditorView, n: number) =>
  v.contentDOM.querySelectorAll('.cm-line')[n - 1]!;

const syntaxOn = (v: EditorView, n: number) =>
  [...lineEl(v, n).querySelectorAll('.cm-md-syntax')].map((e) => e.textContent);

const moveTo = (v: EditorView, pos: number) =>
  v.dispatch({ selection: EditorSelection.cursor(pos) });

/** Every decoration the editor's plugins and fields provide, by class. */
function decorationClasses(v: EditorView): string[] {
  const classes: string[] = [];
  for (const source of v.state.facet(EditorView.decorations)) {
    const set = typeof source === 'function' ? source(v) : source;
    set.between(0, v.state.doc.length, (_from, _to, deco) => {
      const spec = deco.spec as { class?: string; attributes?: object };
      if (spec.class) classes.push(spec.class);
    });
  }
  return classes;
}

describe('livePreview', () => {
  test('decorates only the lines in the viewport', () => {
    const lines = 4000;
    const v = setup(
      Array.from({ length: lines }, (_, i) => `- item **${i}**`).join('\n'),
      0,
    );
    const visible = v.visibleRanges.reduce(
      (n, r) =>
        n +
        v.state.doc.lineAt(r.to).number -
        v.state.doc.lineAt(r.from).number +
        1,
      0,
    );
    expect(visible).toBeLessThan(lines);
    const strong = decorationClasses(v).filter((c) => c === 'cm-md-strong');
    expect(strong.length).toBeGreaterThan(0);
    expect(strong.length).toBeLessThanOrEqual(visible);
  });

  test('a fence opened above the viewport still marks the lines in it as code', () => {
    const v = setup(
      [
        '```',
        ...Array.from({ length: 3000 }, () => '**not bold**'),
        '```',
      ].join('\n'),
      0,
    );
    v.dispatch({
      effects: EditorView.scrollIntoView(v.state.doc.length),
    });
    expect(v.visibleRanges[0]!.from).toBeGreaterThan(0);
    const classes = decorationClasses(v);
    expect(classes).not.toContain('cm-md-strong');
    expect(classes).toContain('cm-md-code-block');
  });

  test('a heading, list and link render in place off the caret line, and show their markdown, dimmed and still formatted, on it', () => {
    const doc = '# Plan\n- ship [docs](https://x.dev) **today**\nend';
    const v = setup(doc);
    const heading = v.contentDOM.querySelector('.cm-md-h1')!;
    expect(heading.textContent).toBe('Plan');
    expect(lineText(v, 2)).toBe('• ship docs today');
    expect(v.contentDOM.querySelector('.cm-md-link')).toHaveAttribute(
      'title',
      'https://x.dev',
    );
    expect(v.contentDOM.querySelector('.cm-md-strong')!.textContent).toBe(
      'today',
    );
    expect(v.contentDOM.querySelector('.cm-md-syntax')).toBeNull();

    moveTo(v, 2);
    expect(lineText(v, 1)).toBe('# Plan');
    expect(v.contentDOM.querySelector('.cm-md-h1')).toHaveTextContent('# Plan');
    expect(syntaxOn(v, 1)).toEqual(['# ']);
    expect(lineText(v, 2)).toBe('• ship docs today');

    moveTo(v, doc.indexOf('ship'));
    expect(lineText(v, 1)).toBe('Plan');
    expect(lineText(v, 2)).toBe('- ship [docs](https://x.dev) **today**');
    expect(syntaxOn(v, 2)).toEqual(['-', '[', '](https://x.dev)', '**', '**']);
    expect(lineEl(v, 2).querySelector('.cm-md-strong')).toHaveTextContent(
      'today',
    );
    expect(lineEl(v, 2).querySelector('.cm-md-link')).toHaveTextContent('docs');
  });

  test('a selection across lines shows the markdown on every line it touches', () => {
    const doc = '# One\n**two**\n- three\nfour';
    const v = setup(doc, 0);
    v.dispatch({ selection: EditorSelection.range(0, doc.indexOf('three')) });
    expect(lineText(v, 1)).toBe('# One');
    expect(lineText(v, 2)).toBe('**two**');
    expect(lineText(v, 3)).toBe('- three');
    expect(lineText(v, 4)).toBe('four');
  });

  test('select all shows every line’s markdown', () => {
    const doc = '# One\n**two**\n- [ ] three';
    const v = setup(doc, 0);
    v.dispatch({ selection: EditorSelection.range(0, doc.length) });
    expect(lineText(v, 1)).toBe('# One');
    expect(lineText(v, 2)).toBe('**two**');
    expect(lineText(v, 3)).toBe('- [ ] three');
  });

  test('a long link URL is shortened on the caret line until the caret is inside the link', () => {
    const url = 'https://www.figma.com/file/abc123/notebook-sketches';
    const doc = `See [the sketch](${url})\nend`;
    const v = setup(doc, doc.indexOf('\n'));
    expect(lineText(v, 1)).toBe('See [the sketch](www.figma.com/…)');

    moveTo(v, doc.indexOf('sketch'));
    expect(lineText(v, 1)).toBe(`See [the sketch](${url})`);
  });

  test('shortenUrl keeps short URLs and cuts long ones to the host', () => {
    expect(shortenUrl('https://x.dev/a')).toBe('https://x.dev/a');
    expect(shortenUrl('https://example.com/a/very/long/path/here')).toBe(
      'example.com/…',
    );
  });

  test('code spans keep their text; fences show only while the caret is in the block', () => {
    const doc = 'run `npm *test*`\n```sh\n# not a heading\n```\nend';
    const v = setup(doc);
    expect(lineText(v, 1)).toBe('run npm *test*');
    expect(v.contentDOM.querySelector('.cm-md-em')).toBeNull();
    expect(lineText(v, 2)).toBe('');
    expect(lineText(v, 3)).toBe('# not a heading');
    expect(lineText(v, 4)).toBe('');
    expect(v.contentDOM.querySelector('.cm-md-h1')).toBeNull();

    moveTo(v, doc.indexOf('# not'));
    expect(lineText(v, 2)).toBe('```sh');
    expect(lineText(v, 4)).toBe('```');
  });

  test('snake_case is left alone and checklist items render as checkboxes off the caret line', () => {
    const doc = 'call my_fn_name\n- [ ] buy milk\n- [x] eggs\nend';
    const v = setup(doc);
    expect(lineText(v, 1)).toBe('call my_fn_name');
    expect(lineText(v, 2)).toBe('buy milk');
    const boxes = v.contentDOM.querySelectorAll<HTMLInputElement>(
      'input.cm-md-checkbox',
    );
    expect([...boxes].map((b) => b.checked)).toEqual([false, true]);
    expect(lineEl(v, 3)).toHaveClass('cm-md-check-done');

    boxes[0]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(v.state.doc.line(2).text).toBe('- [x] buy milk');

    moveTo(v, v.state.doc.line(3).to);
    expect(lineText(v, 3)).toBe('- [x] eggs');
  });

  test('a task embed never shows its token, with the caret on its line too', () => {
    const doc = `Standup\n{{task:${TASK}}}`;
    const v = setup(doc);
    expect(v.contentDOM.textContent).not.toContain('{{task:');
    moveTo(v, v.state.doc.line(2).from);
    expect(v.contentDOM.textContent).not.toContain('{{task:');
  });

  test('Backspace after a task embed removes the whole embed', () => {
    const doc = `Standup\n{{task:${TASK}}}`;
    const v = setup(doc);
    deleteCharBackward(v);
    expect(v.state.doc.toString()).toBe('Standup\n');
  });
});
