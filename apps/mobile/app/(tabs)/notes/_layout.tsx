import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const NotesStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Notes' }} />
    <Stack.Screen
      name="[id]"
      options={{ headerLargeTitleEnabled: false, headerBackTitle: 'Notes' }}
    />
  </Stack>
);

export default NotesStack;
