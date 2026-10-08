import { createApiClient } from '@gagnechris/api-client';
import { AppApiProvider } from '@gagnechris/app-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { AreaProvider } from '../src/area';
import { createAppAuth } from '../src/auth';
import { apiBaseUrl } from '../src/config';
import { rootGuards, SessionProvider, useSession } from '../src/session';
import { color } from '../src/theme';

const backend = createAppAuth();

const RootStack = () => {
  const { status, hasNotebook, getToken } = useSession();
  // One client, so concurrent 401s share its refresh.
  const client = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl, getToken }),
    [getToken],
  );
  const getClient = useCallback(() => client, [client]);
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
  const wipe = useCallback(async () => {
    queryClient.clear();
    await AsyncStorage.clear();
  }, [queryClient]);
  return (
    <SessionProvider backend={backend} wipe={wipe}>
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
