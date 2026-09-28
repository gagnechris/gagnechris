import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Field, TextArea, TextInput } from './Field'

describe('Field', () => {
  test('renders label, input, and hint', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Field label="Name" hint="Shown on the homepage">
        <TextInput value="Chris" onChange={onChange} />
      </Field>,
    )
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Shown on the homepage')).toBeInTheDocument()
    const input = screen.getByDisplayValue('Chris')
    await user.clear(input)
    await user.type(input, 'Ada')
    expect(onChange).toHaveBeenCalled()
  })

  test('TextArea applies textarea classes', () => {
    render(
      <Field label="About" fullWidth>
        <TextArea rows={3} value="Hello" onChange={() => {}} />
      </Field>,
    )
    const area = screen.getByDisplayValue('Hello')
    expect(area.tagName).toBe('TEXTAREA')
    expect(area).toHaveClass('admin-input', 'admin-textarea')
  })
})
