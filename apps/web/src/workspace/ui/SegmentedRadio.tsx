import { useRef, type KeyboardEvent } from 'react';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

/** A radio group drawn as a segmented control: one tab stop, arrows move. */
export default function SegmentedRadio<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = options.length - 1;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      className={`workspace-segmented${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option, i) => (
        <button
          key={option.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          className="workspace-segmented__option"
          onClick={() => onChange(option.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
