/** @jsxRuntime automatic */
import {
  useId,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { assignRef, cx, type ControlSize, type Tone } from './cx.js';
import { FieldContext, useFieldControl } from './fieldContext.js';

type FieldProps = {
  label: string;
  hint?: ReactNode;
  /** Replaces the hint and marks the control invalid. */
  error?: ReactNode;
  fullWidth?: boolean;
  tone?: Tone;
  children: ReactNode;
};

export const Field = ({
  label,
  hint,
  error,
  fullWidth,
  tone = 'default',
  children,
}: FieldProps) => {
  const id = useId();
  const labelId = `${id}-label`;
  const message = error || hint;
  const messageId = message ? `${id}-message` : undefined;
  return (
    <FieldContext.Provider
      value={{ labelId, messageId, invalid: Boolean(error), tone }}
    >
      <label
        className={cx(
          'kit-field',
          fullWidth && 'kit-field--full',
          tone === 'editorial' && 'kit-field--editorial',
        )}
      >
        <span id={labelId}>{label}</span>
        {children}
        {error ? (
          <span id={messageId} className="kit-field__error">
            {error}
          </span>
        ) : hint ? (
          <span id={messageId} className="kit-hint">
            {hint}
          </span>
        ) : null}
      </label>
    </FieldContext.Provider>
  );
};

type BoxOptions = {
  size: ControlSize;
  invalid: boolean;
  tone: Tone;
};

export const inputClasses = (
  { size, invalid, tone }: BoxOptions,
  ...extra: (string | false | undefined)[]
) =>
  cx(
    'kit-input',
    size !== 'md' && `kit-input--${size}`,
    invalid && 'kit-input--invalid',
    tone === 'editorial' && 'kit-input--editorial',
    ...extra,
  );

type ControlProps = {
  size?: ControlSize;
  /** Set by the Field when it shows an error. */
  invalid?: boolean;
  tone?: Tone;
};

type TextInputProps = Omit<ComponentProps<'input'>, 'size' | 'prefix'> &
  ControlProps & {
    /** Fixed text before the value, such as `/posts/`. */
    prefix?: ReactNode;
  };

export const TextInput = ({
  size = 'md',
  invalid,
  tone,
  prefix,
  className,
  ...rest
}: TextInputProps) => {
  const field = useFieldControl(rest, invalid, tone);
  const box = { size, invalid: field.invalid, tone: field.tone };
  if (prefix === undefined || prefix === null) {
    return (
      <input
        {...rest}
        {...field.aria}
        className={inputClasses(box, className)}
      />
    );
  }
  return (
    <span className={inputClasses(box, 'kit-input-group', className)}>
      <span className="kit-input-group__prefix" aria-hidden="true">
        {prefix}
      </span>
      <input {...rest} {...field.aria} className="kit-input-group__control" />
    </span>
  );
};

const MAX_LINES = 12;

/** Grows the box with its text up to MAX_LINES (or `rows`, if more), then scrolls. */
const fitToText = (el: HTMLTextAreaElement, rows: number) => {
  const style = getComputedStyle(el);
  const px = (value: string) => parseFloat(value) || 0;
  const lineHeight = px(style.lineHeight) || px(style.fontSize) * 1.5 || 0;
  const padding = px(style.paddingTop) + px(style.paddingBottom);
  const border = px(style.borderTopWidth) + px(style.borderBottomWidth);
  const borderBox = style.boxSizing === 'border-box';
  el.style.height = 'auto';
  const content = el.scrollHeight - padding;
  const max = lineHeight * Math.max(MAX_LINES, rows);
  const inner = Math.min(content, max);
  el.style.height = `${inner + (borderBox ? padding + border : 0)}px`;
  el.style.overflowY = content > max ? 'auto' : 'hidden';
};

type TextAreaProps = ComponentProps<'textarea'> &
  Omit<ControlProps, 'size'> & {
    /** Grow with the text up to 12 lines. On by default. */
    autoGrow?: boolean;
  };

export const TextArea = ({
  className,
  invalid,
  tone,
  autoGrow = true,
  rows = 2,
  ref,
  onInput,
  ...rest
}: TextAreaProps) => {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const field = useFieldControl(rest, invalid, tone);

  useLayoutEffect(() => {
    if (autoGrow && inner.current) fitToText(inner.current, rows);
  });

  const setRef = (el: HTMLTextAreaElement | null) => {
    inner.current = el;
    assignRef(ref, el);
  };

  return (
    <textarea
      {...rest}
      {...field.aria}
      ref={setRef}
      rows={rows}
      onInput={(e) => {
        if (autoGrow) fitToText(e.currentTarget, rows);
        onInput?.(e);
      }}
      className={inputClasses(
        { size: 'md', invalid: field.invalid, tone: field.tone },
        'kit-textarea',
        autoGrow && 'kit-textarea--grow',
        className,
      )}
    />
  );
};

type SelectProps = Omit<ComponentProps<'select'>, 'size'> & ControlProps;

/** The native select; only the box is styled, with a chevron. */
export const Select = ({
  className,
  children,
  size = 'md',
  invalid,
  tone,
  ...rest
}: SelectProps) => {
  const field = useFieldControl(rest, invalid, tone);
  return (
    <select
      {...rest}
      {...field.aria}
      className={inputClasses(
        { size, invalid: field.invalid, tone: field.tone },
        'kit-select',
        className,
      )}
    >
      {children}
    </select>
  );
};
