import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

// A post opened by link gets the list under it.
export const unstable_settings = { anchor: 'index' };

const PostsStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ title: 'Posts' }} />
    <Stack.Screen
      name="[slug]"
      options={{
        title: '',
        headerLargeTitleEnabled: false,
        headerBackTitle: 'Posts',
      }}
    />
  </Stack>
);

export default PostsStack;
