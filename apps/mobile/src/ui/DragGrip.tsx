import { useLatest } from '@gagnechris/app-core';
import { tokens } from '@gagnechris/tokens';
import { useMemo } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { color, MIN_TARGET } from '../theme';
import { Icon } from './Icon';

export type DragMove = { dx: number; dy: number; pageY: number };

type Props = {
  onStart: () => void;
  onMove: (move: DragMove) => void;
  /** With the last move on a drop; null when the system took the touch. */
  onEnd: (move: DragMove | null) => void;
};

/** The grip a row is dragged by. VoiceOver moves rows from their menu instead. */
export const DragGrip = (props: Props) => {
  const latest = useLatest(props);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => latest.current.onStart(),
        onPanResponderMove: (_event, g) =>
          latest.current.onMove({ dx: g.dx, dy: g.dy, pageY: g.moveY }),
        onPanResponderRelease: (_event, g) =>
          latest.current.onEnd({ dx: g.dx, dy: g.dy, pageY: g.moveY }),
        onPanResponderTerminate: () => latest.current.onEnd(null),
      }),
    [latest],
  );
  return (
    <View
      {...responder.panHandlers}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={styles.grip}
    >
      <Icon name="line.3.horizontal" size={14} color={color.muted} />
    </View>
  );
};

const GRIP_WIDTH = 22;

/** How far a row's grip pushes its title right, past the row's gap. */
export const GRIP_INSET = GRIP_WIDTH + tokens.space[2];

const styles = StyleSheet.create({
  // Clear of the screen's left edge, where iOS's swipe back would take the touch.
  grip: {
    width: GRIP_WIDTH,
    height: MIN_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
