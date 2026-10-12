import { Stack } from 'expo-router';
import { largeTitleStack } from '../../../src/ui/stackOptions';

const HomeStack = () => (
  <Stack screenOptions={largeTitleStack}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen
      name="[slug]"
      options={{
        title: '',
        headerLargeTitleEnabled: false,
        headerBackTitle: 'Home',
      }}
    />
  </Stack>
);

export default HomeStack;
