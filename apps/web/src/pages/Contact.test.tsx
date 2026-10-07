import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApiClient } from '@gagnechris/api-client';
import Contact from './Contact';

vi.mock('../utils/analytics');
vi.mock('../api/public-client', () => ({
  createPublicApiClient: () => createApiClient({ baseUrl: 'http://localhost' }),
}));

const respond = (status: number, body: unknown) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );

const renderContact = () => {
  render(
    <MemoryRouter>
      <Contact />
    </MemoryRouter>,
  );
  return {
    user: userEvent.setup(),
    name: screen.getByLabelText('Name'),
    email: screen.getByLabelText('Email'),
    message: screen.getByLabelText('Message'),
    submit: screen.getByRole('button', { name: 'Send message' }),
    status: () => screen.getByRole('alert'),
  };
};

/** The error text each field's `aria-describedby` points at. */
const describedBy = (field: HTMLElement): string | null => {
  const id = field.getAttribute('aria-describedby');
  return id ? (document.getElementById(id)?.textContent ?? '') : null;
};

describe('Contact form', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', respond(200, { ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('labels every field and starts with an empty live region', () => {
    const { name, email, message, submit } = renderContact();
    expect(name).toHaveAttribute('type', 'text');
    expect(email).toHaveAttribute('type', 'email');
    expect(message.tagName).toBe('TEXTAREA');
    expect(submit).toHaveClass('contact-form__submit');
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  test('empty submit: errors linked by aria-describedby, announced, focus on the first', async () => {
    const { user, name, email, message, submit, status } = renderContact();

    await user.click(submit);

    expect(describedBy(name)).toBe('Name is required');
    expect(describedBy(email)).toBe('Enter a valid email address');
    expect(describedBy(message)).toBe('Message is required');
    for (const field of [name, email, message]) {
      expect(field).toHaveAttribute('aria-invalid', 'true');
    }
    expect(status()).toHaveTextContent('Please fix the 3 highlighted fields.');
    expect(name).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();
  });

  test('keeps what was typed and focuses the first invalid field', async () => {
    const { user, name, email, message, submit, status } = renderContact();
    await user.type(name, 'Ada');
    await user.type(email, 'not-an-email');
    await user.type(message, 'Hello there');

    await user.click(submit);

    expect(email).toHaveFocus();
    expect(describedBy(email)).toBe('Enter a valid email address');
    expect(describedBy(name)).toBeNull();
    expect(name).not.toHaveAttribute('aria-invalid');
    expect(status()).toHaveTextContent('Please fix the highlighted field.');
    expect(name).toHaveValue('Ada');
    expect(email).toHaveValue('not-an-email');
    expect(message).toHaveValue('Hello there');
  });

  test('fixing a field clears its error', async () => {
    const { user, name, submit } = renderContact();
    await user.click(submit);
    expect(describedBy(name)).toBe('Name is required');

    await user.type(name, 'A');

    expect(describedBy(name)).toBeNull();
    expect(name).not.toHaveAttribute('aria-invalid');
  });

  const fill = async (fields: ReturnType<typeof renderContact>) => {
    await fields.user.type(fields.name, 'Ada Lovelace');
    await fields.user.type(fields.email, 'ada@example.com');
    await fields.user.type(fields.message, 'Hello there');
  };

  test('429: shows the rate-limit message and keeps the input', async () => {
    vi.stubGlobal(
      'fetch',
      respond(429, {
        error: 'rate_limited',
        message:
          'Too many contact submissions from this address. Try again later.',
      }),
    );
    const fields = renderContact();
    await fill(fields);

    await fields.user.click(fields.submit);

    await waitFor(() =>
      expect(fields.status()).toHaveTextContent(
        'Too many contact submissions from this address. Try again later.',
      ),
    );
    expect(fields.name).toHaveValue('Ada Lovelace');
    expect(fields.email).toHaveValue('ada@example.com');
    expect(fields.message).toHaveValue('Hello there');
    expect(fields.submit).toHaveTextContent('Send message');
    expect(fields.submit).not.toHaveAttribute('aria-disabled');
  });

  test('429 without a message falls back to a plain one', async () => {
    vi.stubGlobal('fetch', respond(429, { error: 'rate_limited' }));
    const fields = renderContact();
    await fill(fields);

    await fields.user.click(fields.submit);

    await waitFor(() =>
      expect(fields.status()).toHaveTextContent(
        'Too many messages. Please wait a bit and try again.',
      ),
    );
  });

  test('server field errors are linked and focused like client ones', async () => {
    vi.stubGlobal(
      'fetch',
      respond(400, {
        error: 'validation_error',
        fields: { email: 'invalid_format' },
      }),
    );
    const fields = renderContact();
    await fill(fields);

    await fields.user.click(fields.submit);

    await waitFor(() => expect(fields.email).toHaveFocus());
    expect(describedBy(fields.email)).toBe('Enter a valid email address');
    expect(fields.status()).toHaveTextContent(
      'Please fix the highlighted field.',
    );
    expect(fields.message).toHaveValue('Hello there');
  });

  test('a server error reads the same as the client one for that field', async () => {
    vi.stubGlobal(
      'fetch',
      respond(400, {
        error: 'validation_error',
        fields: { name: 'too_small', message: 'too_big' },
      }),
    );
    const fields = renderContact();
    await fill(fields);

    await fields.user.click(fields.submit);

    await waitFor(() => expect(fields.name).toHaveFocus());
    expect(describedBy(fields.name)).toBe('Name is required');
    expect(describedBy(fields.message)).toBe('Message is too long');
  });

  test('success replaces the form and moves focus to the confirmation', async () => {
    const fields = renderContact();
    await fill(fields);

    await fields.user.click(fields.submit);

    const heading = await screen.findByRole('heading', {
      name: 'Thanks, your message is on its way.',
    });
    expect(heading).toHaveFocus();
    expect(screen.queryByRole('form')).toBeNull();
    const success = screen.getByRole('region', {
      name: 'Thanks, your message is on its way.',
    });
    expect(
      within(success).getByRole('link', { name: /feed the bears/i }),
    ).toHaveAttribute('href', '/dont-feed-the-bears?from=contact');
    const [request] = vi.mocked(fetch).mock.calls[0]! as unknown as [Request];
    expect(await request.json()).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      message: 'Hello there',
    });
  });
});
