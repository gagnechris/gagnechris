export {
  DYNAMO_MAX_ATTEMPTS,
  getDocClient,
  requireTableName,
  setDocClient,
} from './client.js';

export {
  batchGetAll,
  batchGetAllWithDocClient,
  classifyDynamoWriteError,
  dynamoErrorName,
  isOptimisticLockConflict,
  transactionCancellationCodes,
  BATCH_GET_MAX_ATTEMPTS,
  type BatchGetOutput,
  type BatchGetRequestItems,
  type BatchGetSend,
  type BatchGetDocClientSend,
  type BatchGetTableRequest,
  type DynamoWriteErrorKind,
} from './dynamodb.js';

export * from './keys.js';

export {
  APP_TABLE,
  LAST_DEPLOYED_GSIS,
  appTableAttributeDefinitions,
  appTableName,
  assertAppTableGsiUpdateSafe,
  assertSafeGsiUpdate,
  gsiProjection,
  tableIndexesFromDescribeTable,
  type AppTableDefinition,
  type DynamoAttributeTypeCode,
  type DynamoProjectionType,
  type TableIndexDefinition,
  type TableKeyAttribute,
} from './table.js';

export {
  PUBLISH_STREAM_SK,
  isPublishRelevant,
  isPublishRelevantAdminMutation,
  type DynamoStreamKeyImage,
} from './publish-relevance.js';

export * from './items.js';
