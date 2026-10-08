import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const MoreStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'More' }} />
  </Stack>
);

export default MoreStack;
