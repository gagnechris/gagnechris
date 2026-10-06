import type { SESv2Client } from '@aws-sdk/client-sesv2';

let client: SESv2Client | undefined;

export function setSesClient(next: SESv2Client | undefined): void {
  client = next;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export async function sendOwnerEmail(input: {
  subject: string;
  textBody: string;
  replyTo?: string;
}): Promise<void> {
  const from = requireEnv('CONTACT_FROM_EMAIL');
  const to = requireEnv('CONTACT_TO_EMAIL');
  const { SESv2Client, SendEmailCommand } = await import('./ses-sdk.js');
  client ??= new SESv2Client({});
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: input.replyTo ? [input.replyTo] : undefined,
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: input.textBody, Charset: 'UTF-8' },
          },
        },
      },
    }),
  );
}
