/// <reference types="vite/client" />
import { getRoutes } from 'expo-router/build/getRoutes';
import { getLayoutAnchor } from 'expo-router/build/layoutAnchor';
import { describe, expect, it } from 'vitest';

// The real route tree: tab layouts load (they carry `unstable_settings`),
// every other file is a stub, since only the names matter.
const layouts = import.meta.glob(
  ['../app/\\(tabs\\)/*/_layout.tsx', '../app/admin/*/_layout.tsx'],
  { eager: true },
);
const files = import.meta.glob('../app/**/*.tsx');
const appContext = Object.assign(
  (key: string) => layouts[`../app/${key.slice(2)}`] ?? { default: () => null },
  {
    keys: () => Object.keys(files).map((f) => `./${f.slice('../app/'.length)}`),
    resolve: (key: string) => key,
    id: 'app',
  },
);

type RouteNode = Parameters<typeof getLayoutAnchor>[0];

const anchor = (space: '(tabs)' | 'admin', tab: string) => {
  const routes = getRoutes(
    appContext as never,
    {
      platform: 'ios',
      skipGenerated: true,
    } as never,
  );
  const node = routes?.children
    .find((r) => r.route === space)
    ?.children.find((r) => r.route === tab);
  return node && getLayoutAnchor(node as RouteNode);
};

describe('Notebook tab stacks', () => {
  it.each(['today', 'upcoming', 'notes', 'tasks'])(
    'put the %s list under a detail opened from outside the tab',
    (tab) => {
      expect(anchor('(tabs)', tab)).toBe('index');
    },
  );
});

describe('Admin tab stacks', () => {
  it.each(['posts', 'projects', 'pages'])(
    'put the %s list under a screen opened from a link',
    (tab) => {
      expect(anchor('admin', tab)).toBe('index');
    },
  );
});
