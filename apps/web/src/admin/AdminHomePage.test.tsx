import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { QueryClientTestProvider } from '../test-utils';
import AdminHomePage from './AdminHomePage';

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: (...args: unknown[]) => get(...args),
    PUT: (...args: unknown[]) => put(...args),
    POST: (...args: unknown[]) => post(...args),
  }),
}));

const baseHome = {
  name: 'Chris Gagne',
  title: 'Engineering',
  about: 'About me',
  status: 'published' as const,
  publishedAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
  seo: {
    title: 'SEO',
    description: 'Desc',
    ogImage: '/media/og-home.png',
  },
  version: 1,
  hasUnpublishedChanges: false,
};

function renderHome() {
  const router = createMemoryRouter(
    [{ path: '/home', element: <AdminHomePage /> }],
    { initialEntries: ['/home'] },
  );
  return render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
}

describe('AdminHomePage autosave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValue({
      data: { ...baseHome },
      error: undefined,
      response: { status: 200 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('keeps in-progress typing and trailing spaces across a save boundary', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let resolvePut!: (value: unknown) => void;
    put.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePut = resolve;
        }),
    );

    renderHome();
    const title = await screen.findByDisplayValue('Engineering');

    await user.type(title, ' ');
    expect(title).toHaveValue('Engineering ');

    await vi.advanceTimersByTimeAsync(950);
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));

    await user.type(title, 'Leader');
    expect(title).toHaveValue('Engineering Leader');

    resolvePut({
      data: {
        ...baseHome,
        title: 'Engineering',
        version: 2,
        hasUnpublishedChanges: false,
        updatedAt: '2026-09-27T00:01:00.000Z',
      },
      error: undefined,
      response: { status: 200 },
    });

    // Follow-up save for keystrokes typed during the first PUT.
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(title).toHaveValue('Engineering Leader');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('queues a slow save without spurious 409s', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const puts: Array<{
      version: number;
      resolve: (value: unknown) => void;
    }> = [];

    put.mockImplementation((...args: unknown[]) => {
      const body = (args[1] as { body: { version: number; title: string } })
        .body;
      return new Promise((resolve) => {
        puts.push({ version: body.version, resolve });
      });
    });

    renderHome();
    const title = await screen.findByDisplayValue('Engineering');

    await user.type(title, 'A');
    await vi.advanceTimersByTimeAsync(950);
    await waitFor(() => expect(puts).toHaveLength(1));

    // Keep typing while the first PUT is still outstanding (3s network).
    await user.type(title, 'B');
    await vi.advanceTimersByTimeAsync(950);
    // Second save must wait — still only one in flight.
    expect(puts).toHaveLength(1);

    puts[0]!.resolve({
      data: {
        ...baseHome,
        title: 'EngineeringA',
        version: 2,
        hasUnpublishedChanges: false,
        updatedAt: '2026-09-27T00:01:00.000Z',
      },
      error: undefined,
      response: { status: 200 },
    });

    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]!.version).toBe(2);

    puts[1]!.resolve({
      data: {
        ...baseHome,
        title: 'EngineeringAB',
        version: 3,
        hasUnpublishedChanges: false,
        updatedAt: '2026-09-27T00:02:00.000Z',
      },
      error: undefined,
      response: { status: 200 },
    });

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Conflict/i)).not.toBeInTheDocument();
    expect(title).toHaveValue('EngineeringAB');
  });

  test('preserves seo.ogImage on save', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    put.mockImplementation((_path: unknown, init: { body: unknown }) => {
      const body = init.body as {
        version: number;
        title: string;
        seo: { ogImage?: string; title?: string };
      };
      return Promise.resolve({
        data: {
          ...baseHome,
          title: body.title,
          seo: body.seo,
          version: body.version + 1,
          updatedAt: '2026-09-27T00:01:00.000Z',
        },
        error: undefined,
        response: { status: 200 },
      });
    });

    renderHome();
    const title = await screen.findByDisplayValue('Engineering');
    await user.clear(title);
    await user.type(title, 'New Title');
    await vi.advanceTimersByTimeAsync(950);

    await waitFor(() => expect(put).toHaveBeenCalled());
    const body = put.mock.calls[0]?.[1]?.body as {
      seo: { ogImage?: string };
    };
    expect(body.seo.ogImage).toBe('/media/og-home.png');
  });
});

describe('AdminHomePage publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
      data: { ...baseHome, hasUnpublishedChanges: true },
      error: undefined,
      response: { status: 200 },
    });
    put.mockResolvedValue({
      data: { ...baseHome, version: 2, hasUnpublishedChanges: true },
      error: undefined,
      response: { status: 200 },
    });
  });

  test('typing during a slow publish is not overwritten', async () => {
    const user = userEvent.setup();
    let resolvePublish!: (value: unknown) => void;
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePublish = resolve;
        }),
    );

    renderHome();
    const title = await screen.findByDisplayValue('Engineering');

    await user.click(screen.getByRole('button', { name: 'Publish changes' }));

    await user.clear(title);
    await user.type(title, 'typed while publishing');

    resolvePublish({
      data: {
        ...baseHome,
        title: 'Engineering',
        version: 3,
        hasUnpublishedChanges: false,
        status: 'published',
      },
      error: undefined,
      response: { status: 200 },
    });

    await waitFor(() => {
      expect(
        screen.getByDisplayValue('typed while publishing'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/^Saved$/)).not.toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });
});

describe('AdminHomePage public links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
      data: { ...baseHome },
      error: undefined,
      response: { status: 200 },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('View live opens the public dev origin in a new tab', async () => {
    renderHome();
    const link = await screen.findByRole('link', { name: 'View live' });
    expect(link).toHaveAttribute('href', 'http://localhost:5173/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
  });

  test('View live and preview links point at the public site in prod', async () => {
    vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://gagnechris.com');
    renderHome();
    expect(
      await screen.findByRole('link', { name: 'View live' }),
    ).toHaveAttribute('href', 'https://gagnechris.com/');
    const resume = screen.getByRole('link', { name: 'resume' });
    expect(resume).toHaveAttribute('href', 'https://gagnechris.com/resume');
    expect(resume).toHaveAttribute('target', '_blank');
  });
});
