import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_RESUME,
  type Resume,
  type UpdateResumeRequest,
} from '@gagnechris/shared';
import { getDocClient, requireTableName } from '../data/client.js';
import { systemClock, type Clock } from '../data/clock.js';
import { PublishableSingletonRepository } from '../data/publishable-repository.js';
import {
  buildResumeMetaItem,
  buildResumePublishedItem,
  metaToResume,
  parseResumeMetaItem,
  resumeContentEqual,
  resumeMetaSk,
  resumePk,
  resumePublishedSk,
  RESUME_ID,
  type ResumeMetaItem,
} from '@gagnechris/data';

export class ResumeRepository extends PublishableSingletonRepository<
  Resume,
  ResumeMetaItem,
  UpdateResumeRequest
> {
  constructor(
    doc: DynamoDBDocumentClient = getDocClient(),
    tableName: string = requireTableName(),
    now: Clock = systemClock,
  ) {
    super(
      {
        conflictLabel: 'resume',
        singletonId: RESUME_ID,
        defaultEntity: DEFAULT_RESUME,
        keysFor: () => ({
          pk: resumePk(),
          metaSk: resumeMetaSk(),
          publishedSk: resumePublishedSk(),
        }),
        idOf: () => RESUME_ID,
        toEntity: (item, hasUnpublishedChanges) =>
          metaToResume(parseResumeMetaItem(item), hasUnpublishedChanges),
        toItem: buildResumeMetaItem,
        toPublishedItem: buildResumePublishedItem,
        contentEqual: resumeContentEqual,
        mergeUpdate: (existing, input) => ({
          ...existing,
          name: input.name ?? existing.name,
          pdfPath: input.pdfPath ?? existing.pdfPath,
          content: input.content ?? existing.content,
          seo: input.seo !== undefined ? input.seo : existing.seo,
        }),
      },
      doc,
      tableName,
      now,
    );
  }
}
