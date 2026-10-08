import { useLatest } from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import * as Haptics from 'expo-haptics';
import { useMemo, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';

export type SwipeAction = { label: string; tint: string; run: () => void };

const TRIGGER = 96;

/**
 * A full swipe runs the action, as in Mail. Rows also offer every action as a
 * button or VoiceOver action, so a swipe is never the only way in.
 */
export const SwipeRow = ({
  right,
  left,
  children,
}: {
  /** Swiping right, e.g. Complete. */
  right?: SwipeAction;
  /** Swiping left, e.g. Drop. */
  left?: SwipeAction;
  children: ReactNode;
}) => {
  const [offset] = useState(() => new Animated.Value(0));
  const [direction, setDirection] = useState<'right' | 'left' | null>(null);
  const actions = useLatest({ right, left });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, { dx, dy }) =>
          Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 2,
        onPanResponderMove: (_event, { dx }) => {
          const { right: r, left: l } = actions.current;
          const allowed = (dx > 0 && r) || (dx < 0 && l) ? dx : 0;
          setDirection(allowed > 0 ? 'right' : allowed < 0 ? 'left' : null);
          offset.setValue(allowed);
        },
        onPanResponderRelease: (_event, { dx }) => {
          const action =
            dx >= TRIGGER
              ? actions.current.right
              : dx <= -TRIGGER
                ? actions.current.left
                : undefined;
          if (action) {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            action.run();
          }
          Animated.spring(offset, {
            toValue: 0,
            useNativeDriver: true,
          }).start(() => setDirection(null));
        },
        onPanResponderTerminate: () => {
          offset.setValue(0);
          setDirection(null);
        },
      }),
    [actions, offset],
  );

  const shown =
    direction === 'right' ? right : direction === 'left' ? left : null;
  return (
    <View style={styles.wrap}>
      {shown ? (
        <View
          style={[
            styles.under,
            { backgroundColor: shown.tint },
            direction === 'left' && styles.underLeft,
          ]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Text style={styles.label}>{shown.label}</Text>
        </View>
      ) : null}
      <Animated.View
        style={[styles.row, { transform: [{ translateX: offset }] }]}
        {...responder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  under: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: tokens.space[4],
  },
  underLeft: { alignItems: 'flex-end' },
  label: { ...font.semibold, fontSize: tokens.text.base, color: color.surface },
  row: { backgroundColor: color.surface },
});
