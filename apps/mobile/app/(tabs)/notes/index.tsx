import {
  useCreateNoteMutation,
  useDebouncedNotebookSearch,
  useLoadAllPages,
  useNotesQuery,
  type Note,
} from '@gagnechris/app-core';
import {
  noteDay,
  noteDayLabel,
  noteFirstLine,
  noteOpenTaskCount,
  noteSections,
  notesInArchiveView,
  noteTitle,
  searchHitDetail,
  type NotebookSearchHit,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Stack, useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useArea } from '../../../src/area';
import { dailyNotePath } from '../../../src/notebook/detailRoutes';
import { useNoteRowActions } from '../../../src/notebook/noteActions';
import { useLocalToday } from '../../../src/notebook/useLocalToday';
import { useOpenTaskIds } from '../../../src/notebook/useOpenTaskIds';
import { createUlid } from '../../../src/ulid';
import { color, font } from '../../../src/theme';
import { showError } from '../../../src/ui/confirm';
import { EmptyState } from '../../../src/ui/EmptyState';
import { Icon } from '../../../src/ui/Icon';
import { IconButton } from '../../../src/ui/IconButton';
import { NoteRow, type RowAction } from '../../../src/ui/NoteRow';
import { ListRow } from '../../../src/ui/ListRow';
import { SearchInput } from '../../../src/ui/SearchInput';
import { CardRow, SectionTitle } from '../../../src/ui/Section';
import { SegmentedRadio, segmentOptions } from '../../../src/ui/SegmentedRadio';

const NOTE_KINDS = ['all', 'daily', 'pages', 'archived'] as const;
type NoteKind = (typeof NOTE_KINDS)[number];
const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  all: 'All',
  daily: 'Daily',
  pages: 'Pages',
  archived: 'Archived',
};

type Item =
  | { kind: 'note'; note: Note; meta: string }
  | { kind: 'hit'; hit: NotebookSearchHit };
type ListSection = { key: string; title: string; data: Item[] };

const hitMatchesKind = (hit: NotebookSearchHit, kind: NoteKind) =>
  kind === 'all' || (kind === 'daily') === Boolean(hit.date);

const itemKey = (item: Item) =>
  item.kind === 'note' ? item.note.id : `hit-${item.hit.id}`;

type OpenNote = (note: Pick<Note, 'id' | 'type' | 'date' | 'area'>) => void;

const NoteListRow = memo(function NoteListRow({
  note,
  meta,
  first,
  last,
  open,
  actionsFor,
  showActions,
}: {
  note: Note;
  meta: string;
  first: boolean;
  last: boolean;
  open: OpenNote;
  actionsFor: (note: Note) => RowAction[];
  showActions: (title: string, actions: RowAction[]) => void;
}) {
  const actions = useMemo(() => actionsFor(note), [actionsFor, note]);
  const title = noteTitle(note);
  return (
    <CardRow first={first} last={last}>
      <NoteRow
        title={title}
        excerpt={noteFirstLine(note.bodyMarkdown)}
        meta={meta}
        divider={!first}
        onPress={() => open(note)}
        actions={actions}
        onShowActions={() => showActions(title, actions)}
      />
    </CardRow>
  );
});

const NotesScreen = () => {
  const router = useRouter();
  const { area } = useArea();
  const today = useLocalToday();
  const [kind, setKind] = useState<NoteKind>('all');
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const searching = q.trim().length > 0;

  const notes = useNotesQuery({
    area,
    type: kind === 'all' ? undefined : kind === 'daily' ? 'daily' : 'page',
    limit: 100,
  });
  useLoadAllPages(notes);
  const openIds = useOpenTaskIds();
  const search = useDebouncedNotebookSearch(q, {
    area,
    limit: 50,
  });
  const create = useCreateNoteMutation();
  const { actionsFor, showActions } = useNoteRowActions();

  const noteList = useMemo(
    () =>
      noteSections(
        notesInArchiveView(
          notes.data?.pages.flatMap((p) => p.items) ?? [],
          kind === 'archived',
        ),
        today,
      ),
    [notes.data, today, kind],
  );
  const listSections = useMemo<ListSection[]>(
    () =>
      noteList.map((section) => ({
        key: section.key,
        title: section.label,
        data: section.notes.map((note) => ({
          kind: 'note' as const,
          note,
          meta: [
            noteDayLabel(noteDay(note), today),
            ((n) => (n > 0 ? `${n} open` : ''))(
              noteOpenTaskCount(note.bodyMarkdown, openIds),
            ),
          ]
            .filter(Boolean)
            .join(' · '),
        })),
      })),
    [noteList, today, openIds],
  );
  const hits = search.notes.filter((hit) => hitMatchesKind(hit, kind));
  const sections: ListSection[] = searching
    ? hits.length > 0
      ? [
          {
            key: 'hits',
            title: 'Notes',
            data: hits.map((hit) => ({ kind: 'hit' as const, hit })),
          },
        ]
      : []
    : listSections;

  const open = useCallback<OpenNote>(
    (note) => {
      if (note.type === 'daily' && note.date) {
        router.navigate(dailyNotePath(note.date, note.area));
      } else {
        router.push(`/notes/${note.id}`);
      }
    },
    [router],
  );

  const newPage = async () => {
    try {
      const note = await create.mutateAsync({
        id: createUlid(),
        area,
        type: 'page',
        title: 'Untitled',
        bodyMarkdown: '',
        tags: [],
        pinned: false,
      });
      open(note);
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

  const loading = notes.isPending || notes.hasNextPage;
  const empty = searching ? (
    search.isError ? (
      <Text style={styles.status} accessibilityRole="alert">
        Search failed. Check your connection.
      </Text>
    ) : search.pending ? (
      <Text style={styles.status}>Searching…</Text>
    ) : (
      <Text style={styles.status}>No notes match.</Text>
    )
  ) : notes.isError ? (
    <Text style={styles.status} accessibilityRole="alert">
      Could not load notes. Pull to try again.
    </Text>
  ) : loading ? (
    <Text style={styles.status}>Loading notes…</Text>
  ) : kind === 'archived' ? (
    <EmptyState icon="archivebox" title="No archived pages">
      Archive a page from its row’s actions to keep it out of your notes.
    </EmptyState>
  ) : (
    <EmptyState icon="doc.text" title="No notes yet">
      Daily notes and pages you write show here, pinned ones first.
    </EmptyState>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              size="lg"
              label="New page"
              disabled={create.isPending}
              onPress={() => void newPage()}
            >
              <Icon name="square.and.pencil" size={22} color={color.accent} />
            </IconButton>
          ),
        }}
      />
      <SectionList<Item, ListSection>
        sections={sections}
        keyExtractor={itemKey}
        initialNumToRender={20}
        windowSize={7}
        stickySectionHeadersEnabled={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchInput
              placeholder="Search notes"
              value={q}
              onValueChange={setQ}
            />
            <SegmentedRadio
              label="Note type"
              options={segmentOptions(NOTE_KINDS, NOTE_KIND_LABELS)}
              value={kind}
              onChange={setKind}
            />
          </View>
        }
        ListEmptyComponent={empty}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <SectionTitle title={section.title} />
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          if (item.kind === 'note') {
            return (
              <NoteListRow
                note={item.note}
                meta={item.meta}
                first={first}
                last={last}
                open={open}
                actionsFor={actionsFor}
                showActions={showActions}
              />
            );
          }
          const { hit } = item;
          return (
            <CardRow first={first} last={last}>
              <ListRow
                title={hit.title}
                meta={searchHitDetail(hit)}
                divider={!first}
                onPress={() =>
                  open({
                    id: hit.id,
                    type: hit.date ? 'daily' : 'page',
                    date: hit.date ?? null,
                    area: hit.area,
                  })
                }
              />
            </CardRow>
          );
        }}
      />
    </>
  );
};

export default NotesScreen;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.background },
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[8],
  },
  header: { gap: tokens.space[4] },
  sectionHeader: {
    paddingTop: tokens.space[4],
    paddingBottom: tokens.space[2],
  },
  status: {
    ...font.regular,
    fontSize: 15,
    color: color.inkSoft,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
