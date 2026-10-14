import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
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

function CollapsiblePanel({ onCollapse }: { onCollapse: () => void }) {
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
        onCollapse={onCollapse}
      />
    </div>
  );
}

test('dragging well past the minimum collapses and keeps the earlier width', () => {
  localStorage.setItem(KEY, '300');
  const onCollapse = vi.fn();
  render(<CollapsiblePanel onCollapse={onCollapse} />);
  const handle = screen.getByRole('separator');
  // jsdom has no pointer capture.
  handle.setPointerCapture = () => {};
  fireEvent.pointerDown(handle, { button: 0, clientX: 500, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 640, pointerId: 1 });
  expect(handle).toHaveAttribute('aria-valuenow', '200');
  expect(onCollapse).not.toHaveBeenCalled();
  fireEvent.pointerMove(handle, { clientX: 700, pointerId: 1 });
  expect(onCollapse).toHaveBeenCalledTimes(1);
  expect(handle).toHaveAttribute('aria-valuenow', '300');
  fireEvent.pointerMove(handle, { clientX: 720, pointerId: 1 });
  expect(onCollapse).toHaveBeenCalledTimes(1);
});

test('shrinking by key from the minimum collapses', () => {
  localStorage.setItem(KEY, '210');
  const onCollapse = vi.fn();
  render(<CollapsiblePanel onCollapse={onCollapse} />);
  const handle = screen.getByRole('separator');
  fireEvent.keyDown(handle, { key: 'ArrowRight' });
  expect(handle).toHaveAttribute('aria-valuenow', '200');
  expect(onCollapse).not.toHaveBeenCalled();
  fireEvent.keyDown(handle, { key: 'ArrowRight' });
  expect(onCollapse).toHaveBeenCalledTimes(1);
});

function RoomPanel({ room }: { room: () => number }) {
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
        room={room}
      />
    </div>
  );
}

test('dragging wider stops where the neighbour runs out of room', () => {
  localStorage.setItem(KEY, '250');
  render(<RoomPanel room={() => 30} />);
  const handle = screen.getByRole('separator');
  handle.setPointerCapture = () => {};
  fireEvent.pointerDown(handle, { button: 0, clientX: 500, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
  expect(handle).toHaveAttribute('aria-valuenow', '280');
  fireEvent.pointerMove(handle, { clientX: 560, pointerId: 1 });
  expect(handle).toHaveAttribute('aria-valuenow', '200');
});

test('arrows stop growing where the neighbour runs out of room', () => {
  localStorage.setItem(KEY, '250');
  render(<RoomPanel room={() => 10} />);
  const handle = screen.getByRole('separator');
  fireEvent.keyDown(handle, { key: 'ArrowLeft' });
  expect(handle).toHaveAttribute('aria-valuenow', '260');
});
