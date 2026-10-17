import {
  formatAdded,
  LEVEL_APPS,
  LEVEL_DESCRIPTIONS,
  LEVEL_ORDER,
  statusLabel,
  userErrorMessage,
  useUsersQuery,
} from '@gagnechris/app-core';
import {
  ACCESS_LEVEL_LABELS,
  displayName,
  type ManagedUser,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, Text } from 'react-native';
import { ContentRow } from '../../../src/admin/ContentRow';
import { EditUserSheet } from '../../../src/admin/users/EditUserSheet';
import { InviteUserSheet } from '../../../src/admin/users/InviteUserSheet';
import { useSession } from '../../../src/session';
import { canManageUsers } from '../../../src/space';
import { color, font } from '../../../src/theme';
import { Icon } from '../../../src/ui/Icon';
import { IconButton } from '../../../src/ui/IconButton';
import { Screen } from '../../../src/ui/Screen';
import { Section } from '../../../src/ui/Section';

const levelLabel = (user: ManagedUser) =>
  user.level ? ACCESS_LEVEL_LABELS[user.level] : 'No access';

const UsersScreen = () => {
  const { user: me } = useSession();
  const allowed = canManageUsers(me?.groups ?? []);
  const users = useUsersQuery(allowed);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  if (!allowed) {
    return (
      <Screen>
        <Text style={styles.status}>
          Only Full Admins can manage users. Ask a Full Admin if you need this
          page.
        </Text>
      </Screen>
    );
  }

  const list = users.data ?? [];
  const editing = list.find((u) => u.id === editingId) ?? null;
  const count = (level: (typeof LEVEL_ORDER)[number]) =>
    list.filter((u) => u.level === level && u.status !== 'removed').length;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await users.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
      }
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              size="lg"
              label="Invite user"
              onPress={() => {
                setNotice(null);
                setInviting(true);
              }}
            >
              <Icon name="person.badge.plus" size={22} color={color.accent} />
            </IconButton>
          ),
        }}
      />
      {notice ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      {users.error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {userErrorMessage(users.error, 'Could not load users.')}
        </Text>
      ) : null}
      {users.isPending && !users.error ? (
        <Text style={styles.status}>Loading…</Text>
      ) : null}

      {users.data ? (
        <Section title="People">
          {list.map((user, index) => {
            const you = user.id === me?.sub;
            return (
              <ContentRow
                key={user.id}
                title={`${displayName(user)}${you ? ' (you)' : ''}`}
                meta={`${levelLabel(user)} · ${statusLabel(user)} · Added ${formatAdded(user.createdAt)}`}
                tags={[user.email]}
                divider={index > 0}
                onPress={() => {
                  setNotice(null);
                  setEditingId(user.id);
                }}
              />
            );
          })}
        </Section>
      ) : null}

      <Section title="Access levels">
        {LEVEL_ORDER.map((level, index) => (
          <ContentRow
            key={level}
            title={ACCESS_LEVEL_LABELS[level]}
            meta={`${count(level)} ${count(level) === 1 ? 'user' : 'users'} · ${LEVEL_APPS[level].join(', ')}`}
            tags={[LEVEL_DESCRIPTIONS[level]]}
            divider={index > 0}
          />
        ))}
      </Section>
      <Text style={styles.hint}>
        Each person’s Notebook is private to them; giving or removing access
        never shows you their notes.
      </Text>

      {editing ? (
        <EditUserSheet
          key={editing.id}
          user={editing}
          isSelf={editing.id === me?.sub}
          onClose={() => setEditingId(null)}
          onDone={setNotice}
        />
      ) : null}
      <InviteUserSheet
        visible={inviting}
        onClose={() => setInviting(false)}
        onDone={setNotice}
      />
    </Screen>
  );
};

export default UsersScreen;

const styles = StyleSheet.create({
  notice: {
    ...font.medium,
    fontSize: tokens.text.base,
    color: color.ink,
    paddingHorizontal: tokens.space[4],
  },
  error: {
    ...font.medium,
    fontSize: tokens.text.base,
    color: color.alert,
    paddingHorizontal: tokens.space[4],
  },
  status: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    textAlign: 'center',
    padding: tokens.space[6],
  },
  hint: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.muted,
    textAlign: 'center',
    paddingTop: tokens.space[2],
  },
});
