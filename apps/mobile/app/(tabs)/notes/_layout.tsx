import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const detail = { headerLargeTitleEnabled: false, headerBackTitle: 'Notes' };

const NotesStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Notes' }} />
    <Stack.Screen name="[id]" options={detail} />
    <Stack.Screen name="task/[id]" options={detail} />
  </Stack>
);

export default NotesStack;
