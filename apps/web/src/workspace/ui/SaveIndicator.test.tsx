import { act, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { SaveIndicator } from './SaveIndicator';

describe('SaveIndicator', () => {
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
