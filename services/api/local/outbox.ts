import { appendFileSync } from 'node:fs';
import type { SESv2Client } from '@aws-sdk/client-sesv2';
import { setSesClient } from '../src/contact/mail.js';

export type OutboxMail = {
  from: string;
  to: string[];
  replyTo: string[];
  subject: string;
  text: string;
};

type SendEmailInput = {
  FromEmailAddress?: string;
  Destination?: { ToAddresses?: string[] };
  ReplyToAddresses?: string[];
  Content?: {
    Simple?: {
      Subject?: { Data?: string };
      Body?: { Text?: { Data?: string } };
    };
  };
};

/**
 * Local mail never reaches SES: each message is logged and, when
 * `LOCAL_OUTBOX_FILE` is set, appended to it as one JSON line.
 */
export function installLocalOutbox(env: NodeJS.ProcessEnv = process.env): void {
  env.CONTACT_FROM_EMAIL ||= 'local-from@gagnechris.com';
  env.CONTACT_TO_EMAIL ||= 'local-to@gagnechris.com';
  const file = env.LOCAL_OUTBOX_FILE;
  const client = {
    send: async (command: { input: SendEmailInput }) => {
      const { input } = command;
      const mail: OutboxMail = {
        from: input.FromEmailAddress ?? '',
        to: input.Destination?.ToAddresses ?? [],
        replyTo: input.ReplyToAddresses ?? [],
        subject: input.Content?.Simple?.Subject?.Data ?? '',
        text: input.Content?.Simple?.Body?.Text?.Data ?? '',
      };
      console.info('[local-api] outbox', mail.subject);
      if (file) appendFileSync(file, `${JSON.stringify(mail)}\n`);
      return { MessageId: `local-${Date.now()}` };
    },
  };
  setSesClient(client as unknown as SESv2Client);
}
