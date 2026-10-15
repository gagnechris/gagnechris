import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Button } from './Button.js';
import { Dialog, Drawer } from './Dialog.js';
import { Scrim } from './Scrim.js';

const Harness = ({ kind }: { kind: 'dialog' | 'drawer' }) => {
  const [open, setOpen] = useState(false);
  const Surface = kind === 'dialog' ? Dialog : Drawer;
  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite</Button>
      {open ? (
        <Surface
          title="Invite user"
          onClose={() => setOpen(false)}
          actions={
            <Button variant="primary" onClick={() => setOpen(false)}>
              Send invite
            </Button>
          }
        >
          <label>
            Email
            <input />
          </label>
        </Surface>
      ) : null}
    </>
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(['dialog', 'drawer'] as const)('%s', (kind) => {
  test('named by its title; focus starts on the first field and is trapped', async () => {
    const user = userEvent.setup();
    render(<Harness kind={kind} />);
    const opener = screen.getByRole('button', { name: 'Invite' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Invite user' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const email = screen.getByRole('textbox', { name: 'Email' });
    expect(email).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Send invite' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  test('Cancel, the close button and the scrim close it', async () => {
    const user = userEvent.setup();
    render(<Harness kind={kind} />);
    const open = () =>
      user.click(screen.getByRole('button', { name: 'Invite' }));
    await open();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await open();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await open();
    const scrim = screen
      .getAllByRole('button', { name: 'Close' })
      .find((b) => !screen.getByRole('dialog').contains(b))!;
    await user.click(scrim);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('under 768px it opens as a bottom sheet with the action as Done', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const user = userEvent.setup();
    render(<Harness kind={kind} />);
    await user.click(screen.getByRole('button', { name: 'Invite' }));
    expect(document.querySelector('.bottom-sheet')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Send invite' })).toBeVisible();
  });

  test.each([false, true])(
    'a label names it in place of the title (sheet: %s)',
    (phone) => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: phone,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      const Surface = kind === 'dialog' ? Dialog : Drawer;
      render(
        <Surface
          title="Edit access"
          label="Edit access for Sam"
          onClose={vi.fn()}
        >
          <p>Body</p>
        </Surface>,
      );
      expect(
        screen.getByRole('dialog', { name: 'Edit access for Sam' }),
      ).toHaveTextContent('Edit access');
    },
  );
});

describe('Scrim', () => {
  test('is a Close button kept out of the tab order', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Scrim onClick={onClick} />);
    const scrim = screen.getByRole('button', { name: 'Close' });
    expect(scrim).toHaveAttribute('tabindex', '-1');
    await user.click(scrim);
    expect(onClick).toHaveBeenCalled();
  });
});
