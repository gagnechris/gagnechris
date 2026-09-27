/**
 * Shared DynamoDB helpers (CHR-120).
 * Duck-typed so `@gagnechris/shared` stays free of the AWS SDK (web imports this package).
 */

/** Keys request for one table in BatchGetItem. */
export type BatchGetTableRequest = {
  Keys: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type BatchGetRequestItems = Record<string, BatchGetTableRequest>;

export type BatchGetOutput = {
  Responses?: Record<string, Array<Record<string, unknown>> | undefined>;
  UnprocessedKeys?: BatchGetRequestItems | undefined;
};

export type BatchGetSend = (
  requestItems: BatchGetRequestItems,
) => Promise<BatchGetOutput>;

export const BATCH_GET_MAX_ATTEMPTS = 5;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeResponses(
  into: Record<string, Array<Record<string, unknown>>>,
  from: BatchGetOutput['Responses'],
): void {
  if (!from) return;
  for (const [table, items] of Object.entries(from)) {
    if (!items?.length) continue;
    const bucket = into[table] ?? (into[table] = []);
    bucket.push(...items);
  }
}

function hasUnprocessedKeys(
  unprocessed: BatchGetRequestItems | undefined,
): boolean {
  if (!unprocessed) return false;
  for (const table of Object.values(unprocessed)) {
    if ((table?.Keys?.length ?? 0) > 0) return true;
  }
  return false;
}

/**
 * BatchGetItem that retries `UnprocessedKeys` with exponential backoff until
 * empty (or throws). Never treat an unprocessed key as "missing".
 */
export async function batchGetAll(
  send: BatchGetSend,
  requestItems: BatchGetRequestItems,
  options?: {
    maxAttempts?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<Record<string, Array<Record<string, unknown>>>> {
  const maxAttempts = options?.maxAttempts ?? BATCH_GET_MAX_ATTEMPTS;
  const sleep = options?.sleep ?? defaultSleep;

  const responses: Record<string, Array<Record<string, unknown>>> = {};
  let pending: BatchGetRequestItems | undefined = requestItems;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!pending || !hasUnprocessedKeys(pending)) {
      return responses;
    }

    const page = await send(pending);
    mergeResponses(responses, page.Responses);
    pending = page.UnprocessedKeys;

    if (!hasUnprocessedKeys(pending)) {
      return responses;
    }

    if (attempt < maxAttempts) {
      await sleep(25 * 2 ** (attempt - 1));
    }
  }

  throw new Error(
    `DynamoDB BatchGet still has UnprocessedKeys after ${maxAttempts} attempts`,
  );
}

export type DynamoWriteErrorKind = 'conflict' | 'throttling' | 'other';

function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

function cancellationCodes(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) return [];
  const reasons = (error as { CancellationReasons?: unknown }).CancellationReasons;
  if (!Array.isArray(reasons)) return [];
  const codes: string[] = [];
  for (const reason of reasons) {
    if (
      typeof reason === 'object' &&
      reason !== null &&
      typeof (reason as { Code?: unknown }).Code === 'string'
    ) {
      codes.push((reason as { Code: string }).Code);
    }
  }
  return codes;
}

/**
 * Classify DynamoDB write failures for HTTP mapping (CHR-120):
 * - ConditionalCheckFailed / TransactionConflict → conflict (409)
 * - ThrottlingError / ProvisionedThroughputExceeded → throttling (retry, then 503)
 * - anything else → other (rethrow)
 */
export function classifyDynamoWriteError(error: unknown): DynamoWriteErrorKind {
  const name = errorName(error);
  if (
    name === 'ThrottlingException' ||
    name === 'ThrottlingError' ||
    name === 'ProvisionedThroughputExceededException'
  ) {
    return 'throttling';
  }

  if (name === 'ConditionalCheckFailedException') {
    return 'conflict';
  }

  if (name === 'TransactionCanceledException') {
    const codes = cancellationCodes(error);
    if (
      codes.some(
        (code) =>
          code === 'ThrottlingError' ||
          code === 'ProvisionedThroughputExceeded',
      )
    ) {
      return 'throttling';
    }
    if (
      codes.some(
        (code) =>
          code === 'ConditionalCheckFailed' || code === 'TransactionConflict',
      )
    ) {
      return 'conflict';
    }
    // Empty / unknown cancellation reasons: treat as conflict only when the
    // exception itself is a canceled transaction with no throttle signal.
    // Prefer rethrow for truly unknown codes.
    if (codes.length === 0) return 'conflict';
    return 'other';
  }

  return 'other';
}

/** True when a write failed due to optimistic lock or concurrent transaction. */
export function isOptimisticLockConflict(error: unknown): boolean {
  return classifyDynamoWriteError(error) === 'conflict';
}

export function isDynamoThrottlingError(error: unknown): boolean {
  return classifyDynamoWriteError(error) === 'throttling';
}
