import { act, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { SaveIndicator } from './SaveIndicator';
import { saveLabel } from './saveLabel';

describe('SaveIndicator', () => {
  test('saveLabel covers saving / dirty / clean', () => {
    expect(saveLabel('saving', true)).toBe('Saving…');
    expect(saveLabel('idle', true)).toBe('Unsaved changes');
    expect(saveLabel('saved', false)).toBe('Saved');
    expect(saveLabel('idle', false)).toBe('Saved');
  });

  test('a new entity reads Not saved yet until it has changes', () => {
    expect(saveLabel('idle', false, { isNew: true })).toBe('Not saved yet');
    expect(saveLabel('idle', true, { isNew: true })).toBe('Unsaved changes');
  });

  test('offline with pending changes or a failed save reads Offline, will retry', () => {
    expect(saveLabel('idle', true, { offline: true })).toBe(
      'Offline, will retry',
    );
    expect(saveLabel('error', false, { offline: true })).toBe(
      'Offline, will retry',
    );
    expect(saveLabel('saved', false, { offline: true })).toBe('Saved');
  });

  test('shows one label, following the browser going offline', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<SaveIndicator saveState="idle" dirty isNew />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Unsaved changes$/);
    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      /^Offline, will retry$/,
    );
    online.mockRestore();
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
