import { deleteCharBackward } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import { markdownImages } from './imageWidgets';

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view?.dom.remove();
  view = undefined;
});

function setup(doc: string) {
  view = new EditorView({
    parent: document.body.appendChild(document.createElement('div')),
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [
        markdownImages({
          resolveSrc: (src) =>
            src.startsWith('/') ? `https://site.test${src}` : src,
        }),
      ],
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
});
