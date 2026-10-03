import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';

type Variant = 'default' | 'primary' | 'danger';

type ButtonAsButton = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  href?: undefined;
  children: ReactNode;
};

type ButtonAsLink = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  href: string;
  children: ReactNode;
};

type Props = ButtonAsButton | ButtonAsLink;

const variantClass: Record<Variant, string> = {
  default: 'admin-btn',
  primary: 'admin-btn admin-btn--primary',
  danger: 'admin-btn admin-btn--danger',
};

export function Button({
  variant = 'default',
  href,
  className,
  children,
  ...rest
}: Props) {
  const classes = [variantClass[variant], className].filter(Boolean).join(' ');

  if (href) {
    const anchorRest = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a className={classes} href={href} {...anchorRest}>
        {children}
      </a>
    );
  }

  const { type = 'button', ...buttonRest } =
    rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type} className={classes} {...buttonRest}>
      {children}
    </button>
  );
}
