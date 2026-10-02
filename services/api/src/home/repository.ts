import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_HOME,
  type Home,
  type UpdateHomeRequest,
} from '@gagnechris/shared';
import { getDocClient, requireTableName } from '../data/client.js';
import { PublishableSingletonRepository } from '../data/publishable-repository.js';
import {
  buildHomeMetaItem,
  buildHomePublishedItem,
  homeContentEqual,
  homeMetaSk,
  homePk,
  homePublishedSk,
  HOME_ID,
  metaToHome,
  parseHomeMetaItem,
  type HomeMetaItem,
} from '@gagnechris/data';

export class HomeRepository extends PublishableSingletonRepository<
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
        singletonId: HOME_ID,
        defaultEntity: DEFAULT_HOME,
        keysFor: () => ({
          pk: homePk(),
          metaSk: homeMetaSk(),
          publishedSk: homePublishedSk(),
        }),
        idOf: () => HOME_ID,
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
