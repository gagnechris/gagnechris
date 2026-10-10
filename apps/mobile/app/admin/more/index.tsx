import { Alert } from 'react-native';
import { signOutWarning } from '../../../src/cache';
import { useSession } from '../../../src/session';
import { AccountCard } from '../../../src/ui/AccountCard';
import { Row } from '../../../src/ui/Row';
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
        <Row title="Sign out of Admin" destructive onPress={confirmSignOut} />
      </Section>
    </Screen>
  );
};

export default AdminMoreScreen;
