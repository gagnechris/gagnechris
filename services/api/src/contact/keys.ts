/** DynamoDB key helpers for contact messages and rate-limit counters (CHR-98). */

export function contactPk(contactId: string): string {
  return `CONTACT#${contactId}`;
}

export function contactMsgSk(): string {
  return 'MSG';
}

export function rateContactIpPk(ip: string): string {
  return `RATE#contact#ip#${ip}`;
}

export function rateResumeIpPk(ip: string): string {
  return `RATE#resume#ip#${ip}`;
}

export function rateSesGlobalPk(): string {
  return 'RATE#ses#global';
}

/** UTC hour bucket: `HOUR#2026-09-27T14` */
export function rateHourSk(at: Date = new Date()): string {
  const iso = at.toISOString();
  return `HOUR#${iso.slice(0, 13)}`;
}

/** UTC day bucket: `DAY#2026-09-27` */
export function rateDaySk(at: Date = new Date()): string {
  return `DAY#${at.toISOString().slice(0, 10)}`;
}

/** Seconds until end of current UTC hour (+1h buffer for clock skew). */
export function ttlEndOfUtcHour(at: Date = new Date()): number {
  const end = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate(),
    at.getUTCHours() + 1,
    0,
    0,
    0,
  );
  return Math.floor(end / 1000) + 3600;
}

/** Seconds until end of current UTC day (+1d buffer). */
export function ttlEndOfUtcDay(at: Date = new Date()): number {
  const end = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.floor(end / 1000) + 86_400;
}

export type ContactEmailStatus = 'pending' | 'sent' | 'failed';

export type ContactMsgItem = {
  pk: string;
  sk: string;
  entityType: 'contact';
  contactId: string;
  name: string;
  email: string;
  message: string;
  sourceIp: string;
  createdAt: string;
  emailStatus: ContactEmailStatus;
  emailError?: string;
};
