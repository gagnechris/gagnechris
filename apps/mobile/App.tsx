import { HealthResponseSchema } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { createAuthedClient, createPublicClient } from './src/api';
import { apiBaseUrl } from './src/config';

type SpikeStatus = {
  health: string;
  home: string;
};

export default function App() {
  const [status, setStatus] = useState<SpikeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runSpike = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const publicClient = createPublicClient();
      const healthResult = await publicClient.GET('/api/health');
      if (healthResult.error || !healthResult.data) {
        throw new Error(`Health failed (${healthResult.response.status})`);
      }
      const health = HealthResponseSchema.parse(healthResult.data);

      const authed = createAuthedClient();
      const homeResult = await authed.GET('/api/admin/home');
      const homeLabel =
        homeResult.error || !homeResult.data
          ? `home error (${homeResult.response.status})`
          : `home ok v${homeResult.data.version} (${homeResult.data.status})`;

      setStatus({
        health: `${health.status} / ${health.service}`,
        home: homeLabel,
      });
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>gagnechris</Text>
      <Text style={styles.subtitle}>Mobile spike</Text>
      <Text style={styles.meta}>API: {apiBaseUrl}</Text>

      {loading ? (
        <ActivityIndicator color={tokens.primary[500]} size="large" />
      ) : null}

      {status ? (
        <View style={styles.card}>
          <Text style={styles.row}>Health: {status.health}</Text>
          <Text style={styles.row}>Admin: {status.home}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => void runSpike()}
        style={({ pressed }) => [
          styles.button,
          pressed ? styles.buttonPressed : null,
        ]}
      >
        <Text style={styles.buttonLabel}>
          {status || error ? 'Retry' : 'Run spike'}
        </Text>
      </Pressable>

      <StatusBar style="dark" />
    </View>
  );
}

// `space`, `text`, and `radius` tokens are px numbers, so RN consumes them
// directly.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.neutral[50],
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[8],
    gap: tokens.space[3],
  },
  brand: {
    fontSize: tokens.text['2xl'],
    fontWeight: '700',
    color: tokens.primary[700],
  },
  subtitle: {
    fontSize: tokens.text.base,
    color: tokens.neutral[600],
  },
  meta: {
    fontSize: tokens.text.xs,
    color: tokens.neutral[500],
    marginBottom: tokens.space[4],
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: tokens.radius.md,
    padding: tokens.space[4],
    gap: tokens.space[2],
    borderLeftWidth: 4,
    borderLeftColor: tokens.primary[400],
  },
  row: {
    fontSize: tokens.text.sm,
    color: tokens.neutral[800],
  },
  error: {
    color: tokens.accent.coral,
    textAlign: 'center',
    paddingHorizontal: tokens.space[4],
  },
  button: {
    marginTop: tokens.space[4],
    backgroundColor: tokens.primary[500],
    paddingVertical: tokens.space[3],
    paddingHorizontal: tokens.space[6],
    borderRadius: tokens.radius.md,
  },
  buttonPressed: {
    backgroundColor: tokens.primary[600],
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: tokens.text.base,
  },
});
