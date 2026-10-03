/**
 * Restore-test Lambda (CHR-198). Two triggers:
 *
 * 1. EventBridge `Restore Job State Change` (status COMPLETED) for the AWS
 *    Backup restore testing plan: scan the restored `awsbackup-restore-test-*`
 *    table, check content, and report SUCCESSFUL / FAILED with
 *    PutRestoreValidationResult. Reporting ends the validation window, so AWS
 *    Backup deletes the scratch table either way.
 * 2. Daily EventBridge schedule (or `{ "action": "leftoverCheck" }`): count
 *    restore scratch tables older than the age limit and emit
 *    `LeftoverRestoreTables` (alarmed in Data-prod).
 */
import {
  BackupClient,
  PutRestoreValidationResultCommand,
} from '@aws-sdk/client-backup';
import {
  DescribeTableCommand,
  DynamoDBClient,
  ListTablesCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
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
  putValidation: PutValidationFn;
  listTables: ListTablesFn;
  describeCreation: DescribeCreationFn;
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
};

function defaultDeps(): RestoreTestDeps {
  const ddb = new DynamoDBClient({});
  const doc = DynamoDBDocumentClient.from(ddb);
  const backup = new BackupClient({});
  return {
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

/** Test hook: inject fake clients (undefined restores the real ones). */
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
      result = await validateRestoredTable(d.scan, tableName);
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
  });
  metrics.addMetric(
    result.status === 'SUCCESSFUL'
      ? 'RestoreValidationSucceeded'
      : 'RestoreValidationFailed',
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
    'LeftoverRestoreTables',
    MetricUnit.Count,
    leftovers.length,
  );
  metrics.publishStoredMetrics();
  return { kind: 'leftoverCheck', leftovers };
}

export const handler = async (
  event: RestoreTestEvent,
): Promise<ValidateOutcome | LeftoverOutcome | undefined> => {
  if (isRestoreJobEvent(event)) return handleRestoreJob(event);
  if (isLeftoverEvent(event)) return handleLeftoverCheck();
  throw new Error('Unsupported restore-test event');
};
