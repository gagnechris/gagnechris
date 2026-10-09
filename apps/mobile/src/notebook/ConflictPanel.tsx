import type { Note, Task } from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  resolveConflict,
  useConflict,
  type Conflict,
  type Resolution,
} from '../outbox';
import { color, font } from '../theme';
import { Button } from '../ui/Button';
import { confirmAction, showError } from '../ui/confirm';

/** Where the screen goes once the user has chosen. */
export type AfterConflict =
  { type: 'reload' } | { type: 'open'; id: string } | { type: 'close' };

const FIELD_LABELS: Record<string, string> = {
  title: 'title',
  bodyMarkdown: 'text',
  tags: 'tags',
  pinned: 'pin',
  area: 'area',
  description: 'notes',
  priority: 'priority',
  status: 'status',
  dueDate: 'deadline',
  startDate: 'day it shows on',
  someday: 'day it shows on',
  noteId: 'note',
};

const conflictFieldsLabel = (fields: readonly string[]) => [
  ...new Set(fields.map((field) => FIELD_LABELS[field] ?? field)),
];

type Choice = {
  label: string;
  resolution: Resolution;
  confirm?: () => Promise<boolean>;
};

const choicesFor = (conflict: Conflict): Choice[] => {
  const isNote = conflict.entity === 'note';
  switch (conflict.kind) {
    case 'changed':
      return [
        { label: 'Keep mine', resolution: 'mine' },
        { label: 'Keep theirs', resolution: 'theirs' },
        ...(isNote
          ? [{ label: 'Save mine as a new page', resolution: 'copy' as const }]
          : []),
      ];
    case 'deleted':
      return [
        {
          label: isNote ? 'Restore as a new page' : 'Restore as a new task',
          resolution: 'restore',
        },
        { label: 'Discard my changes', resolution: 'theirs' },
      ];
    case 'daily_taken':
      return [
        { label: 'Merge', resolution: 'merge' },
        {
          label: 'Use the saved note',
          resolution: 'saved',
          confirm: () =>
            confirmAction(
              'Use the saved note?',
              'What you typed on this phone will be lost.',
              'Use saved note',
            ),
        },
      ];
    case 'refused':
      return [{ label: 'Discard my changes', resolution: 'discard' }];
  }
};

const theirText = (conflict: Conflict) => {
  const server = conflict.server;
  if (!server) return null;
  if (conflict.entity === 'note') {
    const note = server as Note;
    return conflict.fields.includes('bodyMarkdown') ||
      conflict.kind === 'daily_taken'
      ? note.bodyMarkdown
      : conflict.fields.includes('title')
        ? note.title
        : null;
  }
  return conflict.fields.includes('title') ? (server as Task).title : null;
};

const messageFor = (conflict: Conflict) => {
  switch (conflict.kind) {
    case 'changed': {
      const fields = conflictFieldsLabel(conflict.fields);
      return `Changed on another device${fields.length ? ` (${fields.join(', ')})` : ''}. Your version is still here.`;
    }
    case 'deleted':
      return 'Deleted on another device. Your copy is still here.';
    case 'daily_taken':
      return 'Another device started this daily note first. What you typed is still here.';
    case 'refused':
      return `This change couldn't be saved${conflict.message ? `: ${conflict.message}` : '.'}`;
  }
};

const afterFor = (
  conflict: Conflict,
  resolution: Resolution,
  newId: string | undefined,
): AfterConflict => {
  if (newId) return { type: 'open', id: newId };
  if (conflict.kind === 'daily_taken' && conflict.server)
    return { type: 'open', id: conflict.server.id };
  if (conflict.kind === 'deleted' && resolution === 'theirs')
    return { type: 'close' };
  return { type: 'reload' };
};

/**
 * Shown above an editor whose edits the server refused: what happened and
 * the choices that settle it. Nothing is dropped until one is picked.
 */
export const ConflictPanel = ({
  entityId,
  onResolved,
}: {
  entityId: string;
  onResolved: (after: AfterConflict) => void;
}) => {
  const conflict = useConflict(entityId);
  const [busy, setBusy] = useState(false);
  if (!conflict) return null;
  const theirs = theirText(conflict);

  const choose = async (choice: Choice) => {
    if (choice.confirm && !(await choice.confirm())) return;
    setBusy(true);
    try {
      const newId = await resolveConflict(entityId, choice.resolution);
      onResolved(afterFor(conflict, choice.resolution, newId));
    } catch (error) {
      showError(
        "Couldn't resolve",
        error instanceof Error ? error.message : 'Try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.panel} accessibilityRole="alert" testID="conflict">
      <Text style={styles.message}>{messageFor(conflict)}</Text>
      {theirs ? (
        <View style={styles.theirs}>
          <Text style={styles.label}>Theirs</Text>
          <Text style={styles.theirsText} numberOfLines={8}>
            {theirs}
          </Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        {choicesFor(conflict).map((choice, index) => (
          <Button
            key={choice.resolution}
            title={choice.label}
            variant={index === 0 ? 'primary' : 'secondary'}
            disabled={busy}
            onPress={() => void choose(choice)}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    gap: tokens.space[2],
    padding: tokens.space[3],
    borderRadius: tokens.radius.lg - 4,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  message: { ...font.medium, fontSize: tokens.text.base, color: color.ink },
  theirs: {
    gap: tokens.space[1],
    padding: tokens.space[2],
    borderRadius: tokens.radius.md,
    backgroundColor: color.fill,
  },
  label: {
    ...font.semibold,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
  theirsText: { ...font.regular, fontSize: tokens.text.base, color: color.ink },
  actions: { gap: tokens.space[2] },
});
