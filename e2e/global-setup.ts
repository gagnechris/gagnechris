import { startStack } from './stack';

export default async function globalSetup() {
  const stack = await startStack();
  // Workers inherit env set here; fixtures read it.
  process.env.E2E_PUBLIC_URL = stack.publicUrl;
  process.env.E2E_ADMIN_URL = stack.adminUrl;
  process.env.E2E_NOTEBOOK_URL = stack.notebookUrl;
  process.env.E2E_ADMIN_AUTH_URL = stack.adminAuthUrl;
  process.env.E2E_NOTEBOOK_AUTH_URL = stack.notebookAuthUrl;
  process.env.E2E_API_URL = stack.apiUrl;
  process.env.E2E_SITE_URL = stack.siteUrl;
  process.env.E2E_SITE_ROOT = stack.siteRoot;
  process.env.E2E_OUTBOX_FILE = stack.outboxFile;
  console.info(
    `[e2e] stack up: public ${stack.publicUrl}, admin ${stack.adminUrl}, notebook ${stack.notebookUrl}, auth builds ${stack.adminAuthUrl} ${stack.notebookAuthUrl}, api ${stack.apiUrl}, site ${stack.siteUrl}`,
  );
  return async () => {
    try {
      await stack.checkDevServers();
    } finally {
      await stack.stop();
    }
  };
}
