import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { SaveIndicator } from './SaveIndicator'
import { saveLabel } from './saveLabel'

describe('SaveIndicator', () => {
  test('saveLabel covers saving / dirty / clean', () => {
    expect(saveLabel('saving', true)).toBe('Saving…')
    expect(saveLabel('idle', true)).toBe('Unsaved changes')
    expect(saveLabel('saved', false)).toBe('Saved')
    expect(saveLabel('idle', false)).toBe('Saved')
  })

  test('renders label with data-state', () => {
    render(<SaveIndicator saveState="saving" dirty />)
    const el = screen.getByText('Saving…')
    expect(el).toHaveAttribute('data-state', 'saving')
  })
})
