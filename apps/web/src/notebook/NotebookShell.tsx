import WorkspaceShell from '../workspace/WorkspaceShell';
import NotebookLayout from './NotebookLayout';

export default function NotebookShell() {
  return (
    <WorkspaceShell>{(user) => <NotebookLayout user={user} />}</WorkspaceShell>
  );
}
