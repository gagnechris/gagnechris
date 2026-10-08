import { tokens } from '@gagnechris/tokens';

/**
 * The Inter faces `app.json` embeds through the expo-font plugin, by
 * PostScript name. The weight goes with the name: given a name alone, React
 * Native can fall back to the family's regular face.
 */
export const font = {
  regular: { fontFamily: 'Inter-Regular', fontWeight: '400' },
  medium: { fontFamily: 'Inter-Medium', fontWeight: '500' },
  semibold: { fontFamily: 'Inter-SemiBold', fontWeight: '600' },
  bold: { fontFamily: 'Inter-Bold', fontWeight: '700' },
} as const;

export const color = {
  background: tokens.neutral[50],
  surface: '#ffffff',
  ink: tokens.neutral[900],
  inkSoft: tokens.neutral[600],
  muted: tokens.neutral[500],
  border: tokens.neutral[200],
  fill: tokens.neutral[100],
  accent: tokens.primary[600],
  accentSoft: tokens.primary[50],
  accentInk: tokens.primary[800],
  alert: tokens.color.alert,
} as const;

/** iOS minimum hit target. */
export const MIN_TARGET = 44;
