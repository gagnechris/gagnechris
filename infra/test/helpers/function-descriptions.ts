import type { Template } from 'aws-cdk-lib/assertions';
import { expect } from 'vitest';

/** Every Lambda in the template carries a description; returns them by logical id. */
export function expectEveryFunctionDescribed(
  template: Template,
): Record<string, string> {
  const functions = template.findResources('AWS::Lambda::Function');
  expect(Object.keys(functions).length).toBeGreaterThan(0);
  const descriptions: Record<string, string> = {};
  for (const [id, fn] of Object.entries(functions)) {
    const description = (fn as { Properties?: { Description?: unknown } })
      .Properties?.Description;
    expect(description, `${id} has no Description`).toEqual(expect.any(String));
    descriptions[id] = description as string;
  }
  return descriptions;
}
