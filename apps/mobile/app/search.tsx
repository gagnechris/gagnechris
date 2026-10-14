import {
  useDebouncedNotebookSearch,
  useTaskToggle,
  type LiveTaskHit,
} from '@gagnechris/app-core';
import {
  areaQueryParam,
  highlightParts,
  NOTEBOOK_AREA_LABELS,
  searchHitDetail,
  wordMatches,
  type NotebookSearchHit,
  type TextRange,
} from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArea } from '../src/area';
import { dailyNotePath } from '../src/notebook/detailRoutes';
import {
  readRecentSearches,
  withRecentSearch,
  writeRecentSearches,
} from '../src/notebook/recentSearches';
import { color, font, MIN_TARGET } from '../src/theme';
import { Excerpt } from '../src/ui/Excerpt';
import { Icon } from '../src/ui/Icon';
import { Section } from '../src/ui/Section';
import { SegmentedControl } from '../src/ui/SegmentedControl';

const SCOPES = ['area', 'all'] as const;
type Scope = (typeof SCOPES)[number];
const SCOPE_LABELS: Record<Scope, string> = {
  area: 'This area',
  all: 'All areas',
};

const Highlighted = ({
  text,
  ranges,
  style,
  lines,
}: {
  text: string;
  ranges: readonly TextRange[];
  style: object;
  lines?: number;
}) => {
  const parts = highlightParts(text, ranges).map((part, i) =>
    part.match ? (
      <Text key={i} style={styles.match}>
        {part.text}
      </Text>
    ) : (
      part.text
    ),
  );
  return lines ? (
    <Excerpt style={style} lines={lines}>
      {parts}
    </Excerpt>
  ) : (
    <Text style={style}>{parts}</Text>
  );
};

const SearchScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { area, store } = useArea();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('area');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void readRecentSearches(store).then((stored) => {
      if (!cancelled) setRecent(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const searchArea = scope === 'area' ? areaQueryParam(area) : undefined;
  const search = useDebouncedNotebookSearch(q, {
    area: searchArea,
    limit: 50,
  });
  const { query, notes, tasks } = search;
  const { toggle, error: toggleError } = useTaskToggle();

  const remember = (text: string) => {
    const next = withRecentSearch(recent, text);
    setRecent(next);
    void writeRecentSearches(store, next);
  };
  const clearRecent = () => {
    setRecent([]);
    void writeRecentSearches(store, []);
  };
  const open = (hit: NotebookSearchHit) => {
    remember(q);
    router.back();
    if (hit.type === 'note' && hit.date) {
      router.navigate(dailyNotePath(hit.date, hit.area));
      return;
    }
    router.push(hit.type === 'task' ? `/tasks/${hit.id}` : `/notes/${hit.id}`, {
      withAnchor: true,
    });
  };

  const searching = q.trim().length > 0;
  const showArea = searchArea === undefined;

  const hitRow = (
    hit: NotebookSearchHit,
    index: number,
    task?: LiveTaskHit['live'],
  ) => {
    const check = task ? task.status === 'done' : undefined;
    const tags = showArea ? ` · ${NOTEBOOK_AREA_LABELS[hit.area]}` : '';
    const detail = searchHitDetail(hit);
    return (
      <View key={hit.id} style={[styles.hit, index > 0 && styles.divider]}>
        {check !== undefined ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: check }}
            accessibilityLabel={
              check ? `Reopen ${hit.title}` : `Complete ${hit.title}`
            }
            onPress={() => void toggle(task!)}
            style={styles.box}
          >
            <Icon
              name={check ? 'checkmark.square.fill' : 'square'}
              size={22}
              color={check ? color.accent : color.inkSoft}
            />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${hit.title}${tags}${detail ? `, ${detail}` : ''}`}
          accessibilityHint={
            hit.type === 'task' ? 'Opens the task' : 'Opens the note'
          }
          onPress={() => open(hit)}
          style={styles.hitText}
        >
          <Text style={styles.hitTitle}>
            <Highlighted
              text={hit.title}
              ranges={wordMatches(hit.title, query)}
              style={styles.hitTitle}
            />
            {tags ? <Text style={styles.hitArea}>{tags}</Text> : null}
          </Text>
          {detail ? (
            <Highlighted
              text={detail}
              ranges={hit.matches}
              style={styles.snippet}
              lines={3}
            />
          ) : null}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + tokens.space[2] }]}>
      <View style={styles.bar}>
        <View style={styles.field}>
          <Icon name="magnifyingglass" size={17} color={color.muted} />
          <TextInput
            style={styles.input}
            accessibilityLabel="Search notes and tasks"
            placeholder="Search notes and tasks"
            placeholderTextColor={color.muted}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => remember(q)}
            returnKeyType="search"
            autoCorrect={false}
            autoFocus
            clearButtonMode="while-editing"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={() => router.back()}
          style={styles.cancel}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {area !== 'all' ? (
          <SegmentedControl
            label="Search scope"
            options={SCOPES}
            labels={SCOPE_LABELS}
            value={scope}
            onChange={setScope}
          />
        ) : null}
        {toggleError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {toggleError}
          </Text>
        ) : null}
        {!searching ? (
          recent.length > 0 ? (
            <Section title="Recent">
              {recent.map((r, index) => (
                <Pressable
                  key={r}
                  accessibilityRole="button"
                  accessibilityLabel={`Search for ${r}`}
                  onPress={() => setQ(r)}
                  style={[styles.recent, index > 0 && styles.divider]}
                >
                  <Icon name="clock" size={15} color={color.muted} />
                  <Text style={styles.recentText}>{r}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear recent searches"
                onPress={clearRecent}
                style={[styles.recent, styles.divider]}
              >
                <Text style={styles.clear}>Clear recent searches</Text>
              </Pressable>
            </Section>
          ) : (
            <Text style={styles.status}>
              Search titles and text in your notes and tasks.
            </Text>
          )
        ) : search.isError ? (
          <Text style={styles.error} accessibilityRole="alert">
            Search failed. Check your connection.
          </Text>
        ) : search.pending && notes.length + tasks.length === 0 ? (
          <Text style={styles.status}>Searching…</Text>
        ) : notes.length + tasks.length === 0 ? (
          <Text style={styles.status}>No notes or tasks match.</Text>
        ) : (
          <>
            {notes.length > 0 ? (
              <Section title="Notes">
                {notes.map((hit, i) => hitRow(hit, i))}
              </Section>
            ) : null}
            {tasks.length > 0 ? (
              <Section title="Tasks">
                {tasks.map(({ hit, live }, i) => hitRow(hit, i, live))}
              </Section>
            ) : null}
          </>
        )}
        {searching && search.truncated && !search.pending ? (
          <Text style={styles.status}>
            Only your most recent notes and tasks were searched.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
};

export default SearchScreen;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[2],
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    minHeight: MIN_TARGET,
    paddingHorizontal: tokens.space[3],
    borderRadius: tokens.radius.md + 2,
    backgroundColor: color.fill,
  },
  input: {
    flex: 1,
    minHeight: MIN_TARGET,
    ...font.regular,
    fontSize: tokens.text.body,
    color: color.ink,
  },
  cancel: { minHeight: MIN_TARGET, justifyContent: 'center' },
  cancelText: {
    ...font.regular,
    fontSize: tokens.text.body,
    color: color.accent,
  },
  content: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[8],
    gap: tokens.space[4],
  },
  hit: { flexDirection: 'row', alignItems: 'flex-start' },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  box: {
    width: MIN_TARGET,
    height: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hitText: {
    flex: 1,
    minHeight: MIN_TARGET,
    gap: 2,
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
  },
  hitTitle: { ...font.semibold, fontSize: tokens.text.body, color: color.ink },
  hitArea: { ...font.regular, color: color.inkSoft },
  snippet: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
  },
  match: {
    ...font.semibold,
    color: color.ink,
    backgroundColor: color.accentSoft,
  },
  recent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[2],
    minHeight: MIN_TARGET,
    paddingHorizontal: tokens.space[4],
  },
  recentText: { ...font.regular, fontSize: tokens.text.body, color: color.ink },
  clear: { ...font.medium, fontSize: tokens.text.base, color: color.accent },
  error: { ...font.medium, fontSize: tokens.text.base, color: color.alert },
  status: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    textAlign: 'center',
    padding: tokens.space[6],
  },
});
