import { startStack } from './stack';

export default async function globalSetup() {
  const stack = await startStack();
  // Workers inherit env set here; fixtures read it.
  process.env.E2E_BASE_URL = stack.baseUrl;
  process.env.E2E_API_URL = stack.apiUrl;
  process.env.E2E_SITE_URL = stack.siteUrl;
  console.info(
    `[e2e] stack up: web ${stack.baseUrl}, api ${stack.apiUrl}, site ${stack.siteUrl}`,
  );
  return stack.stop;
}
