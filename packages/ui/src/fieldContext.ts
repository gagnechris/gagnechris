import { createContext, useContext } from 'react';
import type { Tone } from './cx.js';

type FieldContextValue = {
  labelId: string;
  messageId?: string;
  invalid: boolean;
  tone: Tone;
};

export const FieldContext = createContext<FieldContextValue | null>(null);

type OwnAria = {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
};

/**
 * Labels a control from its Field: named by the label text alone (not by a
 * clear or choose button nested in the label), described by the hint or
 * error, and invalid when the Field shows an error.
 */
export const useFieldControl = (
  own: OwnAria,
  invalid?: boolean,
  tone?: Tone,
) => {
  const field = useContext(FieldContext);
  const ownInvalid = own['aria-invalid'];
  const isInvalid =
    invalid ??
    (ownInvalid === undefined
      ? (field?.invalid ?? false)
      : ownInvalid !== false && ownInvalid !== 'false');
  const describedBy = [field?.messageId, own['aria-describedby']]
    .filter(Boolean)
    .join(' ');
  return {
    invalid: isInvalid,
    tone: tone ?? field?.tone ?? 'default',
    labelId: field?.labelId,
    aria: {
      'aria-labelledby':
        own['aria-labelledby'] ??
        (own['aria-label'] ? undefined : field?.labelId),
      'aria-describedby': describedBy || undefined,
      'aria-invalid': isInvalid || undefined,
    },
  };
};
