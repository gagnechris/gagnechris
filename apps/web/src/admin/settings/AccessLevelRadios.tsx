import { useRef, type KeyboardEvent } from 'react';
import { ACCESS_LEVEL_LABELS, type AccessLevel } from '@gagnechris/shared';
import { LEVEL_DESCRIPTIONS, LEVEL_ORDER } from './userAccess';

type Props = {
  value: AccessLevel | null;
  onChange: (level: AccessLevel) => void;
  isDisabled?: (level: AccessLevel) => boolean;
  /** Disables the whole group. */
  disabled?: boolean;
};

/** One tab stop; arrows move the choice and skip unavailable levels. */
export function AccessLevelRadios({
  value,
  onChange,
  isDisabled = () => false,
  disabled = false,
}: Props) {
  const refs = useRef<Partial<Record<AccessLevel, HTMLButtonElement | null>>>(
    {},
  );
  const enabled = LEVEL_ORDER.filter((l) => !disabled && !isDisabled(l));
  const tabStop = value && enabled.includes(value) ? value : enabled[0];

  const onKeyDown = (e: KeyboardEvent, level: AccessLevel) => {
    const index = enabled.indexOf(level);
    const last = enabled.length - 1;
    const next =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? enabled[index === last ? 0 : index + 1]
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? enabled[index <= 0 ? last : index - 1]
          : null;
    if (!next) return;
    e.preventDefault();
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <fieldset className="users-levels-field" disabled={disabled}>
      <legend>Access</legend>
      <div role="radiogroup" aria-label="Access" className="users-radios">
        {LEVEL_ORDER.map((level) => {
          const off = disabled || isDisabled(level);
          return (
            <button
              key={level}
              ref={(el) => {
                refs.current[level] = el;
              }}
              type="button"
              role="radio"
              aria-checked={value === level}
              disabled={off}
              tabIndex={level === tabStop ? 0 : -1}
              className="users-radio"
              onClick={() => onChange(level)}
              onKeyDown={(e) => onKeyDown(e, level)}
            >
              <span className="users-radio__dot" aria-hidden="true" />
              <span className="users-radio__text">
                <span className="users-radio__name">
                  {ACCESS_LEVEL_LABELS[level]}
                </span>
                <span className="users-radio__desc">
                  {LEVEL_DESCRIPTIONS[level]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
