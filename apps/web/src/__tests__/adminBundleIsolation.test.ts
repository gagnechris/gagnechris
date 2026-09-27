import { describe, expect, test } from 'vitest'
import mainSource from '../main.tsx?raw'

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
  test('lazy routes declare HydrateFallback statically, not only inside lazy()', () => {
    expect(mainSource).toMatch(/HydrateFallback:\s*LazyFallback/)
    expect(mainSource).not.toMatch(
      /return\s*\{\s*Component:[^}]*HydrateFallback/,
    )
    const lazyBlocks = mainSource.match(/HydrateFallback:\s*LazyFallback,\s*\n\s*lazy:/g)
    expect(lazyBlocks?.length).toBeGreaterThanOrEqual(8)
  })
})
