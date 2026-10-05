import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { QueryClientTestProvider } from '../test-utils';
import AdminResumePage from './AdminResumePage';

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

const baseResume = {
  name: 'Chris Gagne',
  pdfPath: '/resume.pdf',
  content: {
    summary: 'Summary',
    competencies: ['Lead'],
    experience: [
      {
        title: 'Engineer',
        company: 'Acme',
        bullets: ['Did things'],
      },
    ],
    skills: ['TypeScript'],
    education: [],
  },
  status: 'published' as const,
  publishedAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
  seo: { ogImage: '/media/og-resume.png' },
  version: 1,
  hasUnpublishedChanges: false,
};

const openRole = async (title: string) => {
  fireEvent.click(
    await screen.findByRole('button', { name: new RegExp(`^${title}`) }),
  );
  await screen.findByRole('heading', { name: title });
};

const backToRoles = () =>
  fireEvent.click(screen.getByRole('button', { name: '← All roles' }));

function renderResume() {
  const router = createMemoryRouter(
    [{ path: '/resume', element: <AdminResumePage /> }],
    { initialEntries: ['/resume'] },
  );
  return render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
}

describe('AdminResumePage autosave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValue({
      data: structuredClone(baseResume),
      error: undefined,
      response: { status: 200 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('keeps blank bullet lines while a save is in flight', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let resolvePut!: (value: unknown) => void;
    put.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePut = resolve;
        }),
    );

    renderResume();
    await openRole('Engineer');
    const bullets = screen.getByDisplayValue('Did things');

    await user.type(bullets, '{Enter}');
    expect(bullets).toHaveValue('Did things\n');

    await vi.advanceTimersByTimeAsync(950);
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));

    await user.type(bullets, 'New bullet');
    expect(bullets).toHaveValue('Did things\nNew bullet');

    // Server response drops the blank line — draft must not be replaced.
    resolvePut({
      data: {
        ...baseResume,
        content: {
          ...baseResume.content,
          experience: [
            {
              title: 'Engineer',
              company: 'Acme',
              bullets: ['Did things'],
            },
          ],
        },
        version: 2,
        hasUnpublishedChanges: false,
      },
      error: undefined,
      response: { status: 200 },
    });

    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(bullets).toHaveValue('Did things\nNew bullet');
  });
});

describe('AdminResumePage publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
      data: { ...structuredClone(baseResume), hasUnpublishedChanges: true },
      error: undefined,
      response: { status: 200 },
    });
    put.mockResolvedValue({
      data: {
        ...structuredClone(baseResume),
        version: 2,
        hasUnpublishedChanges: true,
      },
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

    renderResume();
    const summary = await screen.findByDisplayValue('Summary');

    await user.click(screen.getByRole('button', { name: 'Publish changes' }));

    await user.clear(summary);
    await user.type(summary, 'typed while publishing');

    resolvePublish({
      data: {
        ...structuredClone(baseResume),
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

describe('AdminResumePage structured dates', () => {
  const structured = {
    ...baseResume,
    content: {
      ...baseResume.content,
      headline: 'Director of Software Engineering',
      earlierRolesThrough: 2012,
      experience: [
        {
          title: 'Director',
          company: 'Ro',
          start: '2019-07',
          end: null,
          bullets: ['Led'],
        },
        {
          title: 'Architect',
          company: 'Viacom',
          start: '2014-09',
          end: '2015-04',
          note: 'contract, concurrent',
          bullets: ['Built'],
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValue({
      data: structuredClone(structured),
      error: undefined,
      response: { status: 200 },
    });
    put.mockImplementation((_path: string, { body }: { body: unknown }) =>
      Promise.resolve({
        data: {
          ...structuredClone(structured),
          ...(body as object),
          version: 2,
        },
        error: undefined,
        response: { status: 200 },
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const lastPutContent = () =>
    (
      put.mock.calls[put.mock.calls.length - 1]![1] as {
        body: { content: unknown };
      }
    ).body.content as typeof structured.content;

  test('lists roles with their dates and loads each role into labelled fields', async () => {
    renderResume();
    expect(await screen.findByLabelText('Headline (current role)')).toHaveValue(
      'Director of Software Engineering',
    );
    expect(
      screen.getByLabelText(/^Earlier roles through \(year\)/),
    ).toHaveValue(2012);
    const roles = within(screen.getByRole('list', { name: 'Roles' }));
    expect(
      roles
        .getAllByRole('button', { name: /^(Director|Architect)/ })
        .map((row) => row.textContent),
    ).toEqual([
      'DirectorRo · Jul 2019 – Present',
      'ArchitectViacom · Sep 2014 – Apr 2015',
    ]);

    await openRole('Director');
    const start = screen.getByLabelText('Start month');
    expect(start).toHaveValue('2019-07');
    expect(start).toHaveAttribute('type', 'month');
    expect(screen.getByLabelText(/^End month/)).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: 'Present (current role)' }),
    ).toBeChecked();

    backToRoles();
    await openRole('Architect');
    expect(screen.getByLabelText('Start month')).toHaveValue('2014-09');
    expect(screen.getByLabelText(/^End month/)).toHaveValue('2015-04');
    expect(
      screen.getByRole('checkbox', { name: 'Present (current role)' }),
    ).not.toBeChecked();
    expect(screen.getByLabelText(/^Note \(optional\)/)).toHaveValue(
      'contract, concurrent',
    );
  });

  test('the arrow keys on a role handle reorder the roles', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderResume();
    const handle = await screen.findByRole('button', {
      name: 'Reorder Director',
    });
    handle.focus();
    await user.keyboard('{ArrowDown}');
    expect(handle).toHaveFocus();
    expect(
      within(screen.getByRole('list', { name: 'Roles' }))
        .getAllByRole('button', { name: /^Reorder/ })
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Reorder Architect', 'Reorder Director']);

    await vi.advanceTimersByTimeAsync(950);
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(
      lastPutContent().experience.map((role: { title: string }) => role.title),
    ).toEqual(['Architect', 'Director']);
  });

  test('an end before start keeps the typed value, shows a linked error, sends the saved dates and is not reported as saved', async () => {
    renderResume();
    await openRole('Architect');
    const end = screen.getByLabelText(/^End month/);

    fireEvent.change(end, { target: { value: '2013-01' } });

    expect(end).toHaveValue('2013-01');
    expect(end).toHaveAttribute('aria-invalid', 'true');
    const describedBy = end.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      /^End is before start/,
    );

    await vi.advanceTimersByTimeAsync(950);
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const role = lastPutContent().experience[1]!;
    expect(role).toMatchObject({
      start: '2014-09',
      end: '2015-04',
      company: 'Viacom',
      note: 'contract, concurrent',
    });

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes'),
    );
    expect(screen.queryByText(/^Saved$/)).not.toBeInTheDocument();
    expect(end).toHaveValue('2013-01');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(put).toHaveBeenCalledTimes(1);

    fireEvent.change(end, { target: { value: '2015-05' } });
    expect(end).not.toHaveAttribute('aria-invalid');
    await vi.advanceTimersByTimeAsync(950);
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(lastPutContent().experience[1]).toMatchObject({
      start: '2014-09',
      end: '2015-05',
    });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Saved'),
    );
  });

  test('an end before start after a saved edit sends the newer saved dates', async () => {
    renderResume();
    await openRole('Architect');
    const end = screen.getByLabelText(/^End month/);

    fireEvent.change(end, { target: { value: '2015-08' } });
    await vi.advanceTimersByTimeAsync(950);
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Saved'),
    );

    fireEvent.change(end, { target: { value: '2013-01' } });
    expect(
      document.getElementById(end.getAttribute('aria-describedby')!),
    ).toHaveTextContent('The last saved dates are kept until this is fixed.');
    await vi.advanceTimersByTimeAsync(950);
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(lastPutContent().experience[1]).toMatchObject({
      start: '2014-09',
      end: '2015-08',
    });
  });

  test('saving round-trips edited dates, note, headline and cut-off', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderResume();
    const headline = await screen.findByLabelText('Headline (current role)');

    await user.clear(headline);
    await user.type(headline, 'VP Engineering');
    const cutoff = screen.getByLabelText(/^Earlier roles through \(year\)/);
    await user.clear(cutoff);
    await user.type(cutoff, '2010');
    await openRole('Architect');
    fireEvent.change(screen.getByLabelText('Start month'), {
      target: { value: '2014-10' },
    });
    const note = screen.getByLabelText(/^Note \(optional\)/);
    await user.clear(note);
    await user.type(note, 'contract');

    backToRoles();
    await openRole('Director');
    const present = screen.getByRole('checkbox', {
      name: 'Present (current role)',
    });
    present.focus();
    await user.keyboard(' ');
    expect(present).not.toBeChecked();
    const firstEnd = screen.getByLabelText(/^End month/);
    expect(firstEnd).toBeEnabled();
    fireEvent.change(firstEnd, { target: { value: '2026-09' } });

    await vi.advanceTimersByTimeAsync(950);
    await waitFor(() => {
      expect(put).toHaveBeenCalled();
      expect(lastPutContent().experience[0]).toMatchObject({
        end: '2026-09',
      });
    });
    const content = lastPutContent();
    expect(content.headline).toBe('VP Engineering');
    expect(content.earlierRolesThrough).toBe(2010);
    expect(content.experience).toEqual([
      {
        title: 'Director',
        company: 'Ro',
        start: '2019-07',
        end: '2026-09',
        bullets: ['Led'],
      },
      {
        title: 'Architect',
        company: 'Viacom',
        start: '2014-10',
        end: '2015-04',
        note: 'contract',
        bullets: ['Built'],
      },
    ]);

    backToRoles();
    await openRole('Architect');
    await user.click(
      screen.getByRole('checkbox', { name: 'Present (current role)' }),
    );
    await vi.advanceTimersByTimeAsync(950);
    await waitFor(() =>
      expect(lastPutContent().experience[1]).toMatchObject({ end: null }),
    );
    expect(screen.getByLabelText(/^End month/)).toBeDisabled();
  });
});

describe('AdminResumePage publish with an end before start', () => {
  const dated = {
    ...baseResume,
    hasUnpublishedChanges: true,
    content: {
      ...baseResume.content,
      experience: [
        {
          title: 'Architect',
          company: 'Viacom',
          start: '2014-09',
          end: '2015-04',
          bullets: ['Built'],
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
      data: structuredClone(dated),
      error: undefined,
      response: { status: 200 },
    });
    put.mockImplementation((_path: string, { body }: { body: unknown }) =>
      Promise.resolve({
        data: {
          ...structuredClone(dated),
          ...(body as object),
          version: 2,
        },
        error: undefined,
        response: { status: 200 },
      }),
    );
    post.mockResolvedValue({
      data: {
        ...structuredClone(dated),
        version: 3,
        hasUnpublishedChanges: false,
      },
      error: undefined,
      response: { status: 200 },
    });
  });

  const putBodies = () =>
    put.mock.calls.map(
      (call) =>
        (call[1] as { body: { content: typeof dated.content } }).body.content,
    );

  test('publishing a role that has saved dates publishes a draft that still has them', async () => {
    const user = userEvent.setup();
    renderResume();
    await openRole('Architect');
    const end = screen.getByDisplayValue('2015-04');

    fireEvent.change(end, { target: { value: '2013-01' } });
    await user.click(screen.getByRole('button', { name: 'Publish changes' }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.invocationCallOrder[0]).toBeLessThan(
      post.mock.invocationCallOrder[0]!,
    );
    expect(putBodies()[0]!.experience[0]).toMatchObject({
      start: '2014-09',
      end: '2015-04',
    });
    expect(post.mock.calls[0]![1]).toMatchObject({ body: { version: 2 } });
    expect(end).toHaveValue('2013-01');
  });

  test('publish is blocked while a new role with no saved dates has an end before start', async () => {
    const user = userEvent.setup();
    renderResume();
    await screen.findByRole('button', { name: /^Architect/ });

    await user.click(screen.getByRole('button', { name: 'Add role' }));
    expect(
      await screen.findByRole('heading', { name: 'New role' }),
    ).toHaveFocus();
    const start = screen.getByLabelText('Start month');
    const end = screen.getByLabelText(/^End month/);
    fireEvent.change(start, { target: { value: '2020-05' } });
    fireEvent.change(end, { target: { value: '2020-01' } });
    expect(
      document.getElementById(end.getAttribute('aria-describedby')!),
    ).toHaveTextContent(
      'Dates for this role are not saved until this is fixed.',
    );

    await user.click(screen.getByRole('button', { name: 'Publish changes' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      /Not published: .* End month before its Start month/,
    );
    expect(end).toHaveFocus();
    const link = screen.getByRole('link', { name: 'Fix End month' });
    expect(link).toHaveAttribute('href', `#${end.id}`);

    backToRoles();
    expect(screen.queryByLabelText(/^End month/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Fix End month' }));
    expect(screen.getByLabelText(/^End month/)).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^End month/), {
      target: { value: '2020-06' },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish changes' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(putBodies()[put.mock.calls.length - 1]!.experience[1]).toMatchObject(
      {
        start: '2020-05',
        end: '2020-06',
      },
    );
  });
});

describe('AdminResumePage public links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
      data: { ...baseResume },
      error: undefined,
      response: { status: 200 },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('View live opens the public dev origin in a new tab', async () => {
    renderResume();
    const link = await screen.findByRole('link', { name: 'View live' });
    expect(link).toHaveAttribute('href', 'http://localhost:5173/resume');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('View live and preview links point at the public site in prod', async () => {
    vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://gagnechris.com');
    renderResume();
    expect(
      await screen.findByRole('link', { name: 'View live' }),
    ).toHaveAttribute('href', 'https://gagnechris.com/resume');
    expect(screen.getByRole('link', { name: 'Get in touch' })).toHaveAttribute(
      'href',
      'https://gagnechris.com/contact',
    );
  });

  test('preview images load from the public site', async () => {
    vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://gagnechris.com');
    const { container } = renderResume();
    await screen.findByRole('link', { name: 'View live' });
    const sources = [...container.querySelectorAll('img')].map((img) =>
      img.getAttribute('src'),
    );
    expect(sources).toContain('https://gagnechris.com/profile.jpg');
    for (const src of sources) {
      expect(src).toMatch(/^https:\/\/gagnechris\.com\//);
    }
  });
});
