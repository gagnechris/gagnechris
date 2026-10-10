import { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../test/render';
import {
  initials,
  rootGuards,
  SessionProvider,
  useSession,
  type AuthBackend,
} from './session';

describe('root gate', () => {
  it('opens each space the groups allow', () => {
    expect(rootGuards('signedIn', ['notebook', 'admin'])).toEqual({
      notebook: true,
      admin: true,
      noAccess: false,
      signIn: false,
    });
    expect(rootGuards('signedIn', ['admin'])).toMatchObject({
      notebook: false,
      admin: true,
      noAccess: false,
    });
  });

  it('shows No access to a signed-in user with no space', () => {
    expect(rootGuards('signedIn', [])).toEqual({
      notebook: false,
      admin: false,
      noAccess: true,
      signIn: false,
    });
  });

  it('shows sign-in when signed out, and nothing while restoring', () => {
    expect(rootGuards('signedOut', []).signIn).toBe(true);
    expect(Object.values(rootGuards('restoring', ['notebook']))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('builds avatar initials from the name, else the email', () => {
    const user = { sub: 's', email: 'chris.gagne@example.com', groups: [] };
    expect(initials({ ...user, name: 'Chris Gagne' })).toBe('CG');
    expect(initials({ ...user, name: null })).toBe('CG');
    expect(initials({ ...user, email: 'alex@example.com', name: null })).toBe(
      'A',
    );
  });
});

describe('SessionProvider', () => {
  const user = {
    sub: 'a',
    email: 'a@example.com',
    name: null,
    groups: ['notebook'],
  };
  const fakeBackend = (overrides: Partial<AuthBackend> = {}) => {
    let expire = () => {};
    const backend: AuthBackend = {
      restore: vi.fn(async () => null),
      signIn: vi.fn(async () => ({ user, differentUser: false })),
      signOut: vi.fn(async () => {}),
      getToken: vi.fn(async () => 'token'),
      onExpired: (listener) => {
        expire = listener;
        return () => {};
      },
      markInstalled: vi.fn(async () => {}),
      ...overrides,
    };
    return { backend, expire: () => expire() };
  };

  const mount = async (backend: AuthBackend, wipe: () => Promise<void>) => {
    let session!: ReturnType<typeof useSession>;
    const Probe = () => {
      session = useSession();
      return null;
    };
    await render(
      <SessionProvider backend={backend} wipe={wipe}>
        <Probe />
      </SessionProvider>,
    );
    return () => session;
  };

  it('wipes before a different user renders, then records the install', async () => {
    const order: string[] = [];
    const { backend } = fakeBackend({
      signIn: vi.fn(async () => ({ user, differentUser: true })),
      markInstalled: vi.fn(async () => {
        order.push('marker');
      }),
    });
    const session = await mount(backend, async () => {
      order.push('wipe');
    });
    await act(async () => session().signIn());
    expect(order).toEqual(['wipe', 'marker']);
    expect(session().status).toBe('signedIn');
  });

  it('keeps the cache when the same user signs back in', async () => {
    const wipe = vi.fn(async () => {});
    const { backend } = fakeBackend();
    const session = await mount(backend, wipe);
    await act(async () => session().signIn());
    expect(wipe).not.toHaveBeenCalled();
  });

  it('an expired session asks for sign-in without wiping', async () => {
    const wipe = vi.fn(async () => {});
    const { backend, expire } = fakeBackend({
      restore: vi.fn(async () => user),
    });
    const session = await mount(backend, wipe);
    expect(session().status).toBe('signedIn');
    await act(async () => expire());
    expect(session()).toMatchObject({ status: 'signedOut', expired: true });
    expect(wipe).not.toHaveBeenCalled();
  });

  it('a Public CMS user gets only the Admin space', async () => {
    const { backend } = fakeBackend({
      restore: vi.fn(async () => ({ ...user, groups: ['site-admin'] })),
    });
    const session = await mount(backend, async () => {});
    expect(session().spaces).toEqual(['admin']);
    expect(rootGuards(session().status, session().spaces)).toMatchObject({
      noAccess: false,
      notebook: false,
      admin: true,
    });
  });

  it('a user with no app group gets No access', async () => {
    const { backend } = fakeBackend({
      restore: vi.fn(async () => ({ ...user, groups: ['user-admin'] })),
    });
    const session = await mount(backend, async () => {});
    expect(rootGuards(session().status, session().spaces).noAccess).toBe(true);
  });
});
