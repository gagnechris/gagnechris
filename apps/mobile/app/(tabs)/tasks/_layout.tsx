import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const TasksStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Tasks' }} />
    <Stack.Screen
      name="[id]"
      options={{ headerLargeTitleEnabled: false, headerBackTitle: 'Tasks' }}
    />
  </Stack>
);

export default TasksStack;
