import { mountWorkspaceApp } from '../workspace/mountWorkspaceApp';
import { notebookRoutes } from './routes';
import './notebookFonts.css';

// Starts the body font download before the editor route renders text, so it
// usually lands inside `font-display: optional`'s short block period.
void document.fonts?.load('1em Newsreader').catch(() => undefined);

mountWorkspaceApp(
  notebookRoutes,
  import.meta.env.VITE_COGNITO_NOTEBOOK_CLIENT_ID,
);
