import { tokens } from '@gagnechris/tokens';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { authMode } from '../../../src/config';
import { useSession } from '../../../src/session';
import { color, font } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { Icon } from '../../../src/ui/Icon';
import { Screen } from '../../../src/ui/Screen';
import { YourApps } from '../../../src/ui/YourApps';

const SignIn = () => {
  const { signIn, expired } = useSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await signIn();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.mark}>
        <Icon name="book.closed" size={28} color={color.surface} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        Sign in
      </Text>
      <Text style={styles.body}>
        {expired
          ? 'Your session ended. Sign in again to keep going.'
          : 'Sign in to open your Notebook and Admin.'}
      </Text>
      {failed ? (
        <Text style={styles.error} accessibilityRole="alert">
          Couldn’t sign in. Check your connection and try again.
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button variant="primary" disabled={busy} onPress={() => void start()}>
          {authMode === 'local' ? 'Sign in (local)' : 'Sign in'}
        </Button>
      </View>
    </ScrollView>
  );
};

/** Signed out, sign-in; signed in, the apps to switch to. */
const AccountScreen = () => {
  const { status } = useSession();
  const router = useRouter();
  const previous = useRef(status);
  // A sign-in from this tab opens the user's space, as launch does.
  useEffect(() => {
    if (previous.current === 'signedOut' && status === 'signedIn') {
      router.replace('/');
    }
    previous.current = status;
  }, [router, status]);
  if (status !== 'signedIn') return <SignIn />;
  return (
    <Screen>
      <YourApps current="site" />
    </Screen>
  );
};

export default AccountScreen;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.background },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: tokens.space[4],
    padding: tokens.space[6],
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...font.bold,
    fontSize: tokens.text['2xl'],
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
  error: {
    ...font.medium,
    fontSize: tokens.text.base,
    color: color.alert,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    marginTop: tokens.space[2],
  },
});
