/** Optimistic concurrency failed when the client sent `If-Match` (CHR-141). */
export class PreconditionFailedError extends Error {
  readonly currentVersion?: number;
  readonly current?: unknown;

  constructor(
    message: string,
    opts?: { currentVersion?: number; current?: unknown },
  ) {
    super(message);
    this.name = 'PreconditionFailedError';
    this.currentVersion = opts?.currentVersion;
    this.current = opts?.current;
  }
}

/** Machine-readable conflict codes returned on 409 bodies (CHR-171). */
export type ConflictCode =
  | 'conflict'
  | 'version_conflict'
  | 'deleted'
  | 'payload_mismatch'
  | 'slug_taken'
  | 'daily_taken';

export class ConflictError extends Error {
  readonly currentVersion?: number;
  readonly current?: unknown;
  /** Distinguishes unique-claim collisions from stale-version conflicts. */
  readonly code: ConflictCode;

  constructor(
    message: string,
    opts?: {
      currentVersion?: number;
      current?: unknown;
      code?: ConflictCode;
    },
  ) {
    super(message);
    this.name = 'ConflictError';
    this.currentVersion = opts?.currentVersion;
    this.current = opts?.current;
    this.code = opts?.code ?? 'conflict';
  }
}

/** Request is well-formed but not allowed for this entity (HTTP 400). */
export class BadRequestError extends Error {
  readonly fields?: Record<string, string>;

  constructor(message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'BadRequestError';
    this.fields = fields;
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Client sync watermark is older than the tombstone retention horizon (CHR-172). */
export class ResyncRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResyncRequiredError';
  }
}

/** Client build is older than the sync contract's minimum (HTTP 426, CHR-202). */
export class UpgradeRequiredError extends Error {
  readonly minClientVersion: string;

  constructor(message: string, minClientVersion: string) {
    super(message);
    this.name = 'UpgradeRequiredError';
    this.minClientVersion = minClientVersion;
  }
}

/**
 * A sync GSI row has a `changeType` with no registered adapter (CHR-202).
 * Maps to HTTP 500 + `SyncAdapterMissing` metric: skipping the row while
 * advancing `nextSince` would make clients miss it permanently.
 */
export class SyncAdapterMissingError extends Error {
  readonly changeType: string;

  constructor(changeType: string) {
    super(`No sync adapter registered for change type ${changeType}`);
    this.name = 'SyncAdapterMissingError';
    this.changeType = changeType;
  }
}

/** DynamoDB throttling exhausted retries (CHR-120). */
export class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Stored item failed schema validation (CHR-152).
 * Maps to HTTP 500 — not a client validation error.
 */
export class DataIntegrityError extends Error {
  readonly pk?: string;
  readonly sk?: string;

  constructor(
    message: string,
    opts?: { pk?: string; sk?: string; cause?: unknown },
  ) {
    super(
      message,
      opts?.cause !== undefined ? { cause: opts.cause } : undefined,
    );
    this.name = 'DataIntegrityError';
    this.pk = opts?.pk;
    this.sk = opts?.sk;
  }
}
