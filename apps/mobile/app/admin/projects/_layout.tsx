import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const ProjectsStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Projects' }} />
  </Stack>
);

export default ProjectsStack;
