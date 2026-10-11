import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

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
