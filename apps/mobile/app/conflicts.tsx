import type { Note, Task } from '@gagnechris/app-core';
import { noteTitle } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConflictPanel } from '../src/notebook/ConflictPanel';
import { useOutboxConflicts, type Conflict } from '../src/outbox';
import { findCached } from '../src/sync';
import { color, font, MIN_TARGET } from '../src/theme';

const titleOf = (conflict: Conflict, local: Note | Task | undefined) => {
  const entity = local ?? conflict.server;
  if (!entity) return conflict.entity === 'note' ? 'A note' : 'A task';
  return conflict.entity === 'note'
    ? noteTitle(entity as Note) || 'Untitled'
    : (entity as Task).title;
};

/** Every edit the server refused, each with its choices. */
const ConflictsScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const conflicts = useOutboxConflicts();
  const queryClient = useQueryClient();
  const path = (conflict: Conflict, id = conflict.entityId) =>
    `/${conflict.entity === 'note' ? 'notes' : 'tasks'}/${id}`;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + tokens.space[2] }]}>
      <View style={styles.bar}>
        <Text style={styles.heading} accessibilityRole="header">
          Edits that couldn't sync
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={() => router.back()}
          style={styles.done}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {conflicts.length === 0 ? (
          <Text style={styles.empty}>Everything is synced.</Text>
        ) : null}
        {conflicts.map((conflict) => (
          <View key={conflict.entityId} style={styles.item}>
            <Text style={styles.title} numberOfLines={2}>
              {titleOf(
                conflict,
                findCached(queryClient, conflict.entity, conflict.entityId),
              )}
            </Text>
            <ConflictPanel
              entityId={conflict.entityId}
              onResolved={(after) => {
                if (after.type !== 'open') return;
                router.back();
                router.push(path(conflict, after.id));
              }}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default ConflictsScreen;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[2],
  },
  heading: { ...font.semibold, fontSize: tokens.text.body, color: color.ink },
  done: { minHeight: MIN_TARGET, justifyContent: 'center' },
  doneText: {
    ...font.semibold,
    fontSize: tokens.text.body,
    color: color.accent,
  },
  list: { gap: tokens.space[4], padding: tokens.space[4] },
  item: { gap: tokens.space[2] },
  title: { ...font.semibold, fontSize: tokens.text.base, color: color.ink },
  empty: { ...font.regular, fontSize: tokens.text.base, color: color.inkSoft },
});
