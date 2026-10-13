import { Stack } from 'expo-router';
import { largeTitleStack, noteDetail } from '../../../src/ui/stackOptions';

// A detail opened from search, conflicts or a link gets the list under it.
export const unstable_settings = { anchor: 'index' };

const detail = { headerLargeTitleEnabled: false, headerBackTitle: 'Notes' };

const NotesStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Notes' }} />
    <Stack.Screen name="[id]" options={{ ...detail, ...noteDetail }} />
    <Stack.Screen name="task/[id]" options={detail} />
  </Stack>
);

export default NotesStack;
