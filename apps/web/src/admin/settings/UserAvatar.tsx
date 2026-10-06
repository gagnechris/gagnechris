import type { ManagedUser } from '@gagnechris/shared';
import { initials } from './userAccess';

export function UserAvatar({
  user,
  size = 'small',
}: {
  user: ManagedUser;
  size?: 'small' | 'large';
}) {
  const muted = user.status === 'disabled' || user.status === 'removed';
  return (
    <span
      className={[
        'users-avatar',
        size === 'large' ? 'users-avatar--large' : null,
        muted ? 'users-avatar--muted' : null,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      {initials(user)}
    </span>
  );
}
