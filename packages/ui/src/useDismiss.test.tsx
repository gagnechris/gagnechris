import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useCallback, useRef, useState } from 'react';
import { describe, expect, test } from 'vitest';
import { useDismiss } from './useDismiss.js';

const Harness = () => {
  const [open, setOpen] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, box);
  return (
    <>
      <div ref={box}>
        <button type="button" onClick={() => setOpen(true)}>
          Inside
        </button>
        {open ? <p>Popup</p> : null}
      </div>
      <button type="button">Outside</button>
    </>
  );
};

describe('useDismiss', () => {
  test('keeps the popup through a press and focus inside', async () => {
    render(<Harness />);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Inside' }));
    expect(screen.getByText('Popup')).toBeInTheDocument();
  });

  test('closes on Escape', async () => {
    render(<Harness />);
    await userEvent.setup().keyboard('{Escape}');
    expect(screen.queryByText('Popup')).toBeNull();
  });

  test('closes on a pointer press outside', () => {
    render(<Harness />);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText('Popup')).toBeNull();
  });

  test('closes when focus moves outside', async () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'Inside' }).focus();
    await userEvent.setup().tab();
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus();
    expect(screen.queryByText('Popup')).toBeNull();
  });
});
