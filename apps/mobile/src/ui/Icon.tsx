import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import { color as themeColor } from '../theme';

type Props = { name: SFSymbol; size?: number; color?: ColorValue };

/** Decorative: the control around it carries the label. */
export const Icon = ({
  name,
  size = 22,
  color = themeColor.inkSoft,
}: Props) => (
  <SymbolView
    name={name}
    size={size}
    tintColor={color}
    accessible={false}
    importantForAccessibility="no-hide-descendants"
  />
);
