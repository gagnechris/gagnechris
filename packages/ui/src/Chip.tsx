import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx.js';
import { Glyph } from './Glyph.js';
import { Menu, MenuRadioGroup } from './Menu.js';

export type ChipTone = 'neutral' | 'selected' | 'warning' | 'danger';

type Props = Omit<HTMLAttributes<HTMLElement>, 'onClick'> & {
  tone?: ChipTone;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  /** Adds a remove button labelled "Remove {removeLabel}". */
  onRemove?: () => void;
  /** The value the remove button names; defaults to the chip's text. */
  removeLabel?: string;
  /** Makes the chip a button (not with `onRemove`). */
  onClick?: () => void;
  pressed?: boolean;
  /** Button chips only. */
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

/** A 26px pill for a status, filter or tag. */
export const Chip = ({
  tone = 'neutral',
  dot,
  icon,
  children,
  onRemove,
  removeLabel,
  onClick,
  pressed,
  disabled,
  ref,
  className,
  ...rest
}: Props) => {
  const classes = cx('ui-chip', `ui-chip--${tone}`, className);
  const content = (
    <>
      {dot ? <span className="ui-chip__dot" aria-hidden="true" /> : null}
      {icon ? (
        <span className="ui-chip__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="ui-chip__text">{children}</span>
    </>
  );

  if (onClick && !onRemove) {
    return (
      <button
        ref={ref}
        type="button"
        className={cx(classes, 'ui-chip--button')}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        {...rest}
      >
        {content}
      </button>
    );
  }

  const name = removeLabel ?? (typeof children === 'string' ? children : '');
  return (
    <span className={classes} {...rest}>
      {content}
      {onRemove ? (
        <button
          type="button"
          className="ui-chip__remove"
          aria-label={`Remove ${name}`.trim()}
          title={`Remove ${name}`.trim()}
          onClick={onRemove}
        >
          <Glyph name="close" size={12} />
        </button>
      ) : null}
    </span>
  );
};

type ChipSelectProps<T extends string> = {
  /** What the chip sets, such as "Area"; names the menu. */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  /** Shown when nothing is chosen; defaults to "Add {label}". */
  placeholder?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

/** An outline chip that opens a menu of choices. */
export const ChipSelect = <T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = `Add ${label.toLowerCase()}`,
  icon,
  disabled,
}: ChipSelectProps<T>) => {
  const current = options.find((o) => o.value === value);
  return (
    <Menu
      label={label}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          disabled={disabled}
          aria-label={current ? `${label}: ${current.label}` : placeholder}
          className={cx(
            'ui-chip ui-chip--outline ui-chip--button ui-chip-select',
            !current && 'ui-chip-select--empty',
          )}
        >
          {icon ? (
            <span className="ui-chip__icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span className="ui-chip__text">{current?.label ?? placeholder}</span>
          <Glyph
            name="chevronDown"
            size={12}
            className="ui-chip-select__chevron"
          />
        </button>
      )}
    >
      <MenuRadioGroup
        label={label}
        hideLabel
        options={options}
        value={value}
        onChange={onChange}
      />
    </Menu>
  );
};
