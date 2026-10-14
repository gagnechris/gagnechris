import { deleteCharBackward } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { markdownImages, type ResolveImageSrc } from './imageWidgets';

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view?.dom.remove();
  view = undefined;
});

function setup(
  doc: string,
  resolveSrc: ResolveImageSrc = (src) =>
    src.startsWith('/') ? `https://site.test${src}` : src,
) {
  view = new EditorView({
    parent: document.body.appendChild(document.createElement('div')),
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [markdownImages({ resolveSrc })],
    }),
  });
  return view;
}

describe('markdownImages', () => {
  test('renders inline images with resolved src, not inside code fences', () => {
    const v = setup(
      'Intro\n![A chart](/media/2026/10/chart.png)\n```\n![raw](/x.png)\n```',
    );
    const images = v.contentDOM.querySelectorAll('img.cm-md-image');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute(
      'src',
      'https://site.test/media/2026/10/chart.png',
    );
    expect(images[0]).toHaveAttribute('alt', 'A chart');
  });

  test('Backspace after an image removes its whole markdown', () => {
    const v = setup('Intro\n![A chart](/media/a.png)');
    deleteCharBackward(v);
    expect(v.state.doc.toString()).toBe('Intro\n');
  });

  test('an image whose URL resolves later shows once it does, and edits elsewhere keep it', async () => {
    let finish!: (url: string) => void;
    const resolveSrc = vi.fn(
      () => new Promise<string>((resolve) => (finish = resolve)),
    );
    const v = setup(
      'Intro\n![image](notebook-image:0123456789abcdef.png)',
      resolveSrc,
    );
    const img = v.contentDOM.querySelector('img.cm-md-image')!;
    expect(img).toHaveClass('cm-md-image--loading');
    expect(img).not.toHaveAttribute('src');

    finish('https://signed.test/a.png');
    await vi.waitFor(() =>
      expect(img).toHaveAttribute('src', 'https://signed.test/a.png'),
    );
    expect(img).not.toHaveClass('cm-md-image--loading');

    v.dispatch({ changes: { from: 0, insert: 'More ' } });
    expect(v.contentDOM.querySelector('img.cm-md-image')).toBe(img);
    expect(resolveSrc).toHaveBeenCalledTimes(1);
  });

  test('an image whose URL fails to resolve is marked broken', async () => {
    const v = setup('![image](notebook-image:0123456789abcdef.png)', () =>
      Promise.reject(new Error('gone')),
    );
    const img = v.contentDOM.querySelector('img.cm-md-image')!;
    await vi.waitFor(() => expect(img).toHaveClass('cm-md-image--broken'));
  });
});
