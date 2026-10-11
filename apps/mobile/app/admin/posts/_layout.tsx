import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

// A screen opened from a link gets the list under it.
export const unstable_settings = { anchor: 'index' };

const PostsStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Posts' }} />
    <Stack.Screen
      name="[id]"
      options={{ headerLargeTitleEnabled: false, headerBackTitle: 'Posts' }}
    />
  </Stack>
);

export default PostsStack;
