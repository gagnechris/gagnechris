import { AppApiProvider } from '@gagnechris/app-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { createAuthedClient } from '../src/api';

const RootLayout = () => {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <AppApiProvider getClient={createAuthedClient}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="dark" />
      </QueryClientProvider>
    </AppApiProvider>
  );
};

export default RootLayout;
