import type { SaveState } from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Fragment,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { EditorOfflineNotice, useIsOnline } from '../net';
import { color, font, MIN_TARGET } from '../theme';
import { Icon } from '../ui/Icon';
import { ConflictPanel } from './ConflictPanel';
import { saveLabel } from './saveLabel';
import { useSaveOnBackground } from './useSaveOnBackground';

/** The parts of app-core's `useVersionedDocEditor` result the chrome reads. */
export type DetailEditorState<TEntity> = {
  entity: TEntity | null;
  isLoading: boolean;
  loadError: string | null;
  saveError?: string | null;
  dirty: boolean;
  saveState: SaveState;
  save: () => unknown;
};

type DetailEditorOptions = {
  editor: DetailEditorState<unknown>;
  conflictId: string;
  onReload: () => void;
  /** Where a conflict's new copy opens; without it every choice reloads. */
  openPath?: (id: string) => string;
};

/** Save label, save on background and the routed conflict panel. */
export function useDetailEditor({
  editor,
  conflictId,
  onReload,
  openPath,
}: DetailEditorOptions) {
  const router = useRouter();
  const online = useIsOnline();
  useSaveOnBackground(editor.dirty, editor.save);
  const conflict = (
    <ConflictPanel
      entityId={conflictId}
      onResolved={(after) => {
        if (openPath && after.type === 'open')
          router.replace(openPath(after.id));
        else if (openPath && after.type === 'close') router.back();
        else onReload();
      }}
    />
  );
  return {
    saveLabel: saveLabel(editor.saveState, editor.dirty, !online),
    conflict,
  };
}

/** Remounts `children` when `resetKey` changes or a conflict is settled. */
export const RemountOnResolve = ({
  resetKey,
  children,
}: {
  resetKey: string;
  children: (onReload: () => void) => ReactNode;
}) => {
  const [epoch, setEpoch] = useState(0);
  return (
    <Fragment key={`${resetKey}:${epoch}`}>
      {children(() => setEpoch((n) => n + 1))}
    </Fragment>
  );
};

export type DetailScreenProps = { id: string; onReload: () => void };

/** The route for a detail screen: reads `id` and remounts on resolve. */
export const detailEditorRoute = (Screen: ComponentType<DetailScreenProps>) => {
  const Route = () => {
    const { id = '' } = useLocalSearchParams<{ id: string }>();
    return (
      <RemountOnResolve resetKey={id}>
        {(onReload) => <Screen id={id} onReload={onReload} />}
      </RemountOnResolve>
    );
  };
  return Route;
};

export const EditorError = ({ message }: { message: string }) => (
  <Text style={styles.error} accessibilityRole="alert">
    {message}
  </Text>
);

/** The conflict, the save error and the offline notice, above the editor. */
export const EditorNotices = ({
  conflict,
  saveError,
  dirty,
}: {
  conflict: ReactElement;
  saveError?: string | null;
  dirty: boolean;
}) => (
  <>
    {conflict}
    {saveError ? <EditorError message={saveError} /> : null}
    <EditorOfflineNotice dirty={dirty} />
  </>
);

type ShellProps<TEntity> = {
  editor: DetailEditorState<TEntity>;
  conflictId: string;
  onReload: () => void;
  openPath: (id: string) => string;
  loadingText: string;
  menuLabel: string;
  onMenu: () => void;
  /** Header buttons before ⋯. */
  headerActions?: (ready: boolean) => ReactNode;
  headerLargeTitleEnabled?: boolean;
  backgroundColor: string;
  contentStyle: StyleProp<ViewStyle>;
  /** Pinned under the scroll view. */
  footer?: ReactNode;
  children: (entity: TEntity) => ReactNode;
};

/** A note or task detail screen: header, conflict, load error and save state. */
export const DetailEditorShell = <TEntity,>({
  editor,
  conflictId,
  onReload,
  openPath,
  loadingText,
  menuLabel,
  onMenu,
  headerActions,
  headerLargeTitleEnabled,
  backgroundColor,
  contentStyle,
  footer,
  children,
}: ShellProps<TEntity>) => {
  const { saveLabel: label, conflict } = useDetailEditor({
    editor,
    conflictId,
    onReload,
    openPath,
  });

  if (editor.loadError) {
    // A note or task deleted elsewhere no longer loads; its conflict still shows.
    return (
      <View style={contentStyle}>
        {conflict}
        <Text style={styles.status} accessibilityRole="alert">
          {editor.loadError}
        </Text>
      </View>
    );
  }

  const entity = editor.isLoading ? null : editor.entity;
  const ready = Boolean(entity);
  const scroll = (
    <ScrollView
      style={[styles.scroll, !footer && { backgroundColor }]}
      contentContainerStyle={contentStyle}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: '',
          ...(headerLargeTitleEnabled === undefined
            ? {}
            : { headerLargeTitleEnabled }),
          headerRight: () => (
            <View style={styles.headerRight}>
              <Text
                style={styles.saveState}
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
              >
                {label}
              </Text>
              {headerActions?.(ready)}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={menuLabel}
                onPress={onMenu}
                style={detailStyles.headerButton}
                disabled={!ready}
              >
                <Icon name="ellipsis.circle" color={color.ink} />
              </Pressable>
            </View>
          ),
        }}
      />
      <EditorNotices
        conflict={conflict}
        saveError={editor.saveError}
        dirty={editor.dirty}
      />
      {entity ? (
        children(entity)
      ) : (
        <Text style={styles.status}>{loadingText}</Text>
      )}
    </ScrollView>
  );
  if (!footer) return scroll;
  return (
    <View style={[styles.screen, { backgroundColor }]}>
      {scroll}
      {footer}
    </View>
  );
};

export const detailStyles = StyleSheet.create({
  headerButton: {
    minWidth: MIN_TARGET,
    minHeight: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[1],
  },
  saveState: {
    ...font.medium,
    fontSize: tokens.text.caption,
    color: color.inkSoft,
  },
  error: { ...font.medium, fontSize: tokens.text.base, color: color.alert },
  status: {
    ...font.regular,
    fontSize: tokens.text.base,
    color: color.inkSoft,
    textAlign: 'center',
    padding: tokens.space[6],
  },
});
