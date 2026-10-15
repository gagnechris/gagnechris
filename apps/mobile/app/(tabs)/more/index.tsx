import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useArea } from '../../../src/area';
import { addPasskeyFromMore, canAddPasskey } from '../../../src/auth/passkey';
import { signOutWarning } from '../../../src/cache';
import { useSession } from '../../../src/session';
import { color } from '../../../src/theme';
import { AccountCard } from '../../../src/ui/AccountCard';
import { useAreaPicker } from '../../../src/ui/AreaChip';
import { Icon } from '../../../src/ui/Icon';
import { Row } from '../../../src/ui/Row';
import { Screen } from '../../../src/ui/Screen';
import { Section } from '../../../src/ui/Section';
import { YourApps } from '../../../src/ui/YourApps';

const MoreScreen = () => {
  const { user, signOut } = useSession();
  const { areaName, areas } = useArea();
  const pickArea = useAreaPicker();
  const router = useRouter();
  if (!user) return null;

  const confirmSignOut = () =>
    Alert.alert('Sign out of Notebook?', signOutWarning(), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <Screen>
      <AccountCard user={user} />

      <YourApps current="notebook" />

      <Section title="Notebook">
        <Row
          title="Default area"
          detail={areaName}
          accessibilityHint={`Chooses ${areas.map((a) => a.name).join(', ')}`}
          onPress={pickArea}
          trailing={<Icon name="chevron.right" size={14} color={color.muted} />}
        />
        <Row
          title="Daily templates"
          divider
          accessibilityHint="Edits what each area's new daily notes start with"
          onPress={() => router.push('/more/templates')}
          trailing={<Icon name="chevron.right" size={14} color={color.muted} />}
        />
      </Section>

      <Section title="Account">
        {canAddPasskey ? (
          <Row
            title="Add a passkey"
            accessibilityHint="Opens the sign-in page to save a passkey for this account"
            onPress={() => void addPasskeyFromMore()}
            trailing={
              <Icon name="chevron.right" size={14} color={color.muted} />
            }
          />
        ) : null}
        <Row
          title="Sign out of Notebook"
          destructive
          divider={canAddPasskey}
          onPress={confirmSignOut}
        />
      </Section>
    </Screen>
  );
};

export default MoreScreen;
