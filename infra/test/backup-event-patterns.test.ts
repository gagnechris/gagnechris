import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { beforeAll, describe, expect, it } from 'vitest';
import { getEnvironment } from '../lib/config/environments.js';
import { DataStack } from '../lib/stacks/data-stack.js';
import {
  matchesEventPattern,
  resolvePatternTokens,
} from './helpers/event-pattern.js';

// Set to cross-check every case against EventBridge itself (read-only
// TestEventPattern; needs AWS credentials).
const AWS_CHECK = process.env.EVENTBRIDGE_TEST_EVENT_PATTERN === '1';

const FIXTURE_ARNS: Record<string, string> = {
  BackupVaultArn:
    'arn:aws:backup:us-east-1:111111111111:backup-vault:gagnechris-prod-app-table',
  RestoreTestingPlanArn:
    'arn:aws:backup:us-east-1:111111111111:restore-testing-plan:gagnechris_prod_app_table_weekly-00000000-0000-0000-0000-000000000000',
};

const FIXTURES = join(import.meta.dirname, 'fixtures/backup-events');
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));

let patterns: Record<string, Record<string, unknown>>;

beforeAll(() => {
  const app = new App();
  const config = getEnvironment('prod', {
    CDK_ACCOUNT: '123456789012',
    ALERTS_EMAIL: 'alerts@example.com',
  });
  const deps = new Stack(app, 'PatternDeps', {
    env: { account: config.account, region: config.region },
  });
  const data = new DataStack(app, 'Data-prod', {
    env: { account: config.account, region: config.region },
    config,
    alertsTopic: new Topic(deps, 'Alerts', { enforceSSL: true }),
  });
  const rules = Template.fromStack(data).findResources('AWS::Events::Rule');
  patterns = {};
  for (const rule of Object.values(rules)) {
    const props = rule.Properties as {
      Name: string;
      EventPattern?: unknown;
    };
    if (!props.EventPattern) continue;
    patterns[props.Name] = resolvePatternTokens(
      props.EventPattern,
      (logicalId, attribute) => {
        const arn = FIXTURE_ARNS[attribute];
        if (!arn)
          throw new Error(`No fixture value for ${logicalId}.${attribute}`);
        return arn;
      },
    ) as Record<string, unknown>;
  }
});

function awsMatches(pattern: unknown, event: unknown): boolean {
  const out = execFileSync(
    'aws',
    [
      'events',
      'test-event-pattern',
      '--event-pattern',
      JSON.stringify(pattern),
      '--event',
      JSON.stringify(event),
      '--query',
      'Result',
      '--output',
      'text',
    ],
    { encoding: 'utf8' },
  );
  return out.trim() === 'True';
}

function expectMatches(ruleName: string, cases: Record<string, boolean>) {
  const pattern = patterns[ruleName];
  expect(pattern, ruleName).toBeDefined();
  for (const [name, expected] of Object.entries(cases)) {
    const event = fixture(name);
    expect(matchesEventPattern(pattern!, event), `${ruleName} ← ${name}`).toBe(
      expected,
    );
    if (AWS_CHECK) {
      expect(awsMatches(pattern, event), `AWS: ${ruleName} ← ${name}`).toBe(
        expected,
      );
    }
  }
}

describe('backup event rule patterns against realistic events', () => {
  it('validator rule matches COMPLETED DynamoDB restores wherever the plan ARN sits, and nothing else', () => {
    expectMatches('gagnechris-prod-restore-test-validate', {
      'restore-dynamodb-completed': true,
      'restore-dynamodb-completed-plan-nested': true,
      'restore-dynamodb-completed-plan-top-level': true,
      'restore-documented-completed': false,
      'restore-dynamodb-failed-plan-nested': false,
      'restore-dynamodb-running': false,
      'backup-job-completed': false,
    });
  });

  it('failure alert matches FAILED and ABORTED restores wherever the plan ARN sits, not COMPLETED', () => {
    expectMatches('gagnechris-prod-backup-job-failures', {
      'restore-documented-failed': true,
      'restore-dynamodb-failed-plan-nested': true,
      'restore-dynamodb-failed-plan-top-level': true,
      'restore-dynamodb-aborted': true,
      'restore-documented-completed': false,
      'restore-dynamodb-completed-plan-nested': false,
      'restore-dynamodb-completed-plan-top-level': false,
      'restore-dynamodb-running': false,
      'backup-job-failed': true,
      'backup-job-completed': false,
    });
  });

  it('event log rule records every restore job state change', () => {
    expectMatches('gagnechris-prod-restore-job-event-log', {
      'restore-documented-completed': true,
      'restore-documented-failed': true,
      'restore-dynamodb-completed-plan-nested': true,
      'restore-dynamodb-running': true,
      'backup-job-failed': false,
    });
  });
});

describe('local event pattern matcher', () => {
  it('rejects operators it does not implement', () => {
    expect(() =>
      matchesEventPattern(
        { detail: { status: [{ prefix: 'F' }] } },
        { detail: { status: 'FAILED' } },
      ),
    ).toThrow('Unsupported');
  });

  it('requires every key, matches nested objects, array values and $or', () => {
    const pattern = {
      source: ['aws.backup'],
      detail: { $or: [{ state: ['FAILED'] }, { status: ['FAILED'] }] },
    };
    expect(
      matchesEventPattern(pattern, {
        source: 'aws.backup',
        detail: { status: 'FAILED' },
      }),
    ).toBe(true);
    expect(
      matchesEventPattern(pattern, {
        source: 'aws.backup',
        detail: { status: 'COMPLETED' },
      }),
    ).toBe(false);
    expect(matchesEventPattern(pattern, { detail: { status: 'FAILED' } })).toBe(
      false,
    );
    expect(
      matchesEventPattern({ resources: ['b'] }, { resources: ['a', 'b'] }),
    ).toBe(true);
  });
});
