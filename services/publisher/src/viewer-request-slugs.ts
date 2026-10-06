// A KeyValueStore lets the viewer-request function allowlist /blog/<slug> and
// /projects/<slug> without rewriting function code. A CloudFront Function can
// read one KVS, so each allowlist owns a namespace of its keys.
import { readFile, writeFile } from 'node:fs/promises';
import '@aws-sdk/signature-v4a';
import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  ListKeysCommand,
  UpdateKeysCommand,
  type DeleteKeyRequestListItem,
  type PutKeyRequestListItem,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import {
  POST_SLUG_KVS_SYNCED_KEY,
  PROJECT_SLUG_KVS_PREFIX,
  PROJECT_SLUG_KVS_SYNCED_KEY,
} from '@gagnechris/shared';
import { isLocalCloudFront } from './config.js';
import { logger } from './observability.js';

export type KvsNamespace = {
  label: string;
  syncedKey: string;
  owns: (key: string) => boolean;
};

export const BLOG_SLUG_NAMESPACE: KvsNamespace = {
  label: 'blog',
  syncedKey: POST_SLUG_KVS_SYNCED_KEY,
  // Post slugs never contain `/`, so other namespaces use a path prefix.
  owns: (key) => !key.includes('/'),
};

export const PROJECT_SLUG_NAMESPACE: KvsNamespace = {
  label: 'project',
  syncedKey: PROJECT_SLUG_KVS_SYNCED_KEY,
  owns: (key) => key.startsWith(PROJECT_SLUG_KVS_PREFIX),
};

export const projectSlugKvsKey = (slug: string): string =>
  `${PROJECT_SLUG_KVS_PREFIX}${slug}`;

export const KVS_UPDATE_BATCH_SIZE = 50;

export const KVS_SYNC_MAX_ATTEMPTS = 3;

const kvs = new CloudFrontKeyValueStoreClient({});

export type SlugKeyDiff = {
  puts: PutKeyRequestListItem[];
  deletes: DeleteKeyRequestListItem[];
};

export type SlugKvsClient = {
  describeETag: (kvsArn: string) => Promise<string>;
  listKeys: (kvsArn: string) => Promise<string[]>;
  updateKeys: (input: {
    kvsArn: string;
    ifMatch: string;
    puts: PutKeyRequestListItem[];
    deletes: DeleteKeyRequestListItem[];
  }) => Promise<string>;
};

export class KvsSyncError extends Error {
  readonly kvsSyncFailed = true as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KvsSyncError';
  }
}

/** Only keys `namespace` owns are put or deleted. */
export function diffSlugKeys(
  existingKeys: Iterable<string>,
  slugs: string[],
  namespace: KvsNamespace = BLOG_SLUG_NAMESPACE,
): SlugKeyDiff {
  const existing = new Set(
    [...existingKeys].filter((key) => namespace.owns(key)),
  );
  const desired = new Set<string>();
  for (const slug of slugs) {
    if (slug && slug !== namespace.syncedKey && namespace.owns(slug)) {
      desired.add(slug);
    }
  }
  desired.add(namespace.syncedKey);

  const puts: PutKeyRequestListItem[] = [];
  const deletes: DeleteKeyRequestListItem[] = [];

  for (const key of desired) {
    if (!existing.has(key)) {
      puts.push({ Key: key, Value: '1' });
    }
  }
  for (const key of existing) {
    if (!desired.has(key)) {
      deletes.push({ Key: key });
    }
  }

  return { puts, deletes };
}

export function batchSlugKeyDiff(
  diff: SlugKeyDiff,
  batchSize = KVS_UPDATE_BATCH_SIZE,
): SlugKeyDiff[] {
  const batches: SlugKeyDiff[] = [];
  let putOffset = 0;
  let deleteOffset = 0;

  while (putOffset < diff.puts.length || deleteOffset < diff.deletes.length) {
    const puts: PutKeyRequestListItem[] = [];
    const deletes: DeleteKeyRequestListItem[] = [];
    let remaining = batchSize;

    while (remaining > 0 && putOffset < diff.puts.length) {
      puts.push(diff.puts[putOffset]!);
      putOffset += 1;
      remaining -= 1;
    }
    while (remaining > 0 && deleteOffset < diff.deletes.length) {
      deletes.push(diff.deletes[deleteOffset]!);
      deleteOffset += 1;
      remaining -= 1;
    }

    batches.push({ puts, deletes });
  }

  return batches;
}

async function listAllKeysWithSdk(kvsArn: string): Promise<string[]> {
  const keys: string[] = [];
  let nextToken: string | undefined;
  do {
    const page = await kvs.send(
      new ListKeysCommand({
        KvsARN: kvsArn,
        MaxResults: 50,
        NextToken: nextToken,
      }),
    );
    for (const item of page.Items ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return keys;
}

function defaultSdkClient(): SlugKvsClient {
  return {
    async describeETag(kvsArn) {
      const described = await kvs.send(
        new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }),
      );
      if (!described.ETag) {
        throw new Error(`DescribeKeyValueStore missing ETag for ${kvsArn}`);
      }
      return described.ETag;
    },
    listKeys: listAllKeysWithSdk,
    async updateKeys({ kvsArn, ifMatch, puts, deletes }) {
      const updated = await kvs.send(
        new UpdateKeysCommand({
          KvsARN: kvsArn,
          IfMatch: ifMatch,
          Puts: puts.length ? puts : undefined,
          Deletes: deletes.length ? deletes : undefined,
        }),
      );
      if (!updated.ETag) {
        throw new Error(`UpdateKeys missing ETag for ${kvsArn}`);
      }
      return updated.ETag;
    },
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolved after describe/list so a stale republish-all list cannot delete a
 * concurrently published slug.
 */
export type DesiredKeys = string[] | (() => Promise<string[]>);

async function resolveDesiredKeys(slugs: DesiredKeys): Promise<string[]> {
  return typeof slugs === 'function' ? await slugs() : slugs;
}

export async function syncSlugKeysOnce(
  kvsArn: string,
  slugs: DesiredKeys,
  client: SlugKvsClient,
  namespace: KvsNamespace = BLOG_SLUG_NAMESPACE,
): Promise<'synced' | 'noop'> {
  // Describe first so the ETag covers list → update (avoids concurrent races).
  let etag = await client.describeETag(kvsArn);
  const existing = await client.listKeys(kvsArn);
  const desired = await resolveDesiredKeys(slugs);
  const diff = diffSlugKeys(existing, desired, namespace);
  if (diff.puts.length === 0 && diff.deletes.length === 0) {
    return 'noop';
  }

  const batches = batchSlugKeyDiff(diff);
  for (const batch of batches) {
    etag = await client.updateKeys({
      kvsArn,
      ifMatch: etag,
      puts: batch.puts,
      deletes: batch.deletes,
    });
  }
  return 'synced';
}

export type SyncSlugKeysOptions = {
  client?: SlugKvsClient;
  namespace?: KvsNamespace;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

export async function syncSlugKeysWithClient(
  kvsArn: string,
  slugs: DesiredKeys,
  options: SyncSlugKeysOptions = {},
): Promise<'synced' | 'noop'> {
  const client = options.client ?? defaultSdkClient();
  const namespace = options.namespace ?? BLOG_SLUG_NAMESPACE;
  const maxAttempts = options.maxAttempts ?? KVS_SYNC_MAX_ATTEMPTS;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await syncSlugKeysOnce(kvsArn, slugs, client, namespace);
      if (result === 'noop') {
        logger.info('Slug KVS already in sync', {
          kvsArn,
          namespace: namespace.label,
          attempt,
        });
      } else {
        logger.info('Synced slug KeyValueStore', {
          kvsArn,
          namespace: namespace.label,
          attempt,
        });
      }
      return result;
    } catch (err) {
      lastError = err;
      logger.warn('Slug KVS sync attempt failed', {
        kvsArn,
        namespace: namespace.label,
        attempt,
        maxAttempts,
        err,
      });
      if (attempt < maxAttempts) {
        await sleep(50 * 2 ** (attempt - 1));
      }
    }
  }

  throw new KvsSyncError(
    `CloudFront KVS ${namespace.label} slug sync failed after ${maxAttempts} attempts`,
    { cause: lastError },
  );
}

/**
 * Local stacks have no KVS: with `LOCAL_KVS_FILE` set, the keys go to that
 * JSON file (`{ "keys": [...] }`), which the local static server reads.
 */
function localFileClient(path: string): SlugKvsClient {
  const read = async (): Promise<string[]> => {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as {
        keys?: string[];
      };
      return parsed.keys ?? [];
    } catch {
      return [];
    }
  };
  return {
    describeETag: async () => 'local',
    listKeys: read,
    async updateKeys({ puts, deletes }) {
      const keys = new Set(await read());
      for (const { Key } of deletes) if (Key) keys.delete(Key);
      for (const { Key } of puts) if (Key) keys.add(Key);
      await writeFile(path, JSON.stringify({ keys: [...keys].sort() }));
      return 'local';
    },
  };
}

/** Throws {@link KvsSyncError} after retries so the stream can retry. */
export async function syncViewerRequestKeys(
  namespace: KvsNamespace,
  keys: DesiredKeys,
  options?: SyncSlugKeysOptions,
): Promise<void> {
  if (isLocalCloudFront()) {
    const localFile = process.env.LOCAL_KVS_FILE?.trim();
    if (!localFile) return;
    await syncSlugKeysWithClient('local', keys, {
      ...options,
      namespace,
      client: options?.client ?? localFileClient(localFile),
    });
    return;
  }
  const kvsArn = process.env.BLOG_SLUGS_KVS_ARN?.trim();
  if (!kvsArn) {
    logger.warn('BLOG_SLUGS_KVS_ARN unset; skipped slug KVS sync', {
      namespace: namespace.label,
    });
    return;
  }

  await syncSlugKeysWithClient(kvsArn, keys, { ...options, namespace });
}
