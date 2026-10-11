import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const UsersStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Users' }} />
  </Stack>
);

export default UsersStack;
