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
})
