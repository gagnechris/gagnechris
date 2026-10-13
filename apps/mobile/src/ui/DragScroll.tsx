import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  View,
} from 'react-native';

/** What a drag inside a scroll view needs from it. */
export type DragScroll = {
  /** Stops the view scrolling under the finger while a row is dragged. */
  setLocked: (locked: boolean) => void;
  /** The scroll offset now, so a dragged row can follow the content. */
  offset: () => number;
  /** Scrolls while the finger is near the top or bottom edge; null stops. */
  edgeScroll: (pageY: number | null) => void;
};

const DragScrollContext = createContext<DragScroll | null>(null);

export const useDragScroll = () => useContext(DragScrollContext);

const EDGE = 64;
const MAX_STEP = 14;

/** Props and context for a scroll view whose content can drag rows. */
export function useDragScrollView() {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);
  const minOffset = useRef(0);
  const maxOffset = useRef(Infinity);
  const frame = useRef({ top: 0, height: 0 });
  const step = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [locked, setLocked] = useState(false);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    step.current = 0;
  };
  useEffect(() => stop, []);

  const value = useMemo<DragScroll>(
    () => ({
      setLocked,
      offset: () => offset.current,
      edgeScroll: (pageY) => {
        const { top, height } = frame.current;
        if (pageY === null || height === 0) return stop();
        const fromTop = pageY - top;
        const fromBottom = top + height - pageY;
        step.current =
          fromTop < EDGE
            ? -MAX_STEP * (1 - Math.max(0, fromTop) / EDGE)
            : fromBottom < EDGE
              ? MAX_STEP * (1 - Math.max(0, fromBottom) / EDGE)
              : 0;
        if (step.current === 0) return stop();
        timer.current ??= setInterval(() => {
          const next = Math.min(
            maxOffset.current,
            Math.max(minOffset.current, offset.current + step.current),
          );
          if (next === offset.current) return;
          offset.current = next;
          ref.current?.scrollTo({ y: next, animated: false });
        }, 16);
      },
    }),
    [],
  );

  const props = {
    ref,
    scrollEnabled: !locked,
    scrollEventThrottle: 16,
    onScroll: ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = nativeEvent.contentOffset.y;
      minOffset.current = -nativeEvent.contentInset.top;
      maxOffset.current = Math.max(
        minOffset.current,
        nativeEvent.contentSize.height -
          nativeEvent.layoutMeasurement.height +
          nativeEvent.contentInset.bottom,
      );
    },
    // The scroll view's host instance measures like a View.
    onLayout: () =>
      (ref.current as unknown as View | null)?.measureInWindow?.(
        (_x, y, _width, height) => {
          frame.current = { top: y, height };
        },
      ),
  };

  return { props, value, Provider: DragScrollContext.Provider };
}
