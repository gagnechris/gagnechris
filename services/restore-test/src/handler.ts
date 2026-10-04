import {
  BackupClient,
  DescribeRegionSettingsCommand,
  DescribeRestoreJobCommand,
  GetRestoreTestingPlanCommand,
  PutRestoreValidationResultCommand,
  ResourceNotFoundException as BackupResourceNotFoundException,
  paginateListRecoveryPointsByBackupVault,
  paginateListRestoreJobs,
} from '@aws-sdk/client-backup';
import {
  DescribeTableCommand,
  DynamoDBClient,
  ListTablesCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { RESTORE_TEST_METRICS } from '@gagnechris/shared';
import {
  checkBackupFreshness,
  type BackupFreshness,
  type BackupFreshnessDeps,
} from './freshness.js';
import {
  DEFAULT_LEFTOVER_MAX_AGE_HOURS,
  findLeftoverRestoreTables,
  type DescribeCreationFn,
  type LeftoverTable,
  type ListTablesFn,
} from './leftovers.js';
import { logger, metrics } from './observability.js';
import {
  finalize,
  tableNameFromArn,
  validateRestoredTable,
  type CountFn,
  type ScanFn,
  type ValidationResult,
} from './validate.js';

export type RestoreJobStateChangeEvent = {
  source: 'aws.backup';
  'detail-type': 'Restore Job State Change';
  detail: {
    restoreJobId?: string;
    status?: string;
    resourceType?: string;
    createdResourceArn?: string;
    restoreTestingPlanArn?: string;
  };
};

export type ScheduledLeftoverEvent =
  { 'detail-type': 'Scheduled Event' } | { action: 'leftoverCheck' };

export type RestoreTestEvent =
  RestoreJobStateChangeEvent | ScheduledLeftoverEvent;

export type PutValidationFn = (input: {
  restoreJobId: string;
  status: ValidationResult['status'];
  message: string;
}) => Promise<void>;

export type RestoreTestDeps = {
  scan: ScanFn;
  count: CountFn;
  sourceTableName: string;
  restorePointOf: (restoreJobId: string) => Promise<Date | undefined>;
  putValidation: PutValidationFn;
  listTables: ListTablesFn;
  describeCreation: DescribeCreationFn;
  freshness: BackupFreshnessDeps;
  now: () => Date;
};

export type ValidateOutcome = {
  kind: 'validation';
  restoreJobId: string;
  tableName?: string;
  result: ValidationResult;
};

export type LeftoverOutcome = {
  kind: 'leftoverCheck';
  leftovers: LeftoverTable[];
  freshness: BackupFreshness;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const latest = (dates: (Date | undefined)[]): Date | undefined =>
  dates.reduce<Date | undefined>(
    (max, d) => (d && (!max || d > max) ? d : max),
    undefined,
  );

function defaultDeps(): RestoreTestDeps {
  const ddb = new DynamoDBClient({});
  const doc = DynamoDBDocumentClient.from(ddb);
  const backup = new BackupClient({});
  const sourceTableArn = requireEnv('SOURCE_TABLE_ARN');
  const backupVaultName = requireEnv('BACKUP_VAULT_NAME');
  const planName = requireEnv('RESTORE_TESTING_PLAN_NAME');
  const planArn = requireEnv('RESTORE_TESTING_PLAN_ARN');
  return {
    sourceTableName: requireEnv('SOURCE_TABLE_NAME'),
    count: async (input) => {
      const out = await doc.send(new ScanCommand(input));
      return {
        Count: out.Count,
        LastEvaluatedKey: out.LastEvaluatedKey as
          Record<string, unknown> | undefined,
      };
    },
    restorePointOf: async (restoreJobId) => {
      const out = await backup.send(
        new DescribeRestoreJobCommand({ RestoreJobId: restoreJobId }),
      );
      return out.RecoveryPointCreationDate;
    },
    freshness: {
      newestRecoveryPoint: async (createdAfter) => {
        const dates: (Date | undefined)[] = [];
        for await (const page of paginateListRecoveryPointsByBackupVault(
          { client: backup },
          {
            BackupVaultName: backupVaultName,
            ByResourceArn: sourceTableArn,
            ByCreatedAfter: createdAfter,
          },
        )) {
          for (const rp of page.RecoveryPoints ?? []) {
            if (rp.Status === 'COMPLETED') dates.push(rp.CreationDate);
          }
        }
        return latest(dates);
      },
      newestSuccessfulValidation: async (createdAfter) => {
        const dates: (Date | undefined)[] = [];
        for await (const page of paginateListRestoreJobs(
          { client: backup },
          { ByRestoreTestingPlanArn: planArn, ByCreatedAfter: createdAfter },
        )) {
          for (const job of page.RestoreJobs ?? []) {
            if (job.ValidationStatus === 'SUCCESSFUL') {
              dates.push(job.CreationDate);
            }
          }
        }
        return latest(dates);
      },
      restoreTestingPlanCreatedAt: async () => {
        try {
          const out = await backup.send(
            new GetRestoreTestingPlanCommand({
              RestoreTestingPlanName: planName,
            }),
          );
          return out.RestoreTestingPlan?.CreationTime;
        } catch (error) {
          if (error instanceof BackupResourceNotFoundException)
            return undefined;
          throw error;
        }
      },
      dynamoDbAdvancedBackupEnabled: async () => {
        const out = await backup.send(new DescribeRegionSettingsCommand({}));
        return out.ResourceTypeManagementPreference?.DynamoDB === true;
      },
    },
    scan: async (input) => {
      const out = await doc.send(new ScanCommand(input));
      return {
        Items: out.Items as Record<string, unknown>[] | undefined,
        LastEvaluatedKey: out.LastEvaluatedKey as
          Record<string, unknown> | undefined,
      };
    },
    putValidation: async ({ restoreJobId, status, message }) => {
      await backup.send(
        new PutRestoreValidationResultCommand({
          RestoreJobId: restoreJobId,
          ValidationStatus: status,
          ValidationStatusMessage: message,
        }),
      );
    },
    listTables: async (start) =>
      ddb.send(new ListTablesCommand({ ExclusiveStartTableName: start })),
    describeCreation: async (tableName) => {
      try {
        const out = await ddb.send(
          new DescribeTableCommand({ TableName: tableName }),
        );
        return out.Table?.CreationDateTime;
      } catch (error) {
        if (error instanceof ResourceNotFoundException) return undefined;
        throw error;
      }
    },
    now: () => new Date(),
  };
}

let deps: RestoreTestDeps | undefined;

export function setRestoreTestDepsForTests(
  next: RestoreTestDeps | undefined,
): void {
  deps = next;
}

function getDeps(): RestoreTestDeps {
  deps ??= defaultDeps();
  return deps;
}

function isRestoreJobEvent(
  event: RestoreTestEvent,
): event is RestoreJobStateChangeEvent {
  return (
    'detail-type' in event &&
    event['detail-type'] === 'Restore Job State Change'
  );
}

function isLeftoverEvent(event: RestoreTestEvent): boolean {
  return (
    ('detail-type' in event && event['detail-type'] === 'Scheduled Event') ||
    ('action' in event && event.action === 'leftoverCheck')
  );
}

export async function handleRestoreJob(
  event: RestoreJobStateChangeEvent,
  d: RestoreTestDeps = getDeps(),
): Promise<ValidateOutcome | undefined> {
  const { restoreJobId, status, createdResourceArn } = event.detail;
  if (!restoreJobId) {
    throw new Error('Restore Job State Change event without restoreJobId');
  }
  if (status !== 'COMPLETED') {
    logger.info('Ignoring restore job event', { restoreJobId, status });
    return undefined;
  }
  const tableName = tableNameFromArn(createdResourceArn);
  let result: ValidationResult;
  if (!tableName) {
    result = finalize({
      itemCount: 0,
      schemaChecked: 0,
      problems: ['event has no DynamoDB createdResourceArn'],
    });
  } else {
    try {
      const restorePoint = await d.restorePointOf(restoreJobId);
      result = await validateRestoredTable(
        d.scan,
        tableName,
        restorePoint
          ? {
              floor: {
                count: d.count,
                sourceTable: d.sourceTableName,
                restorePoint,
              },
            }
          : {},
      );
      if (!restorePoint) {
        result = finalize({
          ...result,
          problems: [
            ...result.problems,
            'restore job has no recovery point date; count floor not checked',
          ],
        });
      }
    } catch (error) {
      // A validator that cannot read the table is a failed test, not a retry.
      const name = error instanceof Error ? error.name : 'Error';
      logger.error('Restore validation threw', { restoreJobId, error });
      result = finalize({
        itemCount: 0,
        schemaChecked: 0,
        problems: [`validator error reading ${tableName}: ${name}`],
      });
    }
  }

  // Report first: the status can be set only once, and setting it lets AWS
  // Backup delete the scratch table now instead of at the window's end.
  await d.putValidation({
    restoreJobId,
    status: result.status,
    message: result.message,
  });

  logger.info('Restore validation reported', {
    restoreJobId,
    tableName,
    status: result.status,
    itemCount: result.itemCount,
    schemaChecked: result.schemaChecked,
    problems: result.problems.length,
    floorChecked: result.floorChecked === true,
  });
  metrics.addMetric(
    result.status === 'SUCCESSFUL'
      ? RESTORE_TEST_METRICS.validationSucceeded
      : RESTORE_TEST_METRICS.validationFailed,
    MetricUnit.Count,
    1,
  );
  metrics.publishStoredMetrics();
  return { kind: 'validation', restoreJobId, tableName, result };
}

export async function handleLeftoverCheck(
  d: RestoreTestDeps = getDeps(),
): Promise<LeftoverOutcome> {
  const maxAgeHours =
    Number(process.env.LEFTOVER_MAX_AGE_HOURS) ||
    DEFAULT_LEFTOVER_MAX_AGE_HOURS;
  const leftovers = await findLeftoverRestoreTables(d, d.now(), maxAgeHours);
  if (leftovers.length > 0) {
    logger.warn('Leftover restore scratch tables', { leftovers, maxAgeHours });
  } else {
    logger.info('No leftover restore scratch tables', { maxAgeHours });
  }
  metrics.addMetric(
    RESTORE_TEST_METRICS.leftoverTables,
    MetricUnit.Count,
    leftovers.length,
  );
  metrics.publishStoredMetrics();

  const freshness = await checkBackupFreshness(d.freshness, d.now());
  const log =
    freshness.staleRecoveryPoint ||
    freshness.validationMissing ||
    freshness.advancedBackupDisabled
      ? logger.warn.bind(logger)
      : logger.info.bind(logger);
  log('Backup freshness', { ...freshness });
  const flag = (on: boolean) => (on ? 1 : 0);
  metrics.addMetric(
    RESTORE_TEST_METRICS.staleRecoveryPoint,
    MetricUnit.Count,
    flag(freshness.staleRecoveryPoint),
  );
  metrics.addMetric(
    RESTORE_TEST_METRICS.validationMissing,
    MetricUnit.Count,
    flag(freshness.validationMissing),
  );
  metrics.addMetric(
    RESTORE_TEST_METRICS.advancedBackupDisabled,
    MetricUnit.Count,
    flag(freshness.advancedBackupDisabled),
  );
  metrics.addMetric(
    RESTORE_TEST_METRICS.backupCheckCompleted,
    MetricUnit.Count,
    1,
  );
  metrics.publishStoredMetrics();
  return { kind: 'leftoverCheck', leftovers, freshness };
}

export const handler = async (
  event: RestoreTestEvent,
): Promise<ValidateOutcome | LeftoverOutcome | undefined> => {
  if (isRestoreJobEvent(event)) return handleRestoreJob(event);
  if (isLeftoverEvent(event)) return handleLeftoverCheck();
  throw new Error('Unsupported restore-test event');
};
