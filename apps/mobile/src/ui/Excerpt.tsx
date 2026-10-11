import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

/**
 * A preview of longer text (a search snippet, a note's prose) that stops
 * after `lines`; the full text is one tap away. Titles never cap.
 */
export const Excerpt = ({
  lines,
  style,
  children,
}: {
  lines: number;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
}) => (
  <Text style={style} numberOfLines={lines}>
    {children}
  </Text>
);
