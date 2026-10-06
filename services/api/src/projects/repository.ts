import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  GSI1_NAME,
  buildProjectMetaItem,
  buildProjectPublishedItem,
  keys,
  metaToProject,
  parseProjectListRow,
  parseProjectMetaItem,
  projectContentEqual,
  projectStatusGsi1Pk,
  slugify,
  type ProjectMetaItem,
} from '@gagnechris/data';
import {
  projectPublishFieldErrors,
  sortProjectsByOrder,
  type CreateProjectRequest,
  type Project,
  type UpdateProjectRequest,
} from '@gagnechris/shared';
import { ulid } from 'ulid';
import { getDocClient, requireTableName } from '../data/client.js';
import { systemClock, type Clock } from '../data/clock.js';
import { GSI1_CURSOR_KEYS } from '../data/cursor.js';
import { BadRequestError } from '../data/errors.js';
import { PublishableRepository } from '../data/publishable-repository.js';
import { PROJECT_SLUG_CLAIMS } from '../data/slug-claims.js';

/** Projects are a short hand-curated list; one admin page holds them all. */
export const PROJECT_LIST_MAX = 500;

type ListableStatus = 'published' | 'draft';

const normalizeStack = (stack: readonly string[]): string[] => [
  ...new Set(stack.map((s) => s.trim()).filter(Boolean)),
];

function assertPublishable(project: Project): void {
  const fields = projectPublishFieldErrors(project);
  if (Object.keys(fields).length > 0) {
    throw new BadRequestError(
      'A project with a demo needs a preview image before it is published',
      fields,
    );
  }
}

export class ProjectsRepository extends PublishableRepository<
  Project,
  ProjectMetaItem
> {
  constructor(
    doc: DynamoDBDocumentClient = getDocClient(),
    tableName: string = requireTableName(),
    now: Clock = systemClock,
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
        publishedIdSet: 'projectIds',
        cursorKeyNames: GSI1_CURSOR_KEYS,
        slugClaims: PROJECT_SLUG_CLAIMS,
        validatePublish: assertPublishable,
      },
      doc,
      tableName,
      now,
    );
  }

  async list(status?: ListableStatus): Promise<{ items: Project[] }> {
    const statuses: ListableStatus[] = status
      ? [status]
      : ['published', 'draft'];
    const flagged: Project[] = [];
    for (const s of statuses) {
      flagged.push(...(await this.queryStatus(s)));
    }
    return {
      items: statuses.flatMap((s) =>
        sortProjectsByOrder(flagged.filter((p) => p.status === s)),
      ),
    };
  }

  private async queryStatus(status: ListableStatus): Promise<Project[]> {
    const pk = projectStatusGsi1Pk(status);
    const out: Project[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.queryListPage(
        {
          IndexName: GSI1_NAME,
          KeyConditionExpression: 'gsi1pk = :pk',
          ExpressionAttributeValues: { ':pk': pk },
          cursor,
        },
        { parse: parseProjectListRow, idOf: (row) => row.id },
      );
      out.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor && out.length < PROJECT_LIST_MAX);
    return out;
  }

  async create(input: CreateProjectRequest): Promise<Project> {
    const name = input.name.trim();
    return this.insertDraft({
      id: ulid(),
      slug: slugify(input.slug?.trim() || name),
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
      updatedAt: this.now(),
      version: 1,
      hasUnpublishedChanges: false,
    });
  }

  async update(id: string, input: UpdateProjectRequest): Promise<Project> {
    return this.mutate(id, input.version, (existing) => ({
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
    }));
  }
}
