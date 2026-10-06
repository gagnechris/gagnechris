import { act, render, screen, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test } from 'vitest';
import { QueryClientTestProvider } from '../test-utils';
import { NotebookMarkdownBody } from './NotebookMarkdownBody';

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <NotebookMarkdownBody value={value} onChange={setValue} />;
}

const renderBody = (initial = '# Plan\n\nShip **today**') =>
  render(
    <QueryClientTestProvider>
      <MemoryRouter>
        <Harness initial={initial} />
      </MemoryRouter>
    </QueryClientTestProvider>,
  );

afterEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
});

describe('NotebookMarkdownBody', () => {
  test('shows one editor pane and no preview column', async () => {
    const { container } = renderBody();
    await screen.findByRole('textbox', { name: 'Note body' });
    expect(container.querySelectorAll('.markdown-editor')).toHaveLength(1);
    expect(container.querySelector('.markdown-preview')).toBeNull();
    expect(container.querySelector('.cm-live')).not.toBeNull();
  });

  test('⌘/ (Ctrl+/ here) switches to a rendered preview and back to the editor', async () => {
    const { container } = renderBody();
    const user = userEvent.setup();
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    const view = EditorView.findFromDOM(editor)!;
    act(() => {
      view.focus();
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '/',
          code: 'Slash',
          keyCode: 191,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    const preview = await screen.findByRole('region', { name: 'Preview' });
    expect(preview).toHaveFocus();
    expect(preview.querySelector('h1')).toHaveTextContent('Plan');
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.keyboard('{Control>}/{/Control}');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Preview' })).toBeNull(),
    );
    expect(container.querySelector('.cm-content')).toHaveFocus();
  });

  test('the Markdown toggle shows raw markdown everywhere and is remembered', async () => {
    const { container, unmount } = renderBody();
    const user = userEvent.setup();
    await screen.findByRole('textbox', { name: 'Note body' });
    const toggle = screen.getByRole('button', { name: 'Markdown' });
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(container.querySelector('.cm-live')).toBeNull());
    expect(container.querySelector('.cm-content')).toHaveTextContent('# Plan');
    unmount();

    const again = renderBody();
    await screen.findByRole('textbox', { name: 'Note body' });
    expect(screen.getByRole('button', { name: 'Markdown' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(again.container.querySelector('.cm-live')).toBeNull();
  });
});
