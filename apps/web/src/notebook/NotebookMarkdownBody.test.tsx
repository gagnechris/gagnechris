import { EditorView } from '@codemirror/view';
import { render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { PHONE_QUERY } from '../kit/useMediaQuery';
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

describe('NotebookMarkdownBody', () => {
  test('renders the editor in the first commit, with no loading fallback', () => {
    renderBody();
    expect(
      screen.getByRole('textbox', { name: 'Note body' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Loading editor/)).toBeNull();
  });

  test('turns on the browser spelling and grammar checks', () => {
    renderBody();
    const body = screen.getByRole('textbox', { name: 'Note body' });
    expect(body).toHaveAttribute('spellcheck', 'true');
    expect(body).toHaveAttribute('autocorrect', 'on');
  });

  test('without a note (the template editors), - [ ] stays a checklist bullet', () => {
    renderBody('- [ ');
    const content = screen.getByRole('textbox', { name: 'Note body' });
    const view = EditorView.findFromDOM(content)!;
    const insert = () =>
      view.state.update({ changes: { from: 4, insert: ']' } });
    const handled = view.state
      .facet(EditorView.inputHandler)
      .some((handler) => handler(view, 4, 4, ']', insert));
    if (!handled) view.dispatch(insert());
    expect(view.state.doc.toString()).toBe('- [ ]');
  });

  test('leaves focus alone when it mounts, StrictMode included', () => {
    render(
      <StrictMode>
        <QueryClientTestProvider>
          <MemoryRouter>
            <Harness initial="# Plan" />
          </MemoryRouter>
        </QueryClientTestProvider>
      </StrictMode>,
    );
    expect(
      screen.getByRole('textbox', { name: 'Note body' }),
    ).not.toHaveFocus();
  });

  test('shows one editor pane and no preview column', async () => {
    const { container } = renderBody();
    await screen.findByRole('textbox', { name: 'Note body' });
    expect(container.querySelectorAll('.markdown-editor')).toHaveLength(1);
    expect(container.querySelector('.markdown-preview')).toBeNull();
    expect(container.querySelector('.cm-live')).not.toBeNull();
  });

  test('has no Markdown or Preview toggle, and keeps the live view', async () => {
    const { container } = renderBody();
    await screen.findByRole('textbox', { name: 'Note body' });
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
    expect(screen.queryByRole('toolbar', { name: 'View' })).toBeNull();
    expect(container.querySelector('.cm-live')).not.toBeNull();
    expect(container.querySelector('.cm-md-h1')).toHaveTextContent('Plan');
  });

  test('the phone task hint shows its syntax as code, not markdown', async () => {
    const matchMedia = vi.mocked(window.matchMedia);
    const notPhone = matchMedia.getMockImplementation();
    matchMedia.mockImplementation(
      (query: string) =>
        ({
          matches: query === PHONE_QUERY,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    try {
      render(
        <QueryClientTestProvider>
          <MemoryRouter>
            <NotebookMarkdownBody
              note={{ id: 'note-1', area: 'work' }}
              value=""
              onChange={() => {}}
            />
          </MemoryRouter>
        </QueryClientTestProvider>,
      );
      const hint = await screen.findByText(/adds a task/);
      expect(hint.textContent).not.toContain('`');
      expect(
        [...hint.querySelectorAll('code')].map((c) => c.textContent),
      ).toEqual(['[ ] text', '@']);
    } finally {
      if (notPhone) matchMedia.mockImplementation(notPhone);
    }
  });
});
