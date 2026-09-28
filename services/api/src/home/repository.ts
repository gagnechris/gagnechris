import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_HOME,
  type Home,
  type UpdateHomeRequest,
} from '@gagnechris/shared';
import { getDocClient, requireTableName } from '../data/client.js';
import { SingletonRepository } from '../data/singleton-repository.js';
import {
  buildHomeMetaItem,
  buildHomePublishedItem,
  homeContentEqual,
  homeMetaSk,
  homePk,
  homePublishedSk,
  metaToHome,
  parseHomeMetaItem,
  type HomeMetaItem,
} from './keys.js';

export class HomeRepository extends SingletonRepository<
  Home,
  HomeMetaItem,
  UpdateHomeRequest
> {
  constructor(
    doc: DynamoDBDocumentClient = getDocClient(),
    tableName: string = requireTableName(),
  ) {
    super(
      {
        conflictLabel: 'home',
        defaultEntity: DEFAULT_HOME,
        pk: homePk,
        metaSk: homeMetaSk,
        publishedSk: homePublishedSk,
        toEntity: (item, hasUnpublishedChanges) =>
          metaToHome(parseHomeMetaItem(item), hasUnpublishedChanges),
        toItem: buildHomeMetaItem,
        toPublishedItem: buildHomePublishedItem,
        contentEqual: homeContentEqual,
        mergeUpdate: (existing, input) => ({
          ...existing,
          name: input.name ?? existing.name,
          title: input.title ?? existing.title,
          about: input.about ?? existing.about,
          seo: input.seo !== undefined ? input.seo : existing.seo,
        }),
      },
      doc,
      tableName,
    );
  }
}
