/**
 * Draft + PUBLISHED pair store for site-admin entities. Draft rows go through a
 * composed {@link VersionedRepository}; publish state lives here.
 */
import {
  BatchGetCommand,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  batchGetAllWithDocClient,
  buildSitePublishUpdate,
  type SitePublishIdSet,
} from '@gagnechris/data';
import { getDocClient, requireTableName } from './client.js';
import { systemClock, type Clock } from './clock.js';
import { logCorruptStoredItem } from './corrupt-item.js';
import { retryTransactionConflicts, runDynamoWrite } from './dynamo-write.js';
import { ConflictError, DataIntegrityError, NotFoundError } from './errors.js';
import {
  buildSlugClaimPut,
  buildSlugRenameItems,
  buildSoftDeleteSlugRelease,
  type SlugClaims,
  type Slugged,
  type TransactItem,
} from './slug-claims.js';
import {
  VERSION_MATCH_CONDITION,
  runVersionedWrite,
  throwVersionConflict,
  versionMatchValues,
} from './version-condition.js';
import {
  VersionedRepository,
  unscoped,
  type ItemKey,
  type QueryPage,
  type QueryPageInput,
} from './versioned-repository.js';

export type PublishableEntity = {
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  version: number;
  hasUnpublishedChanges?: boolean;
};

export type PublishKeys = {
  pk: string;
  metaSk: string;
  publishedSk: string;
};

export function withUnpublishedFlag<T extends PublishableEntity>(
  draft: T,
  published: T | undefined,
  contentEqual: (a: T, b: T) => boolean,
): T {
  return {
    ...draft,
    hasUnpublishedChanges:
      draft.status === 'published' &&
      published !== undefined &&
      !contentEqual(draft, published),
  };
}

export function assertExpectedVersion<T extends PublishableEntity>(
  existing: T,
  expectedVersion: number,
): void {
  if (existing.version !== expectedVersion) {
    throw new ConflictError(
      `Version conflict: expected ${expectedVersion}, current ${existing.version}`,
      { currentVersion: existing.version, current: existing },
    );
  }
}

export type PersistPublishOptions<T extends PublishableEntity> = {
  syncPublished?: boolean;
  deletePublished?: boolean;
  previousPublished?: T;
};

export type PublishableConfig<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
> = {
  conflictLabel: string;
  keysFor: (id: string) => PublishKeys;
  idOf: (entity: T) => string;
  toEntity: (item: TItem, hasUnpublishedChanges?: boolean) => T;
  toItem: (entity: T) => TItem;
  toPublishedItem: (entity: T) => TItem;
  contentEqual: (a: T, b: T) => boolean;
  isDeleted?: (entity: T) => boolean;
  cursorKeyNames?: readonly string[];
  /** Keeps a unique slug row in step with the draft's `slug`. */
  slugClaims?: T extends Slugged ? SlugClaims : never;
  /** Throws (usually a BadRequestError) when the draft may not go live. */
  validatePublish?: (draft: T) => void;
  /** The site publish row's id set this entity is listed in while it has a PUBLISHED row. */
  publishedIdSet?: SitePublishIdSet;
  /** Rows written in the same transaction as every draft mutation. */
  extraMutationItems?: (
    before: T,
    after: T,
    options: PersistPublishOptions<T>,
  ) => TransactItem[];
};

export type LoadedPair<T> = { draft: T; published: T | undefined };

/** `hasUnpublishedChanges` is undefined when the META row has no stored flag. */
export type ListRow = { status: string; hasUnpublishedChanges?: boolean };

export type Flagged<R extends ListRow> = Omit<R, 'hasUnpublishedChanges'> & {
  hasUnpublishedChanges: boolean;
};

export type ListRowSpec<R extends ListRow> = {
  /** Read with a ProjectionExpression; omit to read whole rows. */
  attributes?: readonly string[];
  parse: (raw: unknown) => R;
  idOf: (row: R) => string;
};

function withProjection(
  input: QueryPageInput,
  attributes: readonly string[],
): QueryPageInput {
  const names: Record<string, string> = { ...input.ExpressionAttributeNames };
  const placeholders = attributes.map((attr, i) => {
    names[`#proj${i}`] = attr;
    return `#proj${i}`;
  });
  return {
    ...input,
    ProjectionExpression: placeholders.join(', '),
    ExpressionAttributeNames: names,
  };
}

const BATCH_GET_MAX_KEYS = 100;

export class PublishableRepository<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
> {
  private readonly drafts: VersionedRepository<T, TItem, string>;

  constructor(
    protected readonly config: PublishableConfig<T, TItem>,
    protected readonly doc: DynamoDBDocumentClient = getDocClient(),
    protected readonly tableName: string = requireTableName(),
    protected readonly now: Clock = systemClock,
  ) {
    this.drafts = new VersionedRepository<T, TItem, string>(
      {
        conflictLabel: config.conflictLabel,
        scope: unscoped({
          keyForId: (id) => this.metaKey(id),
          idOf: config.idOf,
        }),
        toEntity: (item) => config.toEntity(item),
        toItem: config.toItem,
        isDeleted: config.isDeleted,
        nowIso: now,
        cursorKeyNames: config.cursorKeyNames,
      },
      doc,
      tableName,
    );
  }

  private metaKey(id: string): ItemKey {
    const keys = this.config.keysFor(id);
    return { pk: keys.pk, sk: keys.metaSk };
  }

  private publishedKey(id: string): ItemKey {
    const keys = this.config.keysFor(id);
    return { pk: keys.pk, sk: keys.publishedSk };
  }

  private notFound(id: string): NotFoundError {
    return new NotFoundError(`${this.config.conflictLabel} ${id} not found`);
  }

  private flag(draft: T, published: T | undefined): T {
    return withUnpublishedFlag(draft, published, this.config.contentEqual);
  }

  private slugClaims(): SlugClaims | undefined {
    return this.config.slugClaims as SlugClaims | undefined;
  }

  private async batchGet(
    keys: readonly ItemKey[],
    opts?: { consistentRead?: boolean },
  ): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    for (let i = 0; i < keys.length; i += BATCH_GET_MAX_KEYS) {
      const responses = await batchGetAllWithDocClient(
        async (RequestItems) =>
          this.doc.send(new BatchGetCommand({ RequestItems })),
        {
          [this.tableName]: {
            Keys: keys.slice(i, i + BATCH_GET_MAX_KEYS),
            ...(opts?.consistentRead ? { ConsistentRead: true } : {}),
          },
        },
      );
      items.push(...(responses[this.tableName] ?? []));
    }
    return items;
  }

  async getPublished(id: string): Promise<T | undefined> {
    const result = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: this.publishedKey(id) }),
    );
    return result.Item ? this.drafts.mapItem(result.Item) : undefined;
  }

  async loadDraftAndPublished(
    id: string,
    opts?: { consistentRead?: boolean },
  ): Promise<LoadedPair<T> | undefined> {
    const { metaSk, publishedSk } = this.config.keysFor(id);
    const items = await this.batchGet(
      [this.metaKey(id), this.publishedKey(id)],
      opts,
    );
    const draftItem = items.find((item) => item.sk === metaSk);
    const publishedItem = items.find((item) => item.sk === publishedSk);
    if (!draftItem) return undefined;
    const draft = this.drafts.mapItem(draftItem);
    if (this.config.isDeleted?.(draft)) return undefined;
    const published = publishedItem
      ? this.drafts.mapItem(publishedItem)
      : undefined;
    return { draft, published };
  }

  private async loadOrThrow(id: string): Promise<LoadedPair<T>> {
    const loaded = await this.loadDraftAndPublished(id, {
      consistentRead: true,
    });
    if (!loaded) throw this.notFound(id);
    return loaded;
  }

  async getById(
    id: string,
    opts?: { consistentRead?: boolean },
  ): Promise<T | undefined> {
    const loaded = await this.loadDraftAndPublished(id, opts);
    return loaded ? this.flag(loaded.draft, loaded.published) : undefined;
  }

  async getByIdOrThrow(id: string): Promise<T> {
    const entity = await this.getById(id);
    if (!entity) throw this.notFound(id);
    return entity;
  }

  /** The ids among `ids` that name a live draft. */
  async existingIds(ids: readonly string[]): Promise<Set<string>> {
    const keys = [...new Set(ids)].map((id) => this.metaKey(id));
    const found = new Set<string>();
    for (const item of await this.batchGet(keys)) {
      const draft = this.drafts.mapItem(item);
      if (!this.config.isDeleted?.(draft)) found.add(this.config.idOf(draft));
    }
    return found;
  }

  /**
   * Draft rows mapped by `spec.parse`, reading only `spec.attributes` when
   * given. The flag comes from the META row; rows that predate the stored
   * flag fall back to comparing against PUBLISHED.
   */
  async queryListPage<R extends ListRow>(
    input: QueryPageInput,
    spec: ListRowSpec<R>,
  ): Promise<QueryPage<Flagged<R>>> {
    const page = await this.drafts.queryPageAs(
      spec.attributes ? withProjection(input, spec.attributes) : input,
      (raw) => this.drafts.mapWith(raw, spec.parse),
      (row) => row.status === 'deleted',
    );
    return { ...page, items: await this.resolveFlags(page.items, spec.idOf) };
  }

  /** Corrupt rows read for the fallback are logged and treated as missing so one bad row cannot fail a list. */
  private async resolveFlags<R extends ListRow>(
    rows: readonly R[],
    idOf: (row: R) => string,
  ): Promise<Flagged<R>[]> {
    const legacyIds = [
      ...new Set(
        rows
          .filter(
            (r) =>
              r.status === 'published' && r.hasUnpublishedChanges === undefined,
          )
          .map(idOf),
      ),
    ];
    const computed = new Map<string, boolean>();
    if (legacyIds.length > 0) {
      const byKey = new Map<string, Record<string, unknown>>();
      for (const item of await this.batchGet(
        legacyIds.flatMap((id) => [this.metaKey(id), this.publishedKey(id)]),
      )) {
        byKey.set(`${String(item.pk)}\n${String(item.sk)}`, item);
      }
      const read = (key: ItemKey): T | undefined => {
        const item = byKey.get(`${key.pk}\n${key.sk}`);
        if (!item) return undefined;
        try {
          return this.drafts.mapItem(item);
        } catch (error) {
          if (!(error instanceof DataIntegrityError)) throw error;
          logCorruptStoredItem(error);
          return undefined;
        }
      };
      for (const id of legacyIds) {
        const draft = read(this.metaKey(id));
        if (!draft) continue;
        computed.set(
          id,
          this.flag(draft, read(this.publishedKey(id))).hasUnpublishedChanges ??
            false,
        );
      }
    }
    return rows.map((r) => ({
      ...r,
      hasUnpublishedChanges:
        r.status === 'published' &&
        (r.hasUnpublishedChanges ?? computed.get(idOf(r)) ?? false),
    }));
  }

  /** Claims the slug in the same transaction when the entity has one. */
  async insertDraft(entity: T): Promise<T> {
    const claims = this.slugClaims();
    const meta = {
      TableName: this.tableName,
      Item: this.config.toItem(entity),
      ConditionExpression: 'attribute_not_exists(pk)',
    };
    if (!claims) {
      await runDynamoWrite(
        () => this.doc.send(new PutCommand(meta)),
        `Create conflict (${this.config.conflictLabel})`,
      );
      return entity;
    }
    const { id, slug } = entity as unknown as Slugged;
    const slugTaken = `Slug "${slug}" is already taken`;
    await runDynamoWrite(
      () =>
        this.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              buildSlugClaimPut(this.tableName, claims, slug, id),
              { Put: meta },
            ],
          }),
        ),
      slugTaken,
      { uniqueClaimIndexes: [0], uniqueClaimMessage: slugTaken },
    );
    return entity;
  }

  /** `build` edits content; version, `updatedAt` and the unpublished flag are set here. */
  async mutate(
    id: string,
    expectedVersion: number,
    build: (existing: T) => T,
  ): Promise<T> {
    const loaded = await this.loadOrThrow(id);
    return this.mutateLoaded(loaded, expectedVersion, build);
  }

  async mutateLoaded(
    loaded: LoadedPair<T>,
    expectedVersion: number,
    build: (existing: T) => T,
  ): Promise<T> {
    const existing = this.flag(loaded.draft, loaded.published);
    assertExpectedVersion(existing, expectedVersion);
    const next = this.flag(
      {
        ...build(existing),
        updatedAt: this.now(),
        version: existing.version + 1,
      },
      loaded.published,
    );
    await this.persistMutation(existing, next, {});
    return next;
  }

  async softDelete(id: string, expectedVersion: number): Promise<T> {
    const loaded = await this.loadOrThrow(id);
    const existing = this.flag(loaded.draft, loaded.published);
    assertExpectedVersion(existing, expectedVersion);
    const next: T = {
      ...existing,
      status: 'deleted',
      updatedAt: this.now(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.persistMutation(existing, next, {
      deletePublished: loaded.published !== undefined,
      previousPublished: loaded.published,
    });
    return next;
  }

  async publish(
    id: string,
    expectedVersion: number,
    options?: { publishedAt?: string },
  ): Promise<T> {
    const loaded = await this.loadOrThrow(id);
    return this.publishLoaded(loaded, expectedVersion, options);
  }

  async publishLoaded(
    loaded: LoadedPair<T>,
    expectedVersion: number,
    options?: { publishedAt?: string },
  ): Promise<T> {
    const existing = this.flag(loaded.draft, loaded.published);
    assertExpectedVersion(existing, expectedVersion);
    this.config.validatePublish?.(existing);
    const published = loaded.published;
    if (
      existing.status === 'published' &&
      published &&
      this.config.contentEqual(existing, published)
    ) {
      return this.flag(existing, published);
    }
    const updatedAt = this.now();
    const next: T = {
      ...existing,
      status: 'published',
      publishedAt: existing.publishedAt ?? options?.publishedAt ?? updatedAt,
      updatedAt,
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.persistMutation(existing, next, {
      syncPublished: true,
      previousPublished: published,
    });
    return this.flag(next, next);
  }

  async unpublish(id: string, expectedVersion: number): Promise<T> {
    const loaded = await this.loadOrThrow(id);
    return this.unpublishLoaded(loaded, expectedVersion);
  }

  async unpublishLoaded(
    loaded: LoadedPair<T>,
    expectedVersion: number,
  ): Promise<T> {
    const existing = this.flag(loaded.draft, loaded.published);
    assertExpectedVersion(existing, expectedVersion);
    if (existing.status !== 'published') {
      return this.flag(existing, undefined);
    }
    const next: T = {
      ...existing,
      status: 'draft',
      updatedAt: this.now(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.persistMutation(existing, next, {
      deletePublished: true,
      previousPublished: loaded.published,
    });
    return next;
  }

  async discard(id: string, expectedVersion: number): Promise<T> {
    const loaded = await this.loadOrThrow(id);
    return this.discardLoaded(loaded, expectedVersion);
  }

  async discardLoaded(
    loaded: LoadedPair<T>,
    expectedVersion: number,
  ): Promise<T> {
    const existing = this.flag(loaded.draft, loaded.published);
    assertExpectedVersion(existing, expectedVersion);
    const published = loaded.published;
    if (!published || this.config.contentEqual(existing, published)) {
      return this.flag(existing, published);
    }
    const next: T = {
      ...published,
      status: 'published',
      publishedAt: existing.publishedAt ?? published.publishedAt,
      updatedAt: this.now(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.persistMutation(existing, next, {});
    return this.flag(next, published);
  }

  /**
   * The versioned META Put is always item 0. Slug rows, the PUBLISHED row and
   * `extraMutationItems` join it in one transaction; alone it is a plain Put.
   */
  private async persistMutation(
    before: T,
    after: T,
    options: PersistPublishOptions<T>,
  ): Promise<void> {
    const id = this.config.idOf(after);
    const claims = this.slugClaims();
    const sluggedBefore = before as unknown as Slugged;
    const sluggedAfter = after as unknown as Slugged;
    const meta = {
      TableName: this.tableName,
      Item: this.config.toItem(after),
      ConditionExpression: VERSION_MATCH_CONDITION,
      ExpressionAttributeValues: versionMatchValues(before.version),
    };
    const items: TransactItem[] = [{ Put: meta }];
    const claimIndexes: number[] = [];
    if (claims && sluggedBefore.slug !== sluggedAfter.slug) {
      items.push(
        ...buildSlugRenameItems(
          this.tableName,
          claims,
          sluggedBefore,
          sluggedAfter,
        ),
      );
      claimIndexes.push(items.length);
      items.push(
        buildSlugClaimPut(
          this.tableName,
          claims,
          sluggedAfter.slug,
          sluggedAfter.id,
        ),
      );
    }
    if (options.syncPublished) {
      items.push({
        Put: {
          TableName: this.tableName,
          Item: this.config.toPublishedItem(after),
        },
      });
    }
    if (options.deletePublished) {
      items.push({
        Delete: { TableName: this.tableName, Key: this.publishedKey(id) },
      });
    }
    if (options.syncPublished || options.deletePublished) {
      items.push(
        buildSitePublishUpdate(this.tableName, {
          idSet: this.config.publishedIdSet,
          id,
          published: options.syncPublished === true,
        }),
      );
    }
    items.push(
      ...(this.config.extraMutationItems?.(before, after, options) ?? []),
    );
    if (claims) {
      items.push(
        ...buildSoftDeleteSlugRelease(
          this.tableName,
          claims,
          sluggedBefore,
          sluggedAfter,
        ),
      );
    }
    const action = options.syncPublished
      ? 'Publish'
      : options.deletePublished
        ? 'Unpublish'
        : 'Update';
    await runVersionedWrite(
      async () => {
        if (items.length === 1) await this.doc.send(new PutCommand(meta));
        else
          // Every publish updates the one site publish row, so concurrent
          // publishes of different entities can cancel each other.
          await retryTransactionConflicts(() =>
            this.doc.send(new TransactWriteCommand({ TransactItems: items })),
          );
      },
      `${action} conflict (${this.config.conflictLabel} version)`,
      () =>
        throwVersionConflict(before.version, () =>
          this.getById(id, { consistentRead: true }),
        ),
      {
        uniqueClaimIndexes: claimIndexes,
        uniqueClaimMessage: `Slug "${sluggedAfter.slug}" is already taken`,
        versionItemIndex: 0,
      },
    );
  }
}

export type PublishableSingletonConfig<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
  TUpdate extends { version: number },
> = PublishableConfig<T, TItem> & {
  singletonId: string;
  defaultEntity: T;
  mergeUpdate: (existing: T, input: TUpdate) => T;
};

export class PublishableSingletonRepository<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
  TUpdate extends { version: number },
> {
  private readonly store: PublishableRepository<T, TItem>;

  constructor(
    private readonly config: PublishableSingletonConfig<T, TItem, TUpdate>,
    doc: DynamoDBDocumentClient = getDocClient(),
    tableName: string = requireTableName(),
    private readonly now: Clock = systemClock,
  ) {
    this.store = new PublishableRepository(config, doc, tableName, now);
  }

  async get(): Promise<T | undefined> {
    return this.store.getById(this.config.singletonId);
  }

  async getOrCreate(): Promise<T> {
    const existing = await this.get();
    if (existing) return existing;
    const seeded: T = {
      ...this.config.defaultEntity,
      status: 'draft',
      publishedAt: null,
      updatedAt: this.now(),
      version: 1,
      hasUnpublishedChanges: false,
    };
    try {
      return await this.store.insertDraft(seeded);
    } catch (error) {
      if (error instanceof ConflictError) {
        const raced = await this.get();
        if (raced) return raced;
      }
      throw error;
    }
  }

  private load(): Promise<LoadedPair<T> | undefined> {
    return this.store.loadDraftAndPublished(this.config.singletonId, {
      consistentRead: true,
    });
  }

  private async loadOrCreate(): Promise<LoadedPair<T>> {
    const loaded = await this.load();
    if (loaded) return loaded;
    await this.getOrCreate();
    const after = await this.load();
    if (!after) {
      throw new NotFoundError(
        `${this.config.conflictLabel} ${this.config.singletonId} not found`,
      );
    }
    return after;
  }

  async update(input: TUpdate): Promise<T> {
    const loaded = (await this.load()) ?? {
      draft: await this.getOrCreate(),
      published: undefined,
    };
    return this.store.mutateLoaded(loaded, input.version, (existing) =>
      this.config.mergeUpdate(existing, input),
    );
  }

  async publish(
    expectedVersion: number,
    options?: { publishedAt?: string },
  ): Promise<T> {
    const loaded = await this.loadOrCreate();
    return this.store.publishLoaded(loaded, expectedVersion, options);
  }

  async unpublish(expectedVersion: number): Promise<T> {
    const loaded = await this.loadOrCreate();
    return this.store.unpublishLoaded(loaded, expectedVersion);
  }

  async discard(expectedVersion: number): Promise<T> {
    const loaded = await this.loadOrCreate();
    return this.store.discardLoaded(loaded, expectedVersion);
  }
}
