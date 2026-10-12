import { RESUME_PAGE_TITLE } from '@gagnechris/shared';
import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const ResumeStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: RESUME_PAGE_TITLE }} />
  </Stack>
);

export default ResumeStack;
