import { dynamoErrorName } from '@gagnechris/data';
import { InvalidCursorError } from './errors.js';

export function isExclusiveStartKeyValidationError(error: unknown): boolean {
  if (dynamoErrorName(error) !== 'ValidationException') return false;
  const raw = (error as { message?: unknown }).message;
  const message = typeof raw === 'string' ? raw.toLowerCase() : '';
  return (
    message.includes('starting key') ||
    message.includes('exclusive start key') ||
    message.includes('the provided starting key')
  );
}

export function throwCursorValidation(error: unknown): never {
  if (isExclusiveStartKeyValidationError(error)) {
    throw new InvalidCursorError();
  }
  throw error;
}
