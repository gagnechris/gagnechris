import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const ProjectsStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Projects' }} />
    <Stack.Screen
      name="[id]"
      options={{ headerLargeTitleEnabled: false, headerBackTitle: 'Projects' }}
    />
  </Stack>
);

export default ProjectsStack;
