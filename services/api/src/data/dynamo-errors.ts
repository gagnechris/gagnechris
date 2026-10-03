function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const name = (error as { name?: unknown }).name;
  if (typeof name === 'string') return name;
  // SDK v3 sometimes nests name under the error constructor only.
  const ctor = (error as { constructor?: { name?: unknown } }).constructor
    ?.name;
  return typeof ctor === 'string' ? ctor : undefined;
}

function errorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}

export function isExclusiveStartKeyValidationError(error: unknown): boolean {
  if (errorName(error) !== 'ValidationException') return false;
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes('starting key') ||
    message.includes('exclusive start key') ||
    message.includes('the provided starting key')
  );
}

export function throwCursorValidation(error: unknown): never {
  if (isExclusiveStartKeyValidationError(error)) {
    throw new SyntaxError('Invalid pagination cursor');
  }
  throw error;
}
