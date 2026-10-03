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

  if (opts.index) {
    const route: IndexRouteObject = {
      index: true,
      HydrateFallback: LazyFallback,
      lazy,
    };
    return route;
  }

  const route: NonIndexRouteObject = {
    path: opts.path,
    HydrateFallback: LazyFallback,
    lazy,
  };
  if (opts.children) {
    route.children = opts.children;
  }
  return route;
}
