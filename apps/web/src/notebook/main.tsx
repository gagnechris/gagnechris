import { mountWorkspaceApp } from '../workspace/mountWorkspaceApp';
import { notebookRoutes } from './routes';

mountWorkspaceApp(
  notebookRoutes,
  import.meta.env.VITE_COGNITO_NOTEBOOK_CLIENT_ID,
);
