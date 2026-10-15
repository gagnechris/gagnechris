import type { ComponentProps } from 'react';
import { cx, type ControlSize } from './cx.js';
import { inputClasses } from './Field.js';
import { useFieldControl } from './fieldContext.js';
import { Glyph } from './Glyph.js';

type Props = Omit<ComponentProps<'input'>, 'size' | 'type'> & {
  size?: ControlSize;
  invalid?: boolean;
};

/** A native date input with a calendar icon at the end. */
export const DateInput = ({
  size = 'md',
  invalid,
  className,
  ...rest
}: Props) => {
  const field = useFieldControl(rest, invalid);
  return (
    <span className={cx('kit-date', className)}>
      <input
        {...rest}
        {...field.aria}
        type="date"
        className={inputClasses(
          { size, invalid: field.invalid, tone: field.tone },
          'kit-date__input',
        )}
      />
      <Glyph name="calendar" className="kit-date__icon" />
    </span>
  );
};
