import { describe, expect, test } from 'vitest';
import mainSource from '../main.tsx?raw';
import lazyRouteSource from '../routing/lazyRoute.ts?raw';
import landingSource from '../pages/DontFeedTheBears.tsx?raw';

describe('public entry bundle isolation', () => {
  test('main.tsx does not statically import Amplify or admin modules', () => {
    expect(mainSource).not.toMatch(/from ['"]aws-amplify/);
    expect(mainSource).not.toMatch(/from ['"].*\/admin\//);
    expect(mainSource).not.toMatch(/from ['"].*\/auth\//);
    // Admin + auth enter only via React Router lazy() dynamic import().
    expect(mainSource).toMatch(/import\('\.\/admin\/AdminLayout/);
    expect(mainSource).toMatch(/import\('\.\/auth\/AuthCallback/);
  });

  test('bears pages are lazy-loaded and not static imports', () => {
    expect(mainSource).not.toMatch(/from ['"].*DontFeedTheBears/);
    expect(mainSource).not.toMatch(/from ['"].*pages\/bears\//);
    expect(mainSource).toMatch(/import\(\s*'\.\/pages\/DontFeedTheBears/);
    expect(mainSource).toMatch(/import\(\s*'\.\/pages\/bears\/CampRules/);
    expect(mainSource).toMatch(/import\(\s*'\.\/pages\/bears\/StayWild/);
  });

  test('the bears landing page loads neither game', () => {
    expect(landingSource).not.toMatch(/BearGame/);
    expect(landingSource).not.toMatch(/pages\/bears\//);
  });

  // RR skips HydrateFallback returned from lazy() during initial hydration, so
  // it must be a static sibling of `lazy` (and on the root) or /admin warns.
  test('lazy routes declare HydrateFallback statically via lazyRoute()', () => {
    expect(mainSource).toMatch(/HydrateFallback:\s*LazyFallback/);
    expect(mainSource).toMatch(/lazyRoute\(/);
    expect(mainSource).not.toMatch(
      /return\s*\{\s*Component:[^}]*HydrateFallback/,
    );
    expect(lazyRouteSource).toMatch(/HydrateFallback:\s*LazyFallback/);
    expect(lazyRouteSource).toMatch(/\blazy\b/);
    const lazyRouteCalls = mainSource.match(/lazyRoute\(/g);
    expect(lazyRouteCalls?.length).toBeGreaterThanOrEqual(8);
  });
});
