import { describe, expect, test } from 'vitest'

describe('intentional fail (CHR-57 gate check)', () => {
  test('fails so we can confirm merge is blocked', () => {
    expect(true).toBe(false)
  })
})
