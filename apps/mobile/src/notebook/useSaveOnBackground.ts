import { useEffect } from 'react';
import { AppState } from 'react-native';

/** iOS may end a backgrounded app without warning: send edits on the way out. */
export function useSaveOnBackground(dirty: boolean, save: () => unknown) {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && dirty) void save();
    });
    return () => subscription.remove();
  }, [dirty, save]);
}
