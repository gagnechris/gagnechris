import {
  BatchGetCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  GSI1_NAME,
  SK_META,
  batchGetAllWithDocClient,
  getDocClient,
  keys,
  metaToHome,
  metaToPost,
  metaToProject,
  metaToResume,
  parseHomeMetaItem,
  parsePostMetaItem,
  parseProjectMetaItem,
  parseResumeMetaItem,
  parseSitePublishItem,
  projectStatusGsi1Pk,
  statusGsi1Pk,
  type SitePublishState,
} from '@gagnechris/data';
import {
  sortProjectsByOrder,
  type Home,
  type Post,
  type Project,
  type Resume,
} from '@gagnechris/shared';
import { logger, metrics } from './observability.js';
import { sortPostsNewestFirst } from './posts.js';
import type {
  PublishedLookup,
  PublishedPostsCatalog,
  PublishedProjectsCatalog,
} from './publish-targets/types.js';

const ddb = getDocClient();

const BATCH_GET_MAX_KEYS = 100;

// The overlap check and the sitemap must not see BatchGet's arbitrary
// response order.
const sortedUnique = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort();

const stringAttr = (item: unknown, name: string): string | undefined => {
  const value = (item as Record<string, unknown>)[name];
  return typeof value === 'string' && value ? value : undefined;
};

function logCorruptPublished(label: string, item: unknown, err: unknown): void {
  logger.warn(`Skipping corrupt published ${label} item`, {
    pk: stringAttr(item, 'pk'),
    sk: stringAttr(item, 'sk'),
    errMessage: err instanceof Error ? err.message : String(err),
  });
  metrics.addMetric('DataIntegrityError', MetricUnit.Count, 1);
}

export async function getSitePublishState(
  tableName: string,
): Promise<SitePublishState> {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.sitePublish(),
      ConsistentRead: true,
    }),
  );
  return parseSitePublishItem(result.Item);
}

type CatalogSpec<T> = {
  label: string;
  entityType: string;
  gsi1pk: string;
  idAttr: string;
  /** The PUBLISHED pk prefix, for a corrupt row whose id attribute is unusable. */
  pkPrefix: string;
  stateIds: (state: SitePublishState) => readonly string[];
  publishedKey: (id: string) => { pk: string; sk: string };
  toEntity: (item: unknown) => T & { status: string };
  sort: (entities: T[]) => T[];
};

type Catalog<T> = {
  entities: T[];
  /** Only the corrupt row's own slug: META may already hold a draft rename. */
  corruptSlugs: string[];
  corruptIds: string[];
};

/**
 * Ids from GSI1 and from the site publish row, then the PUBLISHED rows. The
 * row is read consistently, so a just-published item is listed however far
 * GSI1 lags; GSI1 still lists items published before the row tracked them.
 */
async function listPublishedCatalog<T>(
  tableName: string,
  spec: CatalogSpec<T>,
): Promise<Catalog<T>> {
  const state = await getSitePublishState(tableName);
  const ids: string[] = [...spec.stateIds(state)];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: { ':pk': spec.gsi1pk },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    // PUBLISHED rows carry no GSI1 keys: the index lists published META rows.
    for (const item of page.Items ?? []) {
      if (item.entityType !== spec.entityType || item.sk !== SK_META) continue;
      const id = stringAttr(item, spec.idAttr);
      if (id) ids.push(id);
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  const entities: T[] = [];
  const corruptSlugs: string[] = [];
  const corruptIds: string[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += BATCH_GET_MAX_KEYS) {
    const responses = await batchGetAllWithDocClient(
      async (RequestItems) => ddb.send(new BatchGetCommand({ RequestItems })),
      {
        [tableName]: {
          Keys: unique.slice(i, i + BATCH_GET_MAX_KEYS).map(spec.publishedKey),
          ConsistentRead: true,
        },
      },
    );
    for (const item of responses[tableName] ?? []) {
      try {
        const entity = spec.toEntity(item);
        if (entity.status === 'published') entities.push(entity);
      } catch (error) {
        logCorruptPublished(spec.label, item, error);
        const pk = stringAttr(item, 'pk');
        const id =
          stringAttr(item, spec.idAttr) ??
          (pk?.startsWith(spec.pkPrefix)
            ? pk.slice(spec.pkPrefix.length)
            : undefined);
        if (id) corruptIds.push(id);
        const slug = stringAttr(item, 'slug');
        if (slug) corruptSlugs.push(slug);
      }
    }
  }
  return {
    entities: spec.sort(entities),
    corruptSlugs: sortedUnique(corruptSlugs),
    corruptIds: sortedUnique(corruptIds),
  };
}

const POSTS: CatalogSpec<Post> = {
  label: 'post',
  entityType: 'post',
  gsi1pk: statusGsi1Pk('published'),
  idAttr: 'postId',
  pkPrefix: 'POST#',
  stateIds: (state) => state.postIds,
  publishedKey: keys.post.published,
  toEntity: (item) => metaToPost(parsePostMetaItem(item)),
  sort: sortPostsNewestFirst,
};

const PROJECTS: CatalogSpec<Project> = {
  label: 'project',
  entityType: 'project',
  gsi1pk: projectStatusGsi1Pk('published'),
  idAttr: 'projectId',
  pkPrefix: 'PROJECT#',
  stateIds: (state) => state.projectIds,
  publishedKey: keys.project.published,
  toEntity: (item) => metaToProject(parseProjectMetaItem(item)),
  sort: sortProjectsByOrder,
};

export async function listPublishedPosts(
  tableName: string,
): Promise<PublishedPostsCatalog> {
  const catalog = await listPublishedCatalog(tableName, POSTS);
  return {
    posts: catalog.entities,
    corruptSlugs: catalog.corruptSlugs,
    corruptPostIds: catalog.corruptIds,
  };
}

export async function listPublishedProjects(
  tableName: string,
): Promise<PublishedProjectsCatalog> {
  const catalog = await listPublishedCatalog(tableName, PROJECTS);
  return { projects: catalog.entities, corruptSlugs: catalog.corruptSlugs };
}

async function getPublishedSingleton<T>(
  tableName: string,
  label: string,
  key: { pk: string; sk: string },
  toEntity: (item: unknown) => T & { status: string },
): Promise<PublishedLookup<T>> {
  const result = await ddb.send(
    new GetCommand({ TableName: tableName, Key: key, ConsistentRead: true }),
  );
  if (!result.Item) return { status: 'missing' };
  try {
    const entity = toEntity(result.Item);
    if (entity.status !== 'published') return { status: 'missing' };
    return { status: 'ok', entity };
  } catch (error) {
    logCorruptPublished(label, { ...key, ...result.Item }, error);
    return { status: 'corrupt' };
  }
}

export const getPublishedResume = (
  tableName: string,
): Promise<PublishedLookup<Resume>> =>
  getPublishedSingleton(
    tableName,
    'resume',
    keys.singleton.resume.published(),
    (item) => metaToResume(parseResumeMetaItem(item)),
  );

export const getPublishedHome = (
  tableName: string,
): Promise<PublishedLookup<Home>> =>
  getPublishedSingleton(
    tableName,
    'home',
    keys.singleton.home.published(),
    (item) => metaToHome(parseHomeMetaItem(item)),
  );
