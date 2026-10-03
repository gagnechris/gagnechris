import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LegacyPostRedirect from './LegacyPostRedirect';

const ShowPath = () => <p>{useLocation().pathname}</p>;

describe('LegacyPostRedirect', () => {
  it('sends /blog/:slug to /posts/:slug (CHR-206)', () => {
    render(
      <MemoryRouter initialEntries={['/blog/welcome']}>
        <Routes>
          <Route path="/blog/:slug" element={<LegacyPostRedirect />} />
          <Route path="/posts/:slug" element={<ShowPath />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('/posts/welcome')).toBeInTheDocument();
  });
});
