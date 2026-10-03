import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createElement, useState, type ReactNode } from 'react';

/** Plain Node (no jsdom), so react-test-renderer instead of testing-library. */
export function renderHook<TResult>(
  callback: () => TResult,
  options?: { wrapper?: (props: { children: ReactNode }) => ReactNode },
): {
  result: { current: TResult };
  rerender: () => void;
  unmount: () => void;
} {
  const result: { current: TResult } = {
    current: undefined as unknown as TResult,
  };

  function HookHost() {
    result.current = callback();
    return null;
  }

  const Wrapper = options?.wrapper;
  const element = Wrapper
    ? createElement(Wrapper, null, createElement(HookHost))
    : createElement(HookHost);

  let root!: ReactTestRenderer;
  act(() => {
    root = create(element);
  });

  return {
    result,
    rerender: () => {
      act(() => {
        root.update(element);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

export { act, useState };
