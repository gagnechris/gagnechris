import type { Ref } from 'react';

export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');

export type Tone = 'default' | 'editorial';

export type ControlSize = 'sm' | 'md' | 'lg';

export const assignRef = <T>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
};
