import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { SaveIndicator } from './SaveIndicator';
import { saveLabel } from './saveLabel';

describe('SaveIndicator', () => {
  test('saveLabel covers saving / dirty / clean', () => {
    expect(saveLabel('saving', true)).toBe('Saving…');
    expect(saveLabel('idle', true)).toBe('Unsaved changes');
    expect(saveLabel('saved', false)).toBe('Saved');
    expect(saveLabel('idle', false)).toBe('Saved');
  });

  test('renders label with data-state', () => {
    render(<SaveIndicator saveState="saving" dirty />);
    const el = screen.getByText('Saving…');
    expect(el).toHaveAttribute('data-state', 'saving');
  });

  test('exposes a polite live status region', () => {
    render(<SaveIndicator saveState="saved" dirty={false} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Saved');
  });
});
