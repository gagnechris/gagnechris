// Callers load this with import() so the SDK stays out of the cold start. A static
// re-export bundles to require(), which resolves the Lambda runtime's SDK; a bare import() would not.
export { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
