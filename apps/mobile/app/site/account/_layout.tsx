import { Stack } from 'expo-router';
import { useSession } from '../../../src/session';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const AccountStack = () => {
  const { status } = useSession();
  return (
    <Stack screenOptions={largeTitleStack}>
      <Stack.Screen
        name="index"
        options={
          status === 'signedIn' ? { title: 'Apps' } : { headerShown: false }
        }
      />
    </Stack>
  );
};

export default AccountStack;
