import { NOTEBOOK_AREA_LABELS } from '@gagnechris/shared';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useArea } from '../../../src/area';
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
  const { area } = useArea();
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
          detail={NOTEBOOK_AREA_LABELS[area]}
          accessibilityHint="Chooses Work, Personal or All"
          onPress={pickArea}
          trailing={<Icon name="chevron.right" size={14} color={color.muted} />}
        />
        <Row
          title="Daily templates"
          accessibilityHint="Edits what new Work and Personal daily notes start with"
          onPress={() => router.push('/more/templates')}
          trailing={<Icon name="chevron.right" size={14} color={color.muted} />}
        />
      </Section>

      <Section title="Account">
        <Row
          title="Sign out of Notebook"
          destructive
          onPress={confirmSignOut}
        />
      </Section>
    </Screen>
  );
};

export default MoreScreen;
