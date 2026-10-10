import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const MoreStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'More' }} />
    <Stack.Screen
      name="templates"
      options={{ title: 'Daily templates', headerLargeTitle: false }}
    />
  </Stack>
);

export default MoreStack;
