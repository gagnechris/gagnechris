import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const PagesStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Pages' }} />
  </Stack>
);

export default PagesStack;
