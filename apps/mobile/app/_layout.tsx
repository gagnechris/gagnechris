import { createApiClient } from '@gagnechris/api-client';
import { AppApiProvider } from '@gagnechris/app-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { AreaProvider } from '../src/area';
import { apiBaseUrl } from '../src/config';
import {
  localAuthBackend,
  rootGuards,
  SessionProvider,
  useSession,
} from '../src/session';
import { color } from '../src/theme';

const backend = localAuthBackend();

const RootStack = () => {
  const { status, hasNotebook, getToken } = useSession();
  const getClient = useCallback(
    () => createApiClient({ baseUrl: apiBaseUrl, getToken }),
    [getToken],
  );
  if (status === 'restoring') return null;
  const guards = rootGuards(status, hasNotebook);
  return (
    <AppApiProvider getClient={getClient}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.background },
        }}
      >
        <Stack.Protected guard={guards.notebook}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="index" />
        </Stack.Protected>
        <Stack.Protected guard={guards.noAccess}>
          <Stack.Screen name="no-access" />
        </Stack.Protected>
        <Stack.Protected guard={guards.signIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </AppApiProvider>
  );
};

const RootLayout = () => {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <SessionProvider backend={backend}>
      <QueryClientProvider client={queryClient}>
        <AreaProvider store={AsyncStorage}>
          <RootStack />
        </AreaProvider>
        <StatusBar style="dark" />
      </QueryClientProvider>
    </SessionProvider>
  );
};

export default RootLayout;
