import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, expect, test } from 'vitest';
import { ResizeHandle } from './ResizeHandle';
import { useStoredWidth } from './useStoredWidth';

const KEY = 'test.panelWidth';

function Panel() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useStoredWidth(KEY, 200, 400);
  return (
    <div ref={ref}>
      <ResizeHandle
        label="Resize panel"
        className=""
        target={ref}
        width={width}
        min={200}
        max={400}
        edge="left"
        onChange={setWidth}
      />
    </div>
  );
}

beforeEach(() => localStorage.clear());

test('arrows resize within bounds and the width is remembered', () => {
  localStorage.setItem(KEY, '390');
  const { unmount } = render(<Panel />);
  const handle = screen.getByRole('separator', { name: 'Resize panel' });
  expect(handle).toHaveAttribute('aria-valuenow', '390');
  // A left-edge handle widens the panel as it moves left.
  fireEvent.keyDown(handle, { key: 'ArrowLeft' });
  expect(handle).toHaveAttribute('aria-valuenow', '400');
  fireEvent.keyDown(handle, { key: 'ArrowRight' });
  expect(handle).toHaveAttribute('aria-valuenow', '384');
  unmount();
  render(<Panel />);
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '384');
});

test('double-click goes back to the default width', () => {
  localStorage.setItem(KEY, '300');
  render(<Panel />);
  const handle = screen.getByRole('separator');
  fireEvent.doubleClick(handle);
  expect(handle).toHaveAttribute('aria-valuenow', '200');
  expect(localStorage.getItem(KEY)).toBeNull();
});

test('reports a value before any resize, as a focusable separator must', () => {
  render(<Panel />);
  expect(
    screen.getByRole('separator', { name: 'Resize panel' }),
  ).toHaveAttribute('aria-valuenow', '200');
});
