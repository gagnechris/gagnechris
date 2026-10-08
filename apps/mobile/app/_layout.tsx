import { createApiClient } from '@gagnechris/api-client';
import { AppApiProvider } from '@gagnechris/app-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AreaProvider } from '../src/area';
import { createAppAuth } from '../src/auth';
import { SessionQueryCache, wipeLocalData } from '../src/cache';
import { apiBaseUrl } from '../src/config';
import { NetworkStatus, startConnectivity } from '../src/net';
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
  useEffect(() => startConnectivity(), []);
  return (
    <SessionProvider backend={backend} wipe={wipeLocalData}>
      <SessionQueryCache>
        <AreaProvider store={AsyncStorage}>
          <View style={{ flex: 1 }}>
            <NetworkStatus />
            {/* Measures its own insets, so screens below the banner don't pad twice. */}
            <SafeAreaProvider>
              <RootStack />
            </SafeAreaProvider>
          </View>
        </AreaProvider>
        <StatusBar style="dark" />
      </SessionQueryCache>
    </SessionProvider>
  );
};

export default RootLayout;
