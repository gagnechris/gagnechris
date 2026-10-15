/** @jsxRuntime automatic */
import {
  useRef,
  type ChangeEvent,
  type ComponentProps,
  type KeyboardEvent,
} from 'react';
import { assignRef, cx, type ControlSize } from './cx.js';
import { inputClasses } from './Field.js';
import { useFieldControl } from './fieldContext.js';
import { Glyph } from './Glyph.js';

type Props = Omit<
  ComponentProps<'input'>,
  'size' | 'type' | 'value' | 'onChange' | 'defaultValue'
> & {
  value: string;
  onValueChange: (value: string) => void;
  size?: ControlSize;
  clearLabel?: string;
};

/**
 * A search box with a clear button once there is text. Escape clears; on an
 * empty box Escape passes through, so the popup or palette around it closes.
 */
export const SearchInput = ({
  value,
  onValueChange,
  size = 'md',
  clearLabel = 'Clear search',
  className,
  ref,
  onKeyDown,
  ...rest
}: Props) => {
  const input = useRef<HTMLInputElement | null>(null);
  const field = useFieldControl(rest, false);

  const clear = () => {
    onValueChange('');
    input.current?.focus();
  };

  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || e.key !== 'Escape' || value === '') return;
    e.preventDefault();
    e.stopPropagation();
    onValueChange('');
  };

  return (
    <span className={cx('kit-search-input', className)}>
      <Glyph name="search" className="kit-search-input__icon" />
      <input
        {...rest}
        {...field.aria}
        ref={(el) => {
          input.current = el;
          assignRef(ref, el);
        }}
        type="search"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onValueChange(e.target.value)
        }
        onKeyDown={keyDown}
        className={inputClasses(
          { size, invalid: false, tone: 'default' },
          'kit-search-input__control',
        )}
      />
      {value ? (
        <button
          type="button"
          className="kit-search-input__clear"
          aria-label={clearLabel}
          title={clearLabel}
          onClick={clear}
        >
          <Glyph name="close" size={14} />
        </button>
      ) : null}
    </span>
  );
};
