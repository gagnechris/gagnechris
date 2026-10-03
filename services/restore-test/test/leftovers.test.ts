import { describe, expect, it } from 'vitest';
import {
  findLeftoverRestoreTables,
  isRestoreScratchTableName,
} from '../src/leftovers.js';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe('leftover restore tables (CHR-198)', () => {
  it('matches only restore scratch names', () => {
    for (const name of [
      'awsbackup-restore-test-1a2b',
      'gagnechris-prod-restore-20261002130416',
      'gagnechris-prod-backup-restore-20261003',
      'gagnechris-local-restore-notes',
    ]) {
      expect(isRestoreScratchTableName(name), name).toBe(true);
    }
    for (const name of [
      'gagnechris-prod',
      'gagnechris-local',
      'gagnechris-it-notes-1234',
      'other-restore-table',
      'awsbackup-restore-test-',
    ]) {
      expect(isRestoreScratchTableName(name), name).toBe(false);
    }
  });

  it('pages ListTables and reports tables past the age limit', async () => {
    const pages = [
      {
        TableNames: ['gagnechris-prod', 'awsbackup-restore-test-old'],
        LastEvaluatedTableName: 'awsbackup-restore-test-old',
      },
      {
        TableNames: [
          'awsbackup-restore-test-fresh',
          'gagnechris-prod-restore-20261001',
          'gagnechris-prod-restore-gone',
        ],
      },
    ];
    const created: Record<string, Date | undefined> = {
      'awsbackup-restore-test-old': hoursAgo(30),
      'awsbackup-restore-test-fresh': hoursAgo(2),
      'gagnechris-prod-restore-20261001': hoursAgo(48),
      'gagnechris-prod-restore-gone': undefined,
    };
    const described: string[] = [];
    const leftovers = await findLeftoverRestoreTables(
      {
        listTables: async (start) => (start ? pages[1]! : pages[0]!),
        describeCreation: async (name) => {
          described.push(name);
          return created[name];
        },
      },
      NOW,
      24,
    );
    expect(leftovers).toEqual([
      { tableName: 'awsbackup-restore-test-old', ageHours: 30 },
      { tableName: 'gagnechris-prod-restore-20261001', ageHours: 48 },
    ]);
    // Never describes the live table.
    expect(described).not.toContain('gagnechris-prod');
  });
});
