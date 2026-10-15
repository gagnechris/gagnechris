import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { useModalDialog } from './useModalDialog.js';

function Modal({ onClose, start }: { onClose: () => void; start?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const { dialogProps } = useModalDialog({
    label: 'Example',
    onClose,
    initialFocus: start ? input : undefined,
  });
  return (
    <div {...dialogProps}>
      <button type="button">First</button>
      <input ref={input} aria-label="Field" />
      <button type="button" tabIndex={-1}>
        Skipped
      </button>
      <button type="button" onClick={onClose}>
        Last
      </button>
    </div>
  );
}

function SwapModal({ onClose }: { onClose: () => void }) {
  const [done, setDone] = useState(false);
  const { dialogProps } = useModalDialog({ label: 'Swap', onClose });
  return (
    <div {...dialogProps}>
      <button type="button">Close</button>
      {done ? (
        <p>Done</p>
      ) : (
        <button type="button" onClick={() => setDone(true)}>
          Finish
        </button>
      )}
    </div>
  );
}

function SwapOpener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? <SwapModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Opener({ start }: { start?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Outside</button>
      {open ? <Modal onClose={() => setOpen(false)} start={start} /> : null}
    </>
  );
}

describe('useModalDialog', () => {
  test('moves focus in, keeps Tab inside, and returns focus on Escape', async () => {
    const user = userEvent.setup();
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Example' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  test('starts on initialFocus and returns focus when closed from inside', async () => {
    const user = userEvent.setup();
    render(<Opener start />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('textbox', { name: 'Field' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Last' }));
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  test('Escape does not reach listeners outside the dialog', async () => {
    const user = userEvent.setup();
    const outside = vi.fn();
    render(
      <div onKeyDown={outside}>
        <Opener />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    outside.mockClear();
    await user.keyboard('{Escape}');
    expect(outside).not.toHaveBeenCalled();
  });

  test('Escape and Tab still work after the focused control goes away', async () => {
    const user = userEvent.setup();
    render(<SwapOpener />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);

    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(document.body).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    await user.click(document.body);
    expect(document.body).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});
