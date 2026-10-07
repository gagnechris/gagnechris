import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { describe, expect, it } from 'vitest';
import {
  keys,
  notePk,
  projectStatusGsi1Pk,
  sitePublishPk,
  statusGsi1Pk,
  notebookAreaGsi1Pk,
} from '@gagnechris/data';
import { getEnvironment } from '../lib/config/environments.js';
import { DataStack } from '../lib/stacks/data-stack.js';
import { PublisherStack } from '../lib/stacks/publisher-stack.js';

type Statement = {
  Effect?: string;
  Action?: string | string[];
  Resource?: unknown;
  Condition?: Record<string, Record<string, string | string[]>>;
};

function publisherStatements(): Statement[] {
  const app = new App();
  const config = getEnvironment('prod', {
    CDK_ACCOUNT: '123456789012',
    ALERTS_EMAIL: 'alerts@example.com',
  });
  const env = { account: config.account, region: config.region };
  const deps = new Stack(app, 'PubIamDeps', { env });
  const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
  const data = new DataStack(app, 'DataForPubIam', {
    env,
    config,
    alertsTopic,
  });
  const publisher = new PublisherStack(app, 'Publisher-iam', {
    env,
    config,
    dataTable: data.table,
    alertsTopic,
  });
  return Object.values(
    Template.fromStack(publisher).findResources('AWS::IAM::Policy'),
  ).flatMap(
    (p) => (p.Properties?.PolicyDocument?.Statement ?? []) as Statement[],
  );
}

const glob = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
  );

/** The subset of IAM evaluation these statements use: Allow, actions, table vs index resource, ForAllValues:StringLike on LeadingKeys. */
function allows(
  statements: Statement[],
  request: {
    action: string;
    index?: string;
    leadingKeys: string[];
  },
): boolean {
  return statements.some((s) => {
    if (s.Effect !== 'Allow') return false;
    const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
    if (!actions.includes(request.action)) return false;
    const resource = JSON.stringify(s.Resource);
    const onIndex = /\/index\/([\w-]+)/.exec(resource)?.[1];
    if ((onIndex ?? undefined) !== request.index) return false;
    for (const [operator, conditions] of Object.entries(s.Condition ?? {})) {
      for (const [key, raw] of Object.entries(conditions)) {
        if (operator !== 'ForAllValues:StringLike') return false;
        if (key !== 'dynamodb:LeadingKeys') return false;
        const patterns = (Array.isArray(raw) ? raw : [raw]).map(glob);
        if (
          !request.leadingKeys.every((k) => patterns.some((re) => re.test(k)))
        ) {
          return false;
        }
      }
    }
    return true;
  });
}

describe('publisher DynamoDB access', () => {
  const statements = publisherStatements();
  const projectId = '01JPROJECT0000000000000000';

  it('can read project META and PUBLISHED rows', () => {
    for (const action of ['dynamodb:GetItem', 'dynamodb:BatchGetItem']) {
      expect(
        allows(statements, {
          action,
          leadingKeys: [keys.project.published(projectId).pk],
        }),
        action,
      ).toBe(true);
    }
  });

  it('can read the site publish row', () => {
    expect(
      allows(statements, {
        action: 'dynamodb:GetItem',
        leadingKeys: [sitePublishPk()],
      }),
    ).toBe(true);
  });

  it('can query the published-projects and published-posts GSI partitions', () => {
    for (const pk of [
      projectStatusGsi1Pk('published'),
      statusGsi1Pk('published'),
    ]) {
      expect(
        allows(statements, {
          action: 'dynamodb:Query',
          index: 'gsi1',
          leadingKeys: [pk],
        }),
        pk,
      ).toBe(true);
    }
  });

  it('still cannot read Notebook (USER#) rows', () => {
    const userKey = notePk('sub-1', '01JNOTE00000000000000000000');
    expect(userKey.startsWith('USER#')).toBe(true);
    for (const action of ['dynamodb:GetItem', 'dynamodb:BatchGetItem']) {
      expect(allows(statements, { action, leadingKeys: [userKey] })).toBe(
        false,
      );
    }
    expect(
      allows(statements, {
        action: 'dynamodb:BatchGetItem',
        leadingKeys: [keys.project.published(projectId).pk, userKey],
      }),
    ).toBe(false);
    expect(
      allows(statements, {
        action: 'dynamodb:Query',
        index: 'gsi1',
        leadingKeys: [notebookAreaGsi1Pk('sub-1', 'work')],
      }),
    ).toBe(false);
  });

  it('cannot read drafts lists, slug claims or contact messages', () => {
    for (const pk of [projectStatusGsi1Pk('draft'), statusGsi1Pk('draft')]) {
      expect(
        allows(statements, {
          action: 'dynamodb:Query',
          index: 'gsi1',
          leadingKeys: [pk],
        }),
        pk,
      ).toBe(false);
    }
    for (const pk of [
      keys.project.slugClaim('notebook').pk,
      'CONTACT#01JCONTACT000000000000000',
    ]) {
      expect(
        allows(statements, { action: 'dynamodb:GetItem', leadingKeys: [pk] }),
        pk,
      ).toBe(false);
    }
  });

  it('cannot query the base table or scan', () => {
    expect(
      allows(statements, {
        action: 'dynamodb:Query',
        leadingKeys: [keys.project.published(projectId).pk],
      }),
    ).toBe(false);
    expect(
      allows(statements, { action: 'dynamodb:Scan', leadingKeys: [] }),
    ).toBe(false);
  });
});
