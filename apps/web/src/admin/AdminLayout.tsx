import { useMemo } from 'react';
import { Outlet, useMatch } from 'react-router-dom';
import { USER_ADMIN_GROUP } from '@gagnechris/shared';
import WorkspaceShell, {
  WorkspaceFrame,
  type ShellNavSection,
} from '../workspace/WorkspaceShell';
import type { AuthUser } from '../workspace/auth/session';
import { navPages } from '../workspace/navSections';
import AdminSearchPalette from './AdminSearchPalette';
import './admin.css';

export type AdminOutletContext = { user: AuthUser };

const SECTIONS: ShellNavSection[] = [
  {
    label: 'Public site',
    items: [
      { to: '/', label: 'Posts', icon: 'posts', end: true },
      {
        to: '/pages',
        label: 'Pages',
        icon: 'pages',
        childPages: [
          { to: '/home', label: 'Home page' },
          { to: '/resume', label: 'Resume' },
        ],
      },
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
  const pages = useMemo(() => navPages(SECTIONS, user.groups), [user.groups]);
  return (
    <WorkspaceFrame
      app="admin"
      user={user}
      sections={SECTIONS}
      rail={editingPost !== null}
      renderSearch={(close) => (
        <AdminSearchPalette pages={pages} onClose={close} />
      )}
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
