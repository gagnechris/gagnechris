import { render } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import PageHead from './PageHead';

const canonical = () =>
  document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
const meta = (selector: string) =>
  document.head.querySelector(`meta[${selector}]`)?.getAttribute('content');

afterEach(() => {
  document.head.innerHTML = '';
});

describe('PageHead', () => {
  test('moves the title, canonical and og tags along on navigation', () => {
    const { rerender } = render(
      <PageHead title="First" url="https://gagnechris.com/a" />,
    );
    rerender(<PageHead title="Second" url="https://gagnechris.com/b" />);

    expect(document.title).toBe('Second');
    expect(document.head.querySelectorAll('title, link')).toHaveLength(2);
    expect(canonical()).toBe('https://gagnechris.com/b');
    expect(meta('property="og:url"')).toBe('https://gagnechris.com/b');
    expect(meta('name="twitter:title"')).toBe('Second');
  });

  test('a page without a URL drops the canonical and is noindex until it unmounts', () => {
    render(
      <PageHead title="Before" url="https://gagnechris.com/a" />,
    ).unmount();
    const { unmount } = render(<PageHead title="Not found" url={null} />);

    expect(canonical()).toBeUndefined();
    expect(meta('property="og:url"')).toBeUndefined();
    expect(meta('name="robots"')).toBe('noindex');
    unmount();
    expect(meta('name="robots"')).toBeUndefined();
  });
});
