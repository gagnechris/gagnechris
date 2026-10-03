import { mountWorkspaceApp } from '../workspace/mountWorkspaceApp';
import { adminRoutes } from './routes';

mountWorkspaceApp(adminRoutes, import.meta.env.VITE_COGNITO_ADMIN_CLIENT_ID);
