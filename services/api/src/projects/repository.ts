import {
  BatchGetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  GSI1_NAME,
  SK_META,
  batchGetAllWithDocClient,
  buildProjectMetaItem,
  buildProjectPublishedItem,
  keys,
  metaToProject,
  parseProjectMetaItem,
  projectContentEqual,
  projectStatusGsi1Pk,
  slugify,
  type ProjectMetaItem,
} from '@gagnechris/data';
import {
  sortProjectsByOrder,
  type CreateProjectRequest,
  type Project,
  type UpdateProjectRequest,
} from '@gagnechris/shared';
import { ulid } from 'ulid';
import { getDocClient, requireTableName } from '../data/client.js';
import { logCorruptStoredItem } from '../data/corrupt-item.js';
import { GSI1_CURSOR_KEYS } from '../data/cursor.js';
import { runDynamoWrite } from '../data/dynamo-write.js';
import { DataIntegrityError, NotFoundError } from '../data/errors.js';
import {
  PublishableRepository,
  assertExpectedVersion,
  nowIso,
  withUnpublishedFlag,
  type PersistPublishOptions,
} from '../data/publishable-repository.js';
import {
  PROJECT_SLUG_CLAIMS,
  buildSlugChangeItems,
  buildSlugClaimPut,
  buildSoftDeleteSlugRelease,
  slugClaimIndexesOf,
  type TransactItem,
} from '../data/slug-claims.js';
import {
  VERSION_MATCH_CONDITION,
  runVersionedWrite,
  throwVersionConflict,
  versionMatchValues,
} from '../data/version-condition.js';

/** Projects are a short hand-curated list; one admin page holds them all. */
export const PROJECT_LIST_MAX = 500;

type ListableStatus = 'published' | 'draft';

const normalizeStack = (stack: readonly string[]): string[] => [
  ...new Set(stack.map((s) => s.trim()).filter(Boolean)),
];

export class ProjectsRepository extends PublishableRepository<
  Project,
  ProjectMetaItem
> {
  constructor(
    doc: DynamoDBDocumentClient = getDocClient(),
    tableName: string = requireTableName(),
  ) {
    super(
      {
        conflictLabel: 'Project',
        keysFor: (id) => {
          const meta = keys.project.meta(id);
          return {
            pk: meta.pk,
            metaSk: meta.sk,
            publishedSk: keys.project.published(id).sk,
          };
        },
        idOf: (p) => p.id,
        toEntity: (item, hasUnpublishedChanges) =>
          metaToProject(parseProjectMetaItem(item), hasUnpublishedChanges),
        toItem: buildProjectMetaItem,
        toPublishedItem: buildProjectPublishedItem,
        contentEqual: projectContentEqual,
        isDeleted: (p) => p.status === 'deleted',
        cursorKeyNames: GSI1_CURSOR_KEYS,
      },
      doc,
      tableName,
    );
  }

  async persistMutation(
    before: Project,
    after: Project,
    options: PersistPublishOptions<Project>,
  ): Promise<void> {
    const items: TransactItem[] = [
      {
        Put: {
          TableName: this.tableName,
          Item: buildProjectMetaItem(after),
          ConditionExpression: VERSION_MATCH_CONDITION,
          ExpressionAttributeValues: versionMatchValues(before.version),
        },
      },
      ...buildSlugChangeItems(
        this.tableName,
        before,
        after,
        PROJECT_SLUG_CLAIMS,
      ),
    ];
    if (options.syncPublished) {
      items.push({
        Put: {
          TableName: this.tableName,
          Item: buildProjectPublishedItem(after),
        },
      });
    }
    if (options.deletePublished) {
      items.push({
        Delete: {
          TableName: this.tableName,
          Key: keys.project.published(after.id),
        },
      });
    }
    items.push(
      ...buildSoftDeleteSlugRelease(
        this.tableName,
        before,
        after,
        PROJECT_SLUG_CLAIMS,
      ),
    );
    await runVersionedWrite(
      () => this.doc.send(new TransactWriteCommand({ TransactItems: items })),
      'Update conflict (Project version)',
      () =>
        throwVersionConflict(before.version, () =>
          this.getById(after.id, { consistentRead: true }),
        ),
      {
        slugClaimIndexes: slugClaimIndexesOf(items),
        slugTakenMessage: `Slug "${after.slug}" is already taken`,
        versionItemIndex: 0,
      },
    );
  }

  async list(status?: ListableStatus): Promise<{ items: Project[] }> {
    const statuses: ListableStatus[] = status
      ? [status]
      : ['published', 'draft'];
    const drafts: Project[] = [];
    for (const s of statuses) {
      drafts.push(...(await this.queryStatus(s)));
    }
    const published = await this.batchGetPublished(
      drafts.filter((d) => d.status === 'published').map((d) => d.id),
    );
    const flagged = drafts.map((d) =>
      withUnpublishedFlag(
        d,
        d.status === 'published' ? published.get(d.id) : undefined,
        projectContentEqual,
      ),
    );
    const ordered: Project[] = [];
    for (const s of statuses) {
      ordered.push(
        ...sortProjectsByOrder(flagged.filter((p) => p.status === s)),
      );
    }
    return { items: ordered };
  }

  private async queryStatus(status: ListableStatus): Promise<Project[]> {
    const out: Project[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: GSI1_NAME,
          KeyConditionExpression: 'gsi1pk = :pk',
          ExpressionAttributeValues: { ':pk': projectStatusGsi1Pk(status) },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of page.Items ?? []) {
        if (item.entityType !== 'project' || item.sk !== SK_META) continue;
        const project = this.parseOrLog(item);
        if (project && project.status !== 'deleted') out.push(project);
      }
      startKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (startKey && out.length < PROJECT_LIST_MAX);
    return out;
  }

  private async batchGetPublished(
    ids: string[],
  ): Promise<Map<string, Project>> {
    const map = new Map<string, Project>();
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      const responses = await batchGetAllWithDocClient(
        async (RequestItems) =>
          this.doc.send(new BatchGetCommand({ RequestItems })),
        {
          [this.tableName]: {
            Keys: chunk.map((id) => keys.project.published(id)),
          },
        },
      );
      for (const item of responses[this.tableName] ?? []) {
        const project = this.parseOrLog(item);
        if (project) map.set(project.id, project);
      }
    }
    return map;
  }

  private parseOrLog(item: Record<string, unknown>): Project | undefined {
    try {
      return metaToProject(parseProjectMetaItem(item));
    } catch (error) {
      logCorruptStoredItem(
        new DataIntegrityError('Corrupt stored Project', {
          pk: typeof item.pk === 'string' ? item.pk : undefined,
          sk: typeof item.sk === 'string' ? item.sk : undefined,
          cause: error,
        }),
      );
      return undefined;
    }
  }

  async create(input: CreateProjectRequest): Promise<Project> {
    const id = ulid();
    const name = input.name.trim();
    const slug = slugify(input.slug?.trim() || name);
    const project: Project = {
      id,
      slug,
      name,
      pitch: input.pitch ?? '',
      stage: input.stage ?? 'idea',
      stageNote: input.stageNote ?? '',
      previewImage: input.previewImage ?? null,
      bodyMarkdown: input.bodyMarkdown ?? '',
      stack: normalizeStack(input.stack ?? []),
      links: input.links ?? [],
      demo: input.demo ?? null,
      order: input.order ?? 0,
      href: input.href ?? null,
      status: 'draft',
      publishedAt: null,
      updatedAt: nowIso(),
      version: 1,
      hasUnpublishedChanges: false,
    };
    await runDynamoWrite(
      () =>
        this.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              buildSlugClaimPut(this.tableName, PROJECT_SLUG_CLAIMS, slug, id),
              {
                Put: {
                  TableName: this.tableName,
                  Item: buildProjectMetaItem(project),
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
            ],
          }),
        ),
      `Slug "${slug}" is already taken`,
      {
        slugClaimIndexes: [0],
        slugTakenMessage: `Slug "${slug}" is already taken`,
      },
    );
    return project;
  }

  async update(id: string, input: UpdateProjectRequest): Promise<Project> {
    const loaded = await this.loadDraftAndPublished(id, {
      consistentRead: true,
    });
    if (!loaded) throw new NotFoundError(`Project ${id} not found`);
    const existing = withUnpublishedFlag(
      loaded.draft,
      loaded.published,
      projectContentEqual,
    );
    assertExpectedVersion(existing, input.version);
    const next: Project = {
      ...existing,
      name: input.name?.trim() ?? existing.name,
      slug: input.slug ? slugify(input.slug) : existing.slug,
      pitch: input.pitch ?? existing.pitch,
      stage: input.stage ?? existing.stage,
      stageNote: input.stageNote ?? existing.stageNote,
      previewImage:
        input.previewImage !== undefined
          ? input.previewImage
          : existing.previewImage,
      bodyMarkdown: input.bodyMarkdown ?? existing.bodyMarkdown,
      stack: input.stack ? normalizeStack(input.stack) : existing.stack,
      links: input.links ?? existing.links,
      demo: input.demo !== undefined ? input.demo : existing.demo,
      order: input.order ?? existing.order,
      href: input.href !== undefined ? input.href : existing.href,
      updatedAt: nowIso(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.persistMutation(existing, next, {});
    return withUnpublishedFlag(next, loaded.published, projectContentEqual);
  }

  async softDelete(id: string, expectedVersion: number): Promise<Project> {
    const loaded = await this.loadDraftAndPublished(id, {
      consistentRead: true,
    });
    if (!loaded) throw new NotFoundError(`Project ${id} not found`);
    const existing = withUnpublishedFlag(
      loaded.draft,
      loaded.published,
      projectContentEqual,
    );
    assertExpectedVersion(existing, expectedVersion);
    const next: Project = {
      ...existing,
      status: 'deleted',
      updatedAt: nowIso(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.persistMutation(existing, next, {
      deletePublished: loaded.published !== undefined,
      previousPublished: loaded.published,
    });
    return next;
  }
}
