export class ConflictError extends Error {
  readonly currentVersion?: number;
  readonly current?: unknown;

  constructor(
    message: string,
    opts?: { currentVersion?: number; current?: unknown },
  ) {
    super(message);
    this.name = 'ConflictError';
    this.currentVersion = opts?.currentVersion;
    this.current = opts?.current;
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
