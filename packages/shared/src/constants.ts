export { APEX_DOMAIN } from './site-config.js';

export const POWERTOOLS_METRICS_NAMESPACE = 'gagnechris' as const;
export const API_SERVICE_NAME = 'gagnechris-api' as const;
export const PUBLISHER_SERVICE_NAME = 'gagnechris-publisher' as const;
export const RESTORE_TEST_SERVICE_NAME = 'gagnechris-restore-test' as const;
export const NOTEBOOK_RECAP_SERVICE_NAME = 'gagnechris-notebook-recap' as const;

export const CONTACT_PER_IP_PER_HOUR = 3;
/** Notebook image upload URLs one user can get per UTC day. */
export const NOTEBOOK_IMAGE_UPLOADS_PER_USER_PER_DAY = 200;
/** Each weekly recap is a model call, so one user's requests per UTC day are capped. */
export const NOTEBOOK_RECAPS_PER_USER_PER_DAY = 10;
/** Shared by contact + resume notify; well under the SES sandbox 200/day. */
export const SES_GLOBAL_DAILY_CAP = 100;
/** Resume notices stop once the shared count reaches this, leaving the rest for contact messages. */
export const RESUME_NOTIFY_SES_DAILY_CAP = 50;
/** Contact submits faster than this are treated as bots. */
export const MIN_CONTACT_SUBMIT_MS = 2_000;

/**
 * CloudFront sends the API origin secret in this header, so the API knows a
 * request came through the distribution and not straight to execute-api.
 */
export const API_ORIGIN_VERIFY_HEADER = 'x-origin-verify';
/** The viewer's address, set by the /api/* viewer-request function; trusted only with the origin secret. */
export const API_VIEWER_ADDRESS_HEADER = 'x-viewer-address';

/** EMF metric names the API Lambda emits under API_SERVICE_NAME; the API stack alarms on some. */
export const API_METRICS = {
  handlerError: 'HandlerError',
  dataIntegrityError: 'DataIntegrityError',
  writeConflict: 'WriteConflict',
  syncAdapterMissing: 'SyncAdapterMissing',
  syncCorruptRow: 'SyncCorruptRow',
  contactEmailFailed: 'ContactEmailFailed',
  contactEmailStatusUpdateFailed: 'ContactEmailStatusUpdateFailed',
  sesCapReached: 'SesCapReached',
  notFound: 'NotFound',
  methodNotAllowed: 'MethodNotAllowed',
} as const;

/** EMF metric names the restore-test Lambda emits and Data-prod alarms on. */
export const RESTORE_TEST_METRICS = {
  validationSucceeded: 'RestoreValidationSucceeded',
  validationFailed: 'RestoreValidationFailed',
  leftoverTables: 'LeftoverRestoreTables',
  staleRecoveryPoint: 'StaleRecoveryPoint',
  validationMissing: 'RestoreValidationMissing',
  advancedBackupDisabled: 'AdvancedDynamoDbBackupDisabled',
  backupCheckCompleted: 'BackupCheckCompleted',
} as const;

/** AWS Backup names restore-test scratch tables with this prefix. */
export const RESTORE_TEST_TABLE_PREFIX = 'awsbackup-restore-test-' as const;

/** Entity types whose rows the restore-test validator checks against their item schema and key builders. */
export const RESTORE_TEST_SCHEMA_CHECKED_ENTITY_TYPES = [
  'post',
  'project',
  'home',
  'removedUser',
  'userRevocation',
  'resume',
  'contact',
  'note',
  'task',
  'dailyNoteClaim',
  'dailyTemplate',
  'noteTemplate',
  'notebookAreas',
] as const;

/**
 * Types whose rows carry `createdAt` or `updatedAt`, so the source can say
 * which rows provably existed at the restore point. Daily claims and user
 * revocations (which expire) have neither.
 */
export const RESTORE_TEST_COUNT_FLOOR_ENTITY_TYPES = [
  'post',
  'project',
  'home',
  'resume',
  'contact',
  'removedUser',
  'note',
  'task',
  'dailyTemplate',
  'noteTemplate',
  'notebookAreas',
] as const;

/**
 * The only attributes the restore-test validator's COUNT scans of the live
 * table may name; its IAM condition allows exactly these.
 */
export const RESTORE_TEST_SOURCE_COUNT_ATTRIBUTES = [
  'pk',
  'sk',
  'entityType',
  'createdAt',
  'updatedAt',
] as const;

export const PROJECT_DEMO_IDS = ['posts', 'notebook'] as const;
