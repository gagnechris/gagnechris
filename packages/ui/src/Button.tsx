/** @jsxRuntime automatic */
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
  Ref,
} from 'react';
import { cx, type ControlSize, type Tone } from './cx.js';

type Variant = 'default' | 'primary' | 'danger' | 'ghost' | 'link';

type Common = {
  variant?: Variant;
  size?: ControlSize;
  /** The public site's look: taller, rounder, `--color-link` primary. */
  tone?: Tone;
  children: ReactNode;
};

type ButtonAsButton = ButtonHTMLAttributes<HTMLButtonElement> &
  Common & {
    href?: undefined;
    /** Shows a spinner and sets `aria-busy`; the button stays focusable. */
    loading?: boolean;
    ref?: Ref<HTMLButtonElement>;
  };

type ButtonAsLink = AnchorHTMLAttributes<HTMLAnchorElement> &
  Common & {
    href: string;
    loading?: undefined;
  };

type Props = ButtonAsButton | ButtonAsLink;

export const Button = ({
  variant = 'default',
  size = 'md',
  tone = 'default',
  href,
  loading,
  className,
  children,
  ...rest
}: Props) => {
  const classes = cx(
    'ui-btn',
    variant !== 'default' && `ui-btn--${variant}`,
    size !== 'md' && `ui-btn--${size}`,
    tone === 'editorial' && 'ui-btn--editorial',
    loading && 'ui-btn--loading',
    className,
  );

  if (href) {
    const anchorRest = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a className={classes} href={href} {...anchorRest}>
        {children}
      </a>
    );
  }

  const {
    type = 'button',
    onClick,
    ...buttonRest
  } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      type={type}
      className={classes}
      aria-busy={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...buttonRest}
    >
      {loading ? (
        <span className="ui-btn__spinner" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
};
