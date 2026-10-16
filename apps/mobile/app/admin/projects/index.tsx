import {
  errorMessage,
  NEW_PROJECT_NAME,
  newPlaceholderSlug,
  useCreateProjectMutation,
  useCreateStarterProjectsMutation,
  useProjectsQuery,
} from '@gagnechris/app-core';
import { sortProjectsByOrder } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, Text } from 'react-native';
import { projectMeta } from '../../../src/admin/labels';
import { ContentRow } from '../../../src/admin/ContentRow';
import { color, font } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { showError } from '../../../src/ui/confirm';
import { EmptyState } from '../../../src/ui/EmptyState';
import { Icon } from '../../../src/ui/Icon';
import { IconButton } from '../../../src/ui/IconButton';
import { Screen } from '../../../src/ui/Screen';
import { Section } from '../../../src/ui/Section';

const ProjectsScreen = () => {
  const router = useRouter();
  const query = useProjectsQuery();
  const create = useCreateProjectMutation();
  const starters = useCreateStarterProjectsMutation();
  const [refreshing, setRefreshing] = useState(false);
  const projects = useMemo(
    () => (query.data ? sortProjectsByOrder(query.data) : []),
    [query.data],
  );

  const open = (id: string) => router.push(`/admin/projects/${id}`);

  const newProject = async () => {
    try {
      const project = await create.mutateAsync({
        name: NEW_PROJECT_NAME,
        slug: newPlaceholderSlug('untitled-project'),
        order: Math.max(0, ...projects.map((p) => p.order + 1)),
      });
      open(project.id);
    } catch {
      showError(
        'Could not create a project',
        'Check your connection and try again.',
      );
    }
  };

  const createStarters = async () => {
    try {
      await starters.mutateAsync();
    } catch (err) {
      showError(
        'Could not create starter projects',
        errorMessage(err, 'Check your connection and try again.'),
      );
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
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
              label="New project"
              disabled={create.isPending}
              onPress={() => void newProject()}
            >
              <Icon name="plus" size={22} color={color.accent} />
            </IconButton>
          ),
        }}
      />
      {query.isError && projects.length === 0 ? (
        <Text style={styles.status} accessibilityRole="alert">
          Could not load projects. Pull to try again.
        </Text>
      ) : query.isPending ? (
        <Text style={styles.status}>Loading projects…</Text>
      ) : projects.length === 0 ? (
        <>
          <EmptyState icon="square.grid.2x2" title="No projects yet">
            Start from drafts for Posts, Notebook and Don’t Feed the Bears, or
            create one from scratch. Nothing is public until you publish it.
          </EmptyState>
          <Button
            disabled={starters.isPending}
            onPress={() => void createStarters()}
          >
            {starters.isPending ? 'Creating…' : 'Create starter projects'}
          </Button>
        </>
      ) : (
        <Section>
          {projects.map((project, index) => (
            <ContentRow
              key={project.id}
              title={project.name}
              meta={projectMeta(project)}
              tags={project.stack}
              divider={index > 0}
              onPress={() => open(project.id)}
            />
          ))}
        </Section>
      )}
      <Text style={styles.hint}>
        What I’m building. Publishing updates /projects and the sitemap.
      </Text>
    </Screen>
  );
};

export default ProjectsScreen;

const styles = StyleSheet.create({
  status: {
    ...font.regular,
    fontSize: 15,
    color: color.inkSoft,
    textAlign: 'center',
    paddingVertical: 24,
  },
  hint: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.muted,
    textAlign: 'center',
    paddingTop: tokens.space[4],
  },
});
