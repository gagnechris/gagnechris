import {
  useCreateNoteMutation,
  useNotebookSearchQuery,
  useNotesQuery,
  type Note,
} from '@gagnechris/app-core';
import {
  areaForNewItem,
  areaQueryParam,
  NOTEBOOK_AREA_LABELS,
  noteDay,
  noteDayLabel,
  noteFirstLine,
  noteOpenTaskCount,
  noteSections,
  noteTitle,
  type NotebookSearchHit,
} from '@gagnechris/shared';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text } from 'react-native';
import { useArea } from '../../../src/area';
import { useNoteRowActions } from '../../../src/notebook/noteActions';
import { useLoadAllPages } from '../../../src/notebook/useLoadAllPages';
import { useLocalToday } from '../../../src/notebook/useLocalToday';
import { useOpenTaskIds } from '../../../src/notebook/useOpenTaskIds';
import { createUlid } from '../../../src/ulid';
import { color, font, MIN_TARGET } from '../../../src/theme';
import { showError } from '../../../src/ui/confirm';
import { EmptyState } from '../../../src/ui/EmptyState';
import { Icon } from '../../../src/ui/Icon';
import { NoteRow } from '../../../src/ui/NoteRow';
import { Row } from '../../../src/ui/Row';
import { Screen } from '../../../src/ui/Screen';
import { SearchField } from '../../../src/ui/SearchField';
import { Section } from '../../../src/ui/Section';
import { SegmentedControl } from '../../../src/ui/SegmentedControl';

const NOTE_KINDS = ['all', 'daily', 'pages'] as const;
type NoteKind = (typeof NOTE_KINDS)[number];
const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  all: 'All',
  daily: 'Daily',
  pages: 'Pages',
};

const hitMatchesKind = (hit: NotebookSearchHit, kind: NoteKind) =>
  kind === 'all' || (kind === 'daily') === Boolean(hit.date);

const NotesScreen = () => {
  const router = useRouter();
  const { area } = useArea();
  const today = useLocalToday();
  const [kind, setKind] = useState<NoteKind>('all');
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const searching = q.trim().length > 0;

  const notes = useNotesQuery({
    area: areaQueryParam(area),
    type: kind === 'all' ? undefined : kind === 'daily' ? 'daily' : 'page',
    limit: 100,
  });
  useLoadAllPages(notes);
  const openIds = useOpenTaskIds();
  const search = useNotebookSearchQuery(
    { q, area: areaQueryParam(area), limit: 50 },
    searching,
  );
  const create = useCreateNoteMutation();
  const { actionsFor, showActions } = useNoteRowActions();

  const sections = useMemo(
    () => noteSections(notes.data?.pages.flatMap((p) => p.items) ?? [], today),
    [notes.data, today],
  );
  const hits = (search.data?.notes ?? []).filter((hit) =>
    hitMatchesKind(hit, kind),
  );

  const open = (id: string) => router.push(`/notes/${id}`);

  const newPage = async () => {
    try {
      const note = await create.mutateAsync({
        id: createUlid(),
        area: areaForNewItem(area),
        type: 'page',
        title: 'Untitled',
        bodyMarkdown: '',
        tags: [],
        pinned: false,
      });
      open(note.id);
    } catch {
      showError(
        'Could not create a page',
        'Check your connection and try again.',
      );
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await notes.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const meta = (note: Note) =>
    [
      noteDayLabel(noteDay(note), today),
      area === 'all' ? NOTEBOOK_AREA_LABELS[note.area] : '',
      ((n) => (n > 0 ? `${n} open` : ''))(
        noteOpenTaskCount(note.bodyMarkdown, openIds),
      ),
    ]
      .filter(Boolean)
      .join(' · ');

  const loading = notes.isPending || notes.hasNextPage;

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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New page"
              accessibilityState={{ disabled: create.isPending }}
              disabled={create.isPending}
              onPress={() => void newPage()}
              style={styles.compose}
            >
              <Icon name="square.and.pencil" size={22} color={color.accent} />
            </Pressable>
          ),
        }}
      />
      <SearchField placeholder="Search notes" value={q} onChangeText={setQ} />
      <SegmentedControl
        label="Note type"
        options={NOTE_KINDS}
        labels={NOTE_KIND_LABELS}
        value={kind}
        onChange={setKind}
      />
      {searching ? (
        search.isError ? (
          <Text style={styles.status} accessibilityRole="alert">
            Search failed. Check your connection.
          </Text>
        ) : search.isPending ? (
          <Text style={styles.status}>Searching…</Text>
        ) : hits.length === 0 ? (
          <Text style={styles.status}>No notes match.</Text>
        ) : (
          <Section title="Notes">
            {hits.map((hit, index) => (
              <Row
                key={hit.id}
                title={hit.title}
                detail={hit.snippet}
                divider={index > 0}
                onPress={() => open(hit.id)}
              />
            ))}
          </Section>
        )
      ) : notes.isError && sections.length === 0 ? (
        <Text style={styles.status} accessibilityRole="alert">
          Could not load notes. Pull to try again.
        </Text>
      ) : sections.length === 0 ? (
        loading ? (
          <Text style={styles.status}>Loading notes…</Text>
        ) : (
          <EmptyState
            icon="doc.text"
            title="No notes yet"
            body="Daily notes and pages you write show here, pinned ones first."
          />
        )
      ) : (
        sections.map((section) => (
          <Section key={section.key} title={section.label}>
            {section.notes.map((note, index) => {
              const actions = actionsFor(note);
              return (
                <NoteRow
                  key={note.id}
                  title={noteTitle(note)}
                  excerpt={noteFirstLine(note.bodyMarkdown)}
                  meta={meta(note)}
                  divider={index > 0}
                  onPress={() => open(note.id)}
                  actions={actions}
                  onShowActions={() => showActions(noteTitle(note), actions)}
                />
              );
            })}
          </Section>
        ))
      )}
    </Screen>
  );
};

export default NotesScreen;

const styles = StyleSheet.create({
  compose: {
    minHeight: MIN_TARGET,
    minWidth: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    ...font.regular,
    fontSize: 15,
    color: color.inkSoft,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
