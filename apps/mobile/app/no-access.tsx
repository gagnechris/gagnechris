import { ACCESS_LEVEL_LABELS, accessLevelFromGroups } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../src/session';
import { SPACE_HOME } from '../src/space';
import { color, font } from '../src/theme';
import { Button } from '../src/ui/Button';
import { Icon } from '../src/ui/Icon';

const NoAccessScreen = () => {
  const { user, spaces, signOut, signIn } = useSession();
  const router = useRouter();
  const { space } = useLocalSearchParams<{ space?: string }>();
  // An admin link opened by an account with only the Notebook.
  const adminLink = space === 'admin' && spaces.includes('notebook');
  const level = user ? accessLevelFromGroups(user.groups) : null;
  const switchAccount = async () => {
    await signOut();
    await signIn({ newAccount: true }).catch(() => {
      // Closed or failed: sign-in shows next.
    });
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.lock}>
        <Icon name="lock" size={26} color={color.inkSoft} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {adminLink
          ? 'You don’t have Admin access'
          : 'You don’t have access to this app'}
      </Text>
      <Text style={styles.body}>
        You’re signed in as <Text style={styles.strong}>{user?.email}</Text>
        {level ? (
          <>
            {' '}
            with <Text style={styles.strong}>
              {ACCESS_LEVEL_LABELS[level]}
            </Text>{' '}
            access
          </>
        ) : null}
        . Ask a Full Admin if you need{' '}
        {adminLink ? 'Admin' : 'Notebook or Admin'}.
      </Text>
      <View style={styles.actions}>
        {adminLink ? (
          <Button
            variant="primary"
            onPress={() => router.replace(SPACE_HOME.notebook)}
          >
            Open Notebook
          </Button>
        ) : null}
        <Button onPress={() => void switchAccount()}>
          Use a different account
        </Button>
        <Button onPress={() => void signOut()}>Sign out</Button>
      </View>
    </ScrollView>
  );
};

export default NoAccessScreen;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.background },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: tokens.space[4],
    padding: tokens.space[6],
  },
  lock: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...font.bold,
    fontSize: tokens.text['2xl'],
    lineHeight: 34,
    color: color.ink,
    textAlign: 'center',
  },
  body: {
    ...font.regular,
    fontSize: tokens.text.body,
    lineHeight: 24,
    color: color.inkSoft,
    textAlign: 'center',
  },
  strong: { ...font.semibold, color: color.ink },
  actions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space[3],
    marginTop: tokens.space[2],
  },
});
