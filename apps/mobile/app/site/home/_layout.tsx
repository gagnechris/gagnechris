import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const HomeStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
  </Stack>
);

export default HomeStack;
