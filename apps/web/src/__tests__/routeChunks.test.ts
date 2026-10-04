import { describe, expect, test } from 'vitest';
import mainSource from '../main.tsx?raw';
import routesSource from '../routes.tsx?raw';
import adminRoutesSource from '../admin/routes.tsx?raw';
import notebookRoutesSource from '../notebook/routes.tsx?raw';
import lazyRouteSource from '../routing/lazyRoute.ts?raw';
import landingSource from '../pages/DontFeedTheBears.tsx?raw';

describe('route chunks', () => {
  test('the public entry never references signed-in code', () => {
    for (const source of [mainSource, routesSource]) {
      expect(source).not.toMatch(/aws-amplify/);
      expect(source).not.toMatch(/\/(?:admin|notebook|workspace|auth)\//);
    }
  });

  test('bears pages are lazy-loaded and not static imports', () => {
    expect(routesSource).not.toMatch(/from ['"].*DontFeedTheBears/);
    expect(routesSource).not.toMatch(/from ['"].*pages\/bears\//);
    expect(routesSource).toMatch(/import\(\s*'\.\/pages\/DontFeedTheBears/);
    expect(routesSource).toMatch(/import\(\s*'\.\/pages\/bears\/CampRules/);
    expect(routesSource).toMatch(/import\(\s*'\.\/pages\/bears\/StayWild/);
  });

  test('the bears landing page loads neither game', () => {
    expect(landingSource).not.toMatch(/games\/bears\/camp\//);
    expect(landingSource).not.toMatch(/pages\/bears\//);
  });

  test('app pages and the sign-in callback load lazily', () => {
    for (const source of [adminRoutesSource, notebookRoutesSource]) {
      expect(source).not.toMatch(/from ['"].*Page['"]/);
      expect(source).not.toMatch(/from ['"].*AuthCallback/);
      expect(source).toMatch(/import\('\.\.\/workspace\/auth\/AuthCallback/);
    }
  });

  // RR skips HydrateFallback returned from lazy() during initial hydration, so
  // it must be a static sibling of `lazy`.
  test('lazy routes declare HydrateFallback statically via lazyRoute()', () => {
    expect(routesSource).toMatch(/HydrateFallback:\s*LazyFallback/);
    expect(lazyRouteSource).toMatch(
      /HydrateFallback = opts\.fallback \?\? LazyFallback/,
    );
    expect(lazyRouteSource).toMatch(/\blazy\b/);
    for (const source of [
      routesSource,
      adminRoutesSource,
      notebookRoutesSource,
    ]) {
      expect(source).toMatch(/lazyRoute\(/);
      expect(source).not.toMatch(
        /return\s*\{\s*Component:[^}]*HydrateFallback/,
      );
    }
  });
});
