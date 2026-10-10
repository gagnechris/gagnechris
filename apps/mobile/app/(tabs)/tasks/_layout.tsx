import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const detail = { headerLargeTitleEnabled: false, headerBackTitle: 'Tasks' };

const TasksStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Tasks' }} />
    <Stack.Screen name="[id]" options={detail} />
    <Stack.Screen name="note/[id]" options={detail} />
  </Stack>
);

export default TasksStack;
