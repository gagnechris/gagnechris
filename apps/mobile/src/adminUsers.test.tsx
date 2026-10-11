import { Alert } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UsersScreen from '../app/admin/users/index';
import {
  allText,
  byLabel,
  Providers,
  render,
  settle,
  signedInBackend,
} from '../test/render';
import { makeUser, usersServer } from '../test/usersServer';

let server: ReturnType<typeof usersServer>;
let mounted: ReactTestRenderer | null = null;

const me = makeUser('local-dev-user', {
  name: 'Chris Gagne',
  email: 'chris@example.com',
  level: 'full',
});
const sam = makeUser('sam', { name: 'Sam Rivera', level: 'cms' });

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  vi.clearAllMocks();
});

const show = async (
  users = [me, sam],
  backend = signedInBackend(),
  groups?: string[],
) => {
  server = usersServer(users);
  vi.stubGlobal('fetch', server.fetch);
  const renderer = await render(
    <Providers backend={groups ? signedInBackend(groups) : backend}>
      <UsersScreen />
    </Providers>,
  );
  mounted = renderer;
  await settle(10);
  return renderer;
};

const row = (renderer: ReactTestRenderer, title: string) =>
  renderer.root.find(
    (node) =>
      (node.type as string) === 'Pressable' &&
      String(node.props.accessibilityLabel).startsWith(`${title},`),
  );

const input = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.find(
    (node) =>
      (node.type as string) === 'TextInput' &&
      node.props.accessibilityLabel === label,
  );

const acceptAlert = () =>
  vi.mocked(Alert.alert).mockImplementationOnce((_t, _m, buttons) => {
    buttons?.at(-1)?.onPress?.();
  });

describe('Users', () => {
  it('lists people with their access and status, and the levels with counts', async () => {
    const renderer = await show([
      me,
      sam,
      makeUser('ana', { name: 'Ana', status: 'invited' }),
    ]);
    const text = allText(renderer);
    expect(text).toContain('Chris Gagne (you)');
    expect(text).toContain('Public CMS · Active');
    expect(text).toContain('Notebook only · Invited');
    expect(text).toContain('1 user · Admin, Notebook, Users');
  });

  it('is closed to accounts without user-admin', async () => {
    const renderer = await show([me], undefined, ['site-admin']);
    expect(allText(renderer)).toContain('Only Full Admins can manage users.');
    expect(server.state.calls).toEqual([]);
  });

  it('invites a user', async () => {
    const renderer = await show();
    act(() => byLabel(renderer, 'Invite user').props.onPress());
    act(() => input(renderer, 'Name').props.onChangeText('Lee'));
    act(() => input(renderer, 'Email').props.onChangeText(' lee@example.com '));
    act(() => byLabel(renderer, 'Public CMS').props.onPress());
    await act(async () => byLabel(renderer, 'Send invite').props.onPress());
    await settle(5);
    expect([...server.state.users.values()].at(-1)).toMatchObject({
      email: 'lee@example.com',
      name: 'Lee',
      level: 'cms',
      status: 'invited',
    });
    expect(allText(renderer)).toContain('Invite sent to lee@example.com.');
  });

  it('changes access and says what they gain and lose', async () => {
    const renderer = await show();
    act(() => row(renderer, 'Sam Rivera').props.onPress());
    act(() => byLabel(renderer, 'Notebook only').props.onPress());
    expect(allText(renderer)).toContain('Sam gains Notebook. Sam loses Admin.');
    await act(async () => byLabel(renderer, 'Save access').props.onPress());
    await settle(5);
    expect(server.state.users.get('sam')!.level).toBe('notebook');
    expect(allText(renderer)).toContain(
      'Sam Rivera now has Notebook only access.',
    );
  });

  it('asks for the passkey when the sign-in is too old, then finishes', async () => {
    const backend = signedInBackend();
    backend.reauthenticate = vi.fn(async () => {
      server.state.needsSignIn = false;
      return true;
    });
    const renderer = await show([me, sam], backend);
    server.state.needsSignIn = true;
    act(() => row(renderer, 'Sam Rivera').props.onPress());
    acceptAlert();
    await act(async () => byLabel(renderer, 'Disable sign-in').props.onPress());
    await settle(5);
    expect(backend.reauthenticate).toHaveBeenCalledTimes(1);
    expect(server.state.users.get('sam')!.status).toBe('disabled');
    expect(allText(renderer)).toContain('Sam Rivera can no longer sign in.');
  });

  it('changes nothing when the passkey prompt is closed', async () => {
    const backend = signedInBackend();
    backend.reauthenticate = vi.fn(async () => false);
    const renderer = await show([me, sam], backend);
    server.state.needsSignIn = true;
    act(() => row(renderer, 'Sam Rivera').props.onPress());
    acceptAlert();
    await act(async () => byLabel(renderer, 'Remove access').props.onPress());
    await settle(5);
    expect(server.state.users.get('sam')!.status).toBe('active');
    expect(allText(renderer)).not.toContain('no longer has access');
  });

  it('restores a removed user and keeps your own access fixed', async () => {
    const renderer = await show([
      me,
      makeUser('sam', { name: 'Sam Rivera', level: 'cms', status: 'removed' }),
    ]);
    act(() => row(renderer, 'Sam Rivera').props.onPress());
    await act(async () => byLabel(renderer, 'Restore access').props.onPress());
    await settle(5);
    expect(server.state.users.get('sam')).toMatchObject({
      status: 'active',
      level: 'cms',
    });

    act(() => byLabel(renderer, 'Done').props.onPress());
    act(() => row(renderer, 'Chris Gagne (you)').props.onPress());
    expect(byLabel(renderer, 'Public CMS').props.accessibilityState).toEqual({
      checked: false,
      disabled: true,
    });
    expect(() => byLabel(renderer, 'Remove access')).toThrow();
  });
});
