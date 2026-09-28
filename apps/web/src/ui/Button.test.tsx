import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  test('renders a button and fires onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button variant="primary" onClick={onClick}>
        Publish
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Publish' })
    expect(btn).toHaveClass('admin-btn', 'admin-btn--primary')
    await user.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('renders an external link when href is set', () => {
    render(<Button href="/blog/hello">View live</Button>)
    const link = screen.getByRole('link', { name: 'View live' })
    expect(link).toHaveAttribute('href', '/blog/hello')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
