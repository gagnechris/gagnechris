export const APEX_DOMAIN = 'gagnechris.com' as const;

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
