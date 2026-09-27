import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_RESUME,
  type Resume,
  type UpdateResumeRequest,
} from '@gagnechris/shared';
import { getDocClient, requireTableName } from '../data/client.js';
import { SingletonRepository } from '../data/singleton-repository.js';
import {
  buildResumeMetaItem,
  buildResumePublishedItem,
  metaToResume,
  resumeContentEqual,
  resumeMetaSk,
  resumePk,
  resumePublishedSk,
  type ResumeMetaItem,
} from './keys.js';

export class ResumeRepository extends SingletonRepository<
  Resume,
  ResumeMetaItem,
  UpdateResumeRequest
> {
  constructor(
    doc: DynamoDBDocumentClient = getDocClient(),
    tableName: string = requireTableName(),
  ) {
    super(
      {
        conflictLabel: 'resume',
        defaultEntity: DEFAULT_RESUME,
        pk: resumePk,
        metaSk: resumeMetaSk,
        publishedSk: resumePublishedSk,
        toEntity: metaToResume,
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
    );
  }
}
