import { describe, expect, test } from 'vitest'
import mainSource from '../main.tsx?raw'
import lazyRouteSource from '../routing/lazyRoute.ts?raw'

describe('public entry bundle isolation', () => {
  test('main.tsx does not statically import Amplify or admin modules', () => {
    expect(mainSource).not.toMatch(/from ['"]aws-amplify/)
    expect(mainSource).not.toMatch(/from ['"].*\/admin\//)
    expect(mainSource).not.toMatch(/from ['"].*\/auth\//)
    // Admin + auth enter only via React Router lazy() dynamic import().
    expect(mainSource).toMatch(/import\('\.\/admin\/AdminLayout/)
    expect(mainSource).toMatch(/import\('\.\/auth\/AuthCallback/)
  })

  test('dont-feed-the-bears is lazy-loaded and not a static import', () => {
    expect(mainSource).not.toMatch(/from ['"].*DontFeedTheBears/)
    expect(mainSource).toMatch(/import\(\s*'\.\/pages\/DontFeedTheBears/)
  })

  // RR skips HydrateFallback returned from lazy() during initial hydration, so
  // it must be a static sibling of `lazy` (and on the root) or /admin warns.
  test('lazy routes declare HydrateFallback statically via lazyRoute()', () => {
    expect(mainSource).toMatch(/HydrateFallback:\s*LazyFallback/)
    expect(mainSource).toMatch(/lazyRoute\(/)
    expect(mainSource).not.toMatch(
      /return\s*\{\s*Component:[^}]*HydrateFallback/,
    )
    expect(lazyRouteSource).toMatch(/HydrateFallback:\s*LazyFallback/)
    expect(lazyRouteSource).toMatch(/\blazy\b/)
    // Admin tree + public lazy pages should use the helper (not hand-rolled).
    const lazyRouteCalls = mainSource.match(/lazyRoute\(/g)
    expect(lazyRouteCalls?.length).toBeGreaterThanOrEqual(8)
  })
})
