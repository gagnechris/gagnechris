/** Optimistic concurrency failed when the client sent `If-Match` (CHR-141). */
export class PreconditionFailedError extends Error {
  readonly currentVersion?: number;

  constructor(message: string, opts?: { currentVersion?: number }) {
    super(message);
    this.name = 'PreconditionFailedError';
    this.currentVersion = opts?.currentVersion;
  }
}

export class ConflictError extends Error {
  readonly currentVersion?: number;
  readonly current?: unknown;
  /** Distinguishes slug collisions from stale-version conflicts (CHR-152). */
  readonly code: 'conflict' | 'slug_taken';

  constructor(
    message: string,
    opts?: {
      currentVersion?: number;
      current?: unknown;
      code?: 'conflict' | 'slug_taken';
    },
  ) {
    super(message);
    this.name = 'ConflictError';
    this.currentVersion = opts?.currentVersion;
    this.current = opts?.current;
    this.code = opts?.code ?? 'conflict';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
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
