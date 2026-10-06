import { Outlet, useMatch } from 'react-router-dom';
import WorkspaceShell, {
  WorkspaceFrame,
  type ShellNavSection,
} from '../workspace/WorkspaceShell';
import type { AuthUser } from '../workspace/auth/session';
import { USER_ADMIN_GROUP } from '../workspace/access';
import AdminSearchPalette from './AdminSearchPalette';

export type AdminOutletContext = { user: AuthUser };

const SECTIONS: ShellNavSection[] = [
  {
    label: 'Public site',
    items: [
      { to: '/', label: 'Posts', icon: 'posts', end: true },
      { to: '/home', label: 'Home page', tabLabel: 'Home', icon: 'home' },
      { to: '/resume', label: 'Resume', icon: 'resume' },
      { to: '/projects', label: 'Projects', icon: 'projects' },
    ],
  },
  {
    label: 'Settings',
    items: [
      {
        to: '/settings/users',
        label: 'Users & access',
        tabLabel: 'Users',
        icon: 'users',
        group: USER_ADMIN_GROUP,
      },
    ],
  },
];

function AdminFrame({ user }: { user: AuthUser }) {
  const editingPost = useMatch('/posts/:postId');
  return (
    <WorkspaceFrame
      app="admin"
      user={user}
      sections={SECTIONS}
      rail={editingPost !== null}
      renderSearch={(close) => <AdminSearchPalette onClose={close} />}
    >
      <Outlet context={{ user } satisfies AdminOutletContext} />
    </WorkspaceFrame>
  );
}

export default function AdminLayout() {
  return (
    <WorkspaceShell app="admin">
      {(user) => <AdminFrame user={user} />}
    </WorkspaceShell>
  );
}
