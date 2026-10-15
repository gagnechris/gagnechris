import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx.js';

type Option<T extends string> = {
  value: T;
  title: string;
  description?: ReactNode;
  disabled?: boolean;
};

type Props<T extends string> = {
  label: string;
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  name?: string;
  className?: string;
};

/** Radios drawn as cards, for choices that each need a sentence. One tab stop; arrows move. */
export const RadioCardGroup = <T extends string>({
  label,
  options,
  value,
  onChange,
  name,
  className,
}: Props<T>) => {
  const id = useId();
  const groupName = name ?? id;
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const enabled = options
    .map((o, i) => (o.disabled ? -1 : i))
    .filter((i) => i >= 0);
  const selected = options.findIndex((o) => o.value === value);
  const tabStop = selected >= 0 ? selected : (enabled[0] ?? -1);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    if ((!forward && !back) || !enabled.length) return;
    e.preventDefault();
    const at = enabled.indexOf(index);
    const next =
      enabled[(at + (forward ? 1 : -1) + enabled.length) % enabled.length]!;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx('ui-radio-cards', className)}
    >
      {options.map((option, i) => {
        const checked = i === selected;
        return (
          <label
            key={option.value}
            className={cx(
              'ui-radio-card',
              checked && 'ui-radio-card--selected',
              option.disabled && 'ui-radio-card--disabled',
            )}
          >
            <input
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="radio"
              className="ui-radio-card__input"
              name={groupName}
              value={option.value}
              checked={checked}
              disabled={option.disabled}
              tabIndex={i === tabStop ? 0 : -1}
              aria-labelledby={`${id}-${i}-title`}
              aria-describedby={
                option.description ? `${id}-${i}-description` : undefined
              }
              onChange={() => onChange(option.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
            />
            <span className="ui-radio-card__dot" aria-hidden="true" />
            <span className="ui-radio-card__text">
              <span id={`${id}-${i}-title`} className="ui-radio-card__title">
                {option.title}
              </span>
              {option.description ? (
                <span
                  id={`${id}-${i}-description`}
                  className="ui-radio-card__description"
                >
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
};
