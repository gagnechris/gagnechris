/** @jsxRuntime automatic */
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { assignRef, cx } from './cx.js';
import { Glyph } from './Glyph.js';

type Props = Omit<ComponentProps<'input'>, 'type' | 'children'> & {
  label: ReactNode;
  /** Keeps the label for screen readers only, as in a task row. */
  hideLabel?: boolean;
  /** `round` is for tasks; `square` for settings and fields. */
  shape?: 'square' | 'round';
  /** Square only: the mixed state. */
  indeterminate?: boolean;
  /** Round only: a dropped task. */
  dropped?: boolean;
};

export const Checkbox = ({
  label,
  hideLabel,
  shape = 'square',
  indeterminate = false,
  dropped = false,
  className,
  ref,
  ...rest
}: Props) => {
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label
      className={cx(
        'ui-check',
        `ui-check--${shape}`,
        dropped && 'ui-check--dropped',
        rest.disabled && 'ui-check--disabled',
        className,
      )}
    >
      <input
        {...rest}
        ref={(el) => {
          input.current = el;
          assignRef(ref, el);
        }}
        type="checkbox"
        className="ui-check__input"
      />
      <span className="ui-check__box" aria-hidden="true">
        <Glyph name="check" size={14} className="ui-check__mark" />
        <Glyph name="dash" size={14} className="ui-check__dash" />
      </span>
      <span className={hideLabel ? 'ui-visually-hidden' : 'ui-check__label'}>
        {label}
        {dropped ? <span className="ui-visually-hidden">, dropped</span> : null}
      </span>
    </label>
  );
};
