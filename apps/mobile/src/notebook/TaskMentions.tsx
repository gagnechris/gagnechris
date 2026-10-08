import { useLoadAllPages, useNotesQuery } from '@gagnechris/app-core';
import {
  noteDay,
  noteDayLabel,
  noteTitle,
  taskMentions,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { color, font } from '../theme';
import { Section } from '../ui/Section';

/** Every note that embeds the task, home note first, as on web. */
export const TaskMentions = ({
  taskId,
  homeNoteId,
  today,
  onOpenNote,
}: {
  taskId: string;
  homeNoteId: string | null;
  today: string;
  onOpenNote: (id: string) => void;
}) => {
  // Every area: a note can embed a task from the other one.
  const notes = useNotesQuery({ limit: 100 });
  useLoadAllPages(notes);
  const mentions = useMemo(
    () =>
      taskMentions(
        notes.data?.pages.flatMap((p) => p.items) ?? [],
        taskId,
        homeNoteId,
      ),
    [notes.data, taskId, homeNoteId],
  );

  return (
    <Section title="Mentioned in">
      {notes.isError ? (
        <Text style={[styles.status, styles.error]} accessibilityRole="alert">
          Could not load notes.
        </Text>
      ) : notes.isPending || notes.hasNextPage ? (
        <Text style={styles.status}>Loading notes…</Text>
      ) : mentions.length === 0 ? (
        <Text style={styles.status}>No note embeds this task yet.</Text>
      ) : (
        mentions.map(({ note, context, home }, index) => {
          const title = `${noteTitle(note)}${home ? ' (created here)' : ''}`;
          const when =
            note.type === 'page' ? noteDayLabel(noteDay(note), today) : '';
          return (
            <Pressable
              key={note.id}
              accessibilityRole="button"
              accessibilityLabel={[title, when, context]
                .filter(Boolean)
                .join(', ')}
              accessibilityHint="Opens the note"
              onPress={() => onOpenNote(note.id)}
              style={[styles.row, index > 0 && styles.divider]}
            >
              <Text style={styles.title}>
                {title}
                {when ? <Text style={styles.when}>{`  ${when}`}</Text> : null}
              </Text>
              {context ? (
                <Text style={styles.context} numberOfLines={3}>
                  {context}
                </Text>
              ) : null}
            </Pressable>
          );
        })
      )}
    </Section>
  );
};

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
    gap: tokens.space[1],
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  title: { ...font.semibold, fontSize: tokens.text.body, color: color.ink },
  when: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
  context: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
  },
  status: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    padding: tokens.space[4],
  },
  error: { color: color.alert },
});
