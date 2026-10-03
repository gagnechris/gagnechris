import { describe, expect, test } from 'vitest';
import mainSource from '../main.tsx?raw';
import routesSource from '../routes.tsx?raw';
import lazyRouteSource from '../routing/lazyRoute.ts?raw';
import landingSource from '../pages/DontFeedTheBears.tsx?raw';

describe('public entry bundle isolation', () => {
  test('main.tsx and routes.tsx do not statically import Amplify or admin modules', () => {
    expect(mainSource).not.toMatch(/from ['"]aws-amplify/);
    expect(mainSource).not.toMatch(/from ['"].*\/(?:admin|auth)\//);
    expect(routesSource).not.toMatch(/from ['"]aws-amplify/);
    expect(routesSource).not.toMatch(/from ['"].*\/admin\//);
    expect(routesSource).not.toMatch(/from ['"].*\/auth\//);
    // Admin + auth enter only via React Router lazy() dynamic import().
    expect(routesSource).toMatch(/import\('\.\/admin\/AdminLayout/);
    expect(routesSource).toMatch(/import\('\.\/auth\/AuthCallback/);
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

  // RR skips HydrateFallback returned from lazy() during initial hydration, so
  // it must be a static sibling of `lazy` (and on the root) or /admin warns.
  test('lazy routes declare HydrateFallback statically via lazyRoute()', () => {
    expect(routesSource).toMatch(/HydrateFallback:\s*LazyFallback/);
    expect(routesSource).toMatch(/lazyRoute\(/);
    expect(routesSource).not.toMatch(
      /return\s*\{\s*Component:[^}]*HydrateFallback/,
    );
    expect(lazyRouteSource).toMatch(/HydrateFallback:\s*LazyFallback/);
    expect(lazyRouteSource).toMatch(/\blazy\b/);
    const lazyRouteCalls = routesSource.match(/lazyRoute\(/g);
    expect(lazyRouteCalls?.length).toBeGreaterThanOrEqual(8);
  });
});
