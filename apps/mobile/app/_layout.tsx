import { AppApiProvider } from '@gagnechris/app-core';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createAuthedClient } from '../src/api';
import { CachedQueryProvider } from '../src/cache';
import { localDevSub } from '../src/config';
import { NetworkStatus, startConnectivity } from '../src/net';

const RootLayout = () => {
  useEffect(() => startConnectivity(), []);
  return (
    <AppApiProvider getClient={createAuthedClient}>
      <CachedQueryProvider sub={localDevSub}>
        <View style={{ flex: 1 }}>
          <NetworkStatus />
          {/* Measures its own insets, so screens below the banner don't pad twice. */}
          <SafeAreaProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </SafeAreaProvider>
        </View>
        <StatusBar style="dark" />
      </CachedQueryProvider>
    </AppApiProvider>
  );
};

export default RootLayout;
