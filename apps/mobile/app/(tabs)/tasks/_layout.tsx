import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const TasksStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Tasks' }} />
  </Stack>
);

export default TasksStack;
