import { Link } from 'react-router-dom';

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/posts', label: 'Posts' },
  { to: '/resume', label: 'Resume' },
  { to: '/contact', label: 'Contact' },
] as const;

type PublicNavProps = {
  current?: string;
};

export default function PublicNav({ current }: PublicNavProps) {
  return (
    <nav className="public-nav" aria-label="Primary">
      {LINKS.map(({ to, label }) => {
        const isCurrent =
          current === to || (to !== '/' && !!current?.startsWith(to));
        return (
          <Link
            key={to}
            to={to}
            className={
              isCurrent ? 'public-nav__link is-current' : 'public-nav__link'
            }
            aria-current={isCurrent ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
