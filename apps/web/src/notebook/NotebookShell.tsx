import WorkspaceShell from '../workspace/WorkspaceShell';
import NotebookLayout from './NotebookLayout';

export default function NotebookShell() {
  return (
    <WorkspaceShell app="notebook">
      {(user) => <NotebookLayout user={user} />}
    </WorkspaceShell>
  );
}
