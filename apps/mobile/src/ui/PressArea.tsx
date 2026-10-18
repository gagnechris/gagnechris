import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  type AccessibilityState,
  type Insets,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { color } from '../theme';

type Props = {
  children: ReactNode;
  onPress: () => void;
  /** VoiceOver reads the area as one element with this label. */
  accessibilityLabel: string;
  accessibilityRole?: 'button' | 'link' | 'tab' | 'radio' | 'menuitem';
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  disabled?: boolean;
  /** `fill` greys the background while pressed, `fade` dims the content. */
  feedback?: 'fill' | 'fade' | 'none';
  hitSlop?: number | Insets;
  /** The area's layout; it must reach 44 pt, itself or through `hitSlop`. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A pressable area around content no other primitive draws: a search hit, a
 * post preview, a banner. Rows of a plain title use ListRow.
 */
export const PressArea = ({
  children,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityHint,
  accessibilityState,
  disabled,
  feedback = 'fill',
  hitSlop,
  style,
  testID,
}: Props) => (
  <Pressable
    accessibilityRole={accessibilityRole}
    accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint}
    accessibilityState={
      disabled ? { ...accessibilityState, disabled: true } : accessibilityState
    }
    disabled={disabled}
    onPress={onPress}
    hitSlop={hitSlop}
    testID={testID}
    style={({ pressed }) => [style, pressed && pressedStyle[feedback]]}
  >
    {children}
  </Pressable>
);

const pressedStyle = StyleSheet.create({
  fill: { backgroundColor: color.fill },
  fade: { opacity: 0.7 },
  none: {},
});
