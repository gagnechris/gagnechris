import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { trackEvent } from '../utils/analytics';
import SiteLink from './SiteLink';

vi.mock('../utils/analytics');

const renderLink = (node: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={node} />
        <Route path="/posts" element={<p>Posts page</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('SiteLink', () => {
  test('a site path navigates in the app without a discover attribute', () => {
    renderLink(<SiteLink href="/posts">Posts</SiteLink>);
    const link = screen.getByRole('link', { name: 'Posts' });
    expect(link.outerHTML).toBe('<a href="/posts">Posts</a>');
    fireEvent.click(link);
    expect(screen.getByText('Posts page')).toBeInTheDocument();
  });

  test.each(['//evil.example/posts', 'https://example.com/'])(
    '%s is a plain link',
    (href) => {
      renderLink(<SiteLink href={href}>Out</SiteLink>);
      expect(screen.getByRole('link', { name: 'Out' }).outerHTML).toBe(
        `<a href="${href}">Out</a>`,
      );
    },
  );

  test('spa={false} keeps a site file out of the router', () => {
    renderLink(
      <SiteLink href="/rss.xml" spa={false}>
        RSS
      </SiteLink>,
    );
    expect(screen.getByRole('link', { name: 'RSS' }).outerHTML).toBe(
      '<a href="/rss.xml">RSS</a>',
    );
  });

  test('a tracked new-tab link sends the click event and calls onClick', () => {
    const onClick = vi.fn();
    renderLink(
      <SiteLink
        href="https://github.com/gagnechris"
        newTab
        trackId="github"
        onClick={onClick}
      >
        GitHub
      </SiteLink>,
    );
    const link = screen.getByRole('link', { name: 'GitHub' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(link);
    expect(trackEvent).toHaveBeenCalledWith('click', 'external_link', 'github');
    expect(onClick).toHaveBeenCalled();
  });
});
