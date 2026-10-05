import { useMatch } from 'react-router-dom';
import WorkspaceShell, {
  WorkspaceFrame,
  type ShellNavSection,
} from '../workspace/WorkspaceShell';
import type { AuthUser } from '../workspace/auth/session';
import AdminSearchPalette from './AdminSearchPalette';

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
    />
  );
}

export default function AdminLayout() {
  return (
    <WorkspaceShell>{(user) => <AdminFrame user={user} />}</WorkspaceShell>
  );
}
