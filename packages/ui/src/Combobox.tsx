/** @jsxRuntime automatic */
import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from './cx.js';
import { TextInput } from './Field.js';

export type ComboboxOption = {
  id: string;
  label: string;
  meta?: ReactNode;
  disabled?: boolean;
};

type Props<O extends ComboboxOption> = Omit<
  ComponentProps<typeof TextInput>,
  'value' | 'onChange' | 'defaultValue' | 'role' | 'prefix'
> & {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly O[];
  onPick: (option: O) => void;
  /** Names the listbox; defaults to the input's own name. */
  listLabel?: string;
  loading?: boolean;
  loadingText?: ReactNode;
  emptyText?: ReactNode;
  error?: ReactNode;
};

/**
 * A text input with a listbox popup. Focus stays in the input; arrows move
 * the active option, Enter picks it, Escape closes the list.
 */
export const Combobox = <O extends ComboboxOption>({
  value,
  onValueChange,
  options,
  onPick,
  listLabel,
  loading,
  loadingText = 'Loading…',
  emptyText = 'No matches',
  error,
  className,
  onKeyDown,
  onFocus,
  onBlur,
  ...rest
}: Props<O>) => {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-option-${i}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const enabled = options
    .map((o, i) => (o.disabled ? -1 : i))
    .filter((i) => i >= 0);
  const activeIndex = enabled.includes(active) ? active : (enabled[0] ?? -1);
  const status = error
    ? { text: error, error: true }
    : loading
      ? { text: loadingText, error: false }
      : options.length === 0
        ? { text: emptyText, error: false }
        : null;

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document
      .getElementById(optionId(activeIndex))
      ?.scrollIntoView?.({ block: 'nearest' });
    // optionId is derived from the stable useId value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  const pick = (option: O) => {
    if (option.disabled) return;
    setOpen(false);
    onPick(option);
  };

  const step = (by: 1 | -1) => {
    if (!enabled.length) return;
    const at = enabled.indexOf(activeIndex);
    const next = at < 0 ? 0 : (at + by + enabled.length) % enabled.length;
    setActive(enabled[next]!);
  };

  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        if (e.key === 'ArrowUp' && enabled.length)
          setActive(enabled[enabled.length - 1]!);
        return;
      }
      step(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' && open && activeIndex >= 0) {
      e.preventDefault();
      pick(options[activeIndex]!);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className={cx('ui-combobox', className)}>
      <TextInput
        {...rest}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          open && activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={keyDown}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          onBlur?.(e);
        }}
        onClick={() => setOpen(true)}
      />
      <div className="ui-menu ui-combobox__popup" hidden={!open}>
        <ul
          id={listId}
          role="listbox"
          aria-label={listLabel ?? rest['aria-label']}
          className="ui-combobox__list"
        >
          {options.map((option, i) => (
            <li
              key={option.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              aria-disabled={option.disabled || undefined}
              className={cx(
                'ui-combobox__option',
                i === activeIndex && 'ui-combobox__option--active',
              )}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => {
                if (!option.disabled && i !== activeIndex) setActive(i);
              }}
              onClick={() => pick(option)}
            >
              <span className="ui-combobox__label">{option.label}</span>
              {option.meta ? (
                <span className="ui-combobox__meta">{option.meta}</span>
              ) : null}
            </li>
          ))}
        </ul>
        {status ? (
          <div
            role="status"
            className={cx(
              'ui-combobox__status',
              status.error && 'ui-combobox__status--error',
            )}
          >
            {status.text}
          </div>
        ) : null}
      </div>
    </div>
  );
};
