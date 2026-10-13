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

  test('quiet hides routine states but still shows offline', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<SaveIndicator saveState="saved" dirty={false} quiet />);
    expect(screen.getByText('Saved')).toHaveClass('kit-visually-hidden');
    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('Saved')).toHaveClass('kit-visually-hidden');
    online.mockRestore();
  });

  test('quiet shows the offline retry label', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<SaveIndicator saveState="idle" dirty quiet />);
    expect(screen.getByText('Offline, will retry')).not.toHaveClass(
      'kit-visually-hidden',
    );
    online.mockRestore();
  });
});
