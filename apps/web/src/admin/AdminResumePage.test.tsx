import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    const bullets = await screen.findByDisplayValue('Did things');

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

  test('loads start, end, present, note, headline and cut-off into labelled fields', async () => {
    renderResume();
    expect(await screen.findByLabelText('Headline (current role)')).toHaveValue(
      'Director of Software Engineering',
    );
    expect(
      screen.getByLabelText(/^Earlier roles through \(year\)/),
    ).toHaveValue(2012);
    const starts = screen.getAllByLabelText('Start month');
    const ends = screen.getAllByLabelText(/^End month/);
    const present = screen.getAllByRole('checkbox', {
      name: 'Present (current role)',
    });
    expect(starts.map((el) => (el as HTMLInputElement).value)).toEqual([
      '2019-07',
      '2014-09',
    ]);
    expect(starts[0]).toHaveAttribute('type', 'month');
    expect(ends[0]).toBeDisabled();
    expect(ends[1]).toHaveValue('2015-04');
    expect(present[0]).toBeChecked();
    expect(present[1]).not.toBeChecked();
    expect(screen.getAllByLabelText(/^Note \(optional\)/)[1]).toHaveValue(
      'contract, concurrent',
    );
  });

  test('an end before start keeps the typed value, shows a linked error, sends the saved dates and is not reported as saved', async () => {
    renderResume();
    await screen.findByLabelText('Headline (current role)');
    const end = screen.getAllByLabelText(/^End month/)[1]!;

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
    await screen.findByLabelText('Headline (current role)');
    const end = screen.getAllByLabelText(/^End month/)[1]!;

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
    fireEvent.change(screen.getAllByLabelText('Start month')[1]!, {
      target: { value: '2014-10' },
    });
    const notes = screen.getAllByLabelText(/^Note \(optional\)/);
    await user.clear(notes[1]!);
    await user.type(notes[1]!, 'contract');

    const present = screen.getAllByRole('checkbox', {
      name: 'Present (current role)',
    });
    present[0]!.focus();
    await user.keyboard(' ');
    expect(present[0]).not.toBeChecked();
    const firstEnd = screen.getAllByLabelText(/^End month/)[0]!;
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

    await user.click(present[1]!);
    await vi.advanceTimersByTimeAsync(950);
    await waitFor(() =>
      expect(lastPutContent().experience[1]).toMatchObject({ end: null }),
    );
    expect(screen.getAllByLabelText(/^End month/)[1]).toBeDisabled();
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
    const end = await screen.findByDisplayValue('2015-04');

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
    await screen.findByDisplayValue('2015-04');

    await user.click(screen.getByRole('button', { name: 'Add role' }));
    const start = screen.getAllByLabelText('Start month')[1]!;
    const end = screen.getAllByLabelText(/^End month/)[1]!;
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

    screen.getAllByLabelText('Start month')[0]!.focus();
    await user.click(link);
    expect(end).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(end, { target: { value: '2020-06' } });
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
