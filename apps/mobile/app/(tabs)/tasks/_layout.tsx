import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

// A detail opened from search, conflicts or a link gets the list under it.
export const unstable_settings = { anchor: 'index' };

const detail = { headerLargeTitleEnabled: false, headerBackTitle: 'Tasks' };

const TasksStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Tasks' }} />
    <Stack.Screen name="[id]" options={detail} />
    <Stack.Screen name="note/[id]" options={detail} />
  </Stack>
);

export default TasksStack;
