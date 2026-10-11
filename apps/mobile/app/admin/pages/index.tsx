import { homeResource, resumeResource } from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, Text } from 'react-native';
import { publishStatusLabel } from '../../../src/admin/labels';
import { ListRow } from '../../../src/admin/ListRow';
import { color, font } from '../../../src/theme';
import { Screen } from '../../../src/ui/Screen';
import { Section } from '../../../src/ui/Section';

const statusMeta = (query: {
  data?: Parameters<typeof publishStatusLabel>[0];
  isError: boolean;
}): string =>
  query.data
    ? publishStatusLabel(query.data)
    : query.isError
      ? 'Could not load'
      : 'Loading…';

const PagesScreen = () => {
  const router = useRouter();
  const home = homeResource.useQuery({});
  const resume = resumeResource.useQuery({});
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([home.refetch(), resume.refetch()]);
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
      <Section>
        <ListRow
          title="Home page"
          meta={statusMeta(home)}
          tags={['Name, title and About me']}
          onPress={() => router.push('/admin/pages/home')}
        />
        <ListRow
          title="Resume"
          meta={statusMeta(resume)}
          tags={['Experience, skills and education']}
          divider
          onPress={() => router.push('/admin/pages/resume')}
        />
      </Section>
      <Text style={styles.hint}>
        Publishing updates gagnechris.com. Until then the live page keeps the
        last published version.
      </Text>
    </Screen>
  );
};

export default PagesScreen;

const styles = StyleSheet.create({
  hint: {
    ...font.regular,
    fontSize: tokens.text.caption,
    color: color.muted,
    textAlign: 'center',
    paddingTop: tokens.space[4],
  },
});
