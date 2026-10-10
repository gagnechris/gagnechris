export { APEX_DOMAIN } from './site-config.js';

export const POWERTOOLS_METRICS_NAMESPACE = 'gagnechris' as const;
export const API_SERVICE_NAME = 'gagnechris-api' as const;
export const PUBLISHER_SERVICE_NAME = 'gagnechris-publisher' as const;
export const RESTORE_TEST_SERVICE_NAME = 'gagnechris-restore-test' as const;

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
  'resume',
  'contact',
  'note',
  'task',
  'dailyNoteClaim',
  'dailyTemplate',
] as const;

/**
 * Types whose rows carry `createdAt` or `updatedAt`, so the source can say
 * which rows provably existed at the restore point. Daily claims have neither.
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
