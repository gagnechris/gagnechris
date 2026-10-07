import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

/**
 * CloudFront Functions reject code over 10,240 bytes, so the readable source
 * ships with comments and whitespace stripped. Only whitespace: identifier
 * renaming would break the required `handler` name, and syntax rewrites could
 * emit syntax the cloudfront-js-2.0 runtime lacks.
 */
export function deployedFunctionCode(path: string): string {
  return transformSync(readFileSync(path, 'utf8'), {
    loader: 'js',
    minifyWhitespace: true,
    legalComments: 'none',
  }).code;
}

/** Leaves room for a few changes before a deploy hits the hard limit. */
export const FUNCTION_CODE_BUDGET_BYTES = 9_500;
