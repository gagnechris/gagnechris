import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { Field, TextInput } from './Field'
import { Repeater } from './Repeater'
import { newRepeaterId } from './repeaterId'

type Row = { id: string; title: string }

function Harness() {
  const [items, setItems] = useState<Row[]>([
    { id: 'a', title: 'First' },
    { id: 'b', title: 'Second' },
  ])
  return (
    <Repeater
      legend="Roles"
      items={items}
      onChange={setItems}
      createItem={() => ({ id: newRepeaterId(), title: '' })}
      addLabel="Add role"
      removeLabel="Remove role"
      renderItem={(item, { update }) => (
        <Field label="Title">
          <TextInput
            aria-label={`Title ${item.id}`}
            value={item.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </Field>
      )}
    />
  )
}

describe('Repeater', () => {
  test('keeps stable keys so removing the first row preserves the second field', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const second = screen.getByLabelText('Title b')
    await user.clear(second)
    await user.type(second, 'Kept')
    expect(second).toHaveValue('Kept')

    await user.click(screen.getAllByRole('button', { name: 'Remove role' })[0]!)
    expect(screen.queryByLabelText('Title a')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title b')).toHaveValue('Kept')
  })

  test('adds a new row with createItem', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getAllByLabelText(/^Title /)).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Add role' }))
    expect(screen.getAllByLabelText(/^Title /)).toHaveLength(3)
  })
})
