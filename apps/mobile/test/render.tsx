import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import type { ReactElement, ReactNode } from 'react';
import { AreaProvider, type KeyValueStore } from '../src/area';
import {
  localAuthBackend,
  SessionProvider,
  type AuthBackend,
} from '../src/session';

export function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: KeyValueStore = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
  return { store, data };
}

export const Providers = ({
  store = memoryStore().store,
  backend = localAuthBackend(),
  children,
}: {
  store?: KeyValueStore;
  backend?: AuthBackend;
  children: ReactNode;
}) => (
  <SessionProvider backend={backend}>
    <AreaProvider store={store}>{children}</AreaProvider>
  </SessionProvider>
);

/** Renders and lets the providers' async restores settle. */
export async function render(
  element: ReactElement,
): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
}

export const textOf = (node: ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');

export const allText = (renderer: ReactTestRenderer): string =>
  renderer.root
    .findAllByType('Text' as never)
    .map(textOf)
    .join('\n');

export const byLabel = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.find(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label,
  );
