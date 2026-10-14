import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

  it('can read the rename redirect rows of posts and projects', () => {
    for (const { pk } of [
      keys.post.slugRedirect('old'),
      keys.project.slugRedirect('old'),
    ]) {
      expect(
        allows(statements, { action: 'dynamodb:GetItem', leadingKeys: [pk] }),
        pk,
      ).toBe(true);
    }
  });

  it('cannot read drafts lists or contact messages', () => {
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
    for (const pk of ['CONTACT#01JCONTACT000000000000000']) {
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

/** What `npm run publish-surface:check` generates from the targets' `s3Outputs`. */
const targetS3Outputs = readFileSync(
  join(ROOT, 'scripts', 'publisher-owned-paths.generated.txt'),
  'utf8',
)
  .split('\n')
  .filter((line) => line && !line.startsWith('#'))
  .sort();

type Intrinsic = string | { Ref?: string; 'Fn::Join'?: [string, Intrinsic[]] };

function render(value: Intrinsic): string {
  if (typeof value === 'string') return value;
  if (value.Ref) return value.Ref === 'AWS::Partition' ? 'aws' : '<bucket>';
  const join = value['Fn::Join'];
  if (join) return join[1].map(render).join(join[0]);
  throw new Error(`Unexpected resource ${JSON.stringify(value)}`);
}

const BUCKET_ARN = 'arn:aws:s3:::<bucket>';

/** Resources on the site bucket: `''` for the bucket, else the object key pattern. */
function siteResources(statement: Statement): string[] {
  const raw = Array.isArray(statement.Resource)
    ? statement.Resource
    : [statement.Resource];
  return (raw as Intrinsic[])
    .map(render)
    .filter((arn) => arn === BUCKET_ARN || arn.startsWith(`${BUCKET_ARN}/`))
    .map((arn) => arn.slice(BUCKET_ARN.length + 1));
}

function actionsOf(statement: Statement): string[] {
  return Array.isArray(statement.Action)
    ? statement.Action
    : [statement.Action ?? ''];
}

function s3Allows(
  statements: Statement[],
  action: string,
  key: string,
): boolean {
  return statements.some(
    (s) =>
      s.Effect === 'Allow' &&
      actionsOf(s).some((a) => glob(a).test(action)) &&
      siteResources(s).some((pattern) => glob(pattern).test(key)),
  );
}

function objectPatternsFor(statements: Statement[], action: string): string[] {
  return [
    ...new Set(
      statements
        .filter(
          (s) =>
            s.Effect === 'Allow' &&
            actionsOf(s).some((a) => glob(a).test(action)),
        )
        .flatMap(siteResources)
        .filter(Boolean),
    ),
  ].sort();
}

const WRITE_ACTIONS = [
  's3:PutObject',
  's3:DeleteObject',
  's3:DeleteObjectVersion',
  's3:PutObjectAcl',
];

describe('publisher site bucket access', () => {
  const statements = publisherStatements();

  it('puts and deletes exactly the keys its targets declare', () => {
    expect(targetS3Outputs).toEqual(
      expect.arrayContaining(['blog/*', 'index.html', 'rss.xml']),
    );
    expect(objectPatternsFor(statements, 's3:PutObject')).toEqual(
      targetS3Outputs,
    );
    expect(objectPatternsFor(statements, 's3:DeleteObject')).toEqual(
      targetS3Outputs,
    );
  });

  it('cannot write or delete media, assets, the shell or other site keys', () => {
    for (const key of [
      'media/cover.jpg',
      'assets/index-abc123.js',
      '_shell.html',
      'fonts/inter-latin.woff2',
      'notebook/index.html',
      'contact/index.html',
    ]) {
      for (const action of WRITE_ACTIONS) {
        expect(s3Allows(statements, action, key), `${action} ${key}`).toBe(
          false,
        );
      }
    }
  });

  it('never deletes object versions', () => {
    expect(
      s3Allows(statements, 's3:DeleteObjectVersion', 'blog/a/index.html'),
    ).toBe(false);
  });

  it('can write pages and remove stale keys under its outputs', () => {
    for (const key of [
      'index.html',
      'blog/hello/index.html',
      'blog/slugs.json',
      'projects/notebook/index.html',
      'resume.pdf',
      'sitemap.xml',
    ]) {
      expect(s3Allows(statements, 's3:PutObject', key), key).toBe(true);
      expect(s3Allows(statements, 's3:DeleteObject', key), key).toBe(true);
    }
  });

  it('reads the shell and lists the bucket', () => {
    expect(s3Allows(statements, 's3:GetObject', '_shell.html')).toBe(true);
    expect(s3Allows(statements, 's3:GetObject', 'blog/posts.json')).toBe(true);
    expect(s3Allows(statements, 's3:ListBucket', '')).toBe(true);
  });
});
