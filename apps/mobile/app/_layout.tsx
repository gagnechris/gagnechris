import { createApiClient } from '@gagnechris/api-client';
import { AppApiProvider } from '@gagnechris/app-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AreaProvider } from '../src/area';
import { CachedQueryProvider } from '../src/cache';
import { apiBaseUrl } from '../src/config';
import {
  localAuthBackend,
  rootGuards,
  SessionProvider,
  useSession,
} from '../src/session';
import { NetworkStatus, startConnectivity } from '../src/net';
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

const UserCache = ({ children }: { children: ReactNode }) => {
  const { user } = useSession();
  return (
    <CachedQueryProvider sub={user?.sub ?? null}>
      {children}
    </CachedQueryProvider>
  );
};

const RootLayout = () => {
  useEffect(() => startConnectivity(), []);
  return (
    <SessionProvider backend={backend}>
      <UserCache>
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
      </UserCache>
    </SessionProvider>
  );
};

export default RootLayout;
