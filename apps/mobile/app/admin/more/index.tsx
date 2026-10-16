import { Alert } from 'react-native';
import { addPasskeyFromMore, canAddPasskey } from '../../../src/auth/passkey';
import { signOutWarning } from '../../../src/cache';
import { useSession } from '../../../src/session';
import { color } from '../../../src/theme';
import { AccountCard } from '../../../src/ui/AccountCard';
import { Icon } from '../../../src/ui/Icon';
import { ListRow } from '../../../src/ui/ListRow';
import { Screen } from '../../../src/ui/Screen';
import { Section } from '../../../src/ui/Section';
import { YourApps } from '../../../src/ui/YourApps';

const AdminMoreScreen = () => {
  const { user, signOut } = useSession();
  if (!user) return null;

  const confirmSignOut = () =>
    Alert.alert('Sign out of Admin?', signOutWarning(), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <Screen>
      <AccountCard user={user} />
      <YourApps current="admin" />
      <Section title="Account">
        {canAddPasskey ? (
          <ListRow
            title="Add a passkey"
            accessibilityHint="Opens the sign-in page to save a passkey for this account"
            onPress={() => void addPasskeyFromMore()}
            trailing={
              <Icon name="chevron.right" size={14} color={color.muted} />
            }
          />
        ) : null}
        <ListRow
          title="Sign out of Admin"
          destructive
          onPress={confirmSignOut}
        />
      </Section>
    </Screen>
  );
};

export default AdminMoreScreen;
