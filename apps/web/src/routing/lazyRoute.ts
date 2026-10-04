import type { ComponentType } from 'react';
import type {
  IndexRouteObject,
  NonIndexRouteObject,
  RouteObject,
} from 'react-router-dom';
import { LazyFallback } from '../components/LazyFallback';

type LazyComponentModule = { default: ComponentType };

type LazyRouteBase = {
  load: () => Promise<LazyComponentModule>;
  children?: RouteObject[];
  /** Shown while the chunk loads on the first page load; defaults to LazyFallback. */
  fallback?: ComponentType;
};

type LazyIndexRoute = LazyRouteBase & {
  index: true;
  path?: never;
};

type LazyPathRoute = LazyRouteBase & {
  index?: false;
  path: string;
};

/** RR skips HydrateFallback returned from lazy() during initial hydration, so it sits beside `lazy`. */
export function lazyRoute(opts: LazyIndexRoute): IndexRouteObject;
export function lazyRoute(opts: LazyPathRoute): NonIndexRouteObject;
export function lazyRoute(
  opts: LazyIndexRoute | LazyPathRoute,
): IndexRouteObject | NonIndexRouteObject {
  const lazy = async () => {
    const { default: Component } = await opts.load();
    return { Component };
  };

  const HydrateFallback = opts.fallback ?? LazyFallback;

  if (opts.index) {
    const route: IndexRouteObject = {
      index: true,
      HydrateFallback,
      lazy,
    };
    return route;
  }

  const route: NonIndexRouteObject = {
    path: opts.path,
    HydrateFallback,
    lazy,
  };
  if (opts.children) {
    route.children = opts.children;
  }
  return route;
}
