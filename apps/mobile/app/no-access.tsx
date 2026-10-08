import { ACCESS_LEVEL_LABELS, accessLevelFromGroups } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../src/session';
import { color, font } from '../src/theme';
import { Button } from '../src/ui/Button';
import { Icon } from '../src/ui/Icon';

const NoAccessScreen = () => {
  const { user, signOut, signIn } = useSession();
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
        You don’t have access to Notebook
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
        . Ask a Full Admin if you need Notebook.
      </Text>
      <View style={styles.actions}>
        <Button
          title="Use a different account"
          variant="secondary"
          onPress={() => void switchAccount()}
        />
        <Button
          title="Sign out"
          variant="secondary"
          onPress={() => void signOut()}
        />
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
