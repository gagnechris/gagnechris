// A local EventBridge matcher for the pattern subset this app uses: exact
// values, nested objects and `$or`. Any other operator throws, so a pattern
// that outgrows the matcher fails loudly instead of matching wrongly.

type Pattern = { [key: string]: unknown };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesValues(allowed: unknown[], value: unknown): boolean {
  for (const option of allowed) {
    if (typeof option === 'object' && option !== null) {
      throw new Error(`Unsupported pattern operator ${JSON.stringify(option)}`);
    }
  }
  if (value === undefined) return false;
  const values = Array.isArray(value) ? value : [value];
  return values.some((v) => allowed.includes(v));
}

export function matchesEventPattern(pattern: Pattern, event: unknown): boolean {
  if (!isObject(event)) return false;
  return Object.entries(pattern).every(([key, expected]) => {
    if (key === '$or') {
      if (!Array.isArray(expected)) throw new Error('$or must be an array');
      return expected.some((branch) =>
        matchesEventPattern(branch as Pattern, event),
      );
    }
    if (Array.isArray(expected)) return matchesValues(expected, event[key]);
    if (isObject(expected)) return matchesEventPattern(expected, event[key]);
    throw new Error(`Unsupported pattern value at ${key}`);
  });
}

/**
 * Replaces `Fn::GetAtt` tokens with fixed strings so a synthesized pattern is
 * concrete JSON; any other intrinsic throws.
 */
export function resolvePatternTokens(
  value: unknown,
  getAtt: (logicalId: string, attribute: string) => string,
): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => resolvePatternTokens(v, getAtt));
  }
  if (!isObject(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === 'Fn::GetAtt') {
    const [logicalId, attribute] = value['Fn::GetAtt'] as [string, string];
    return getAtt(logicalId, attribute);
  }
  if (keys.some((k) => k.startsWith('Fn::') || k === 'Ref')) {
    throw new Error(`Unresolvable token ${JSON.stringify(value)}`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, resolvePatternTokens(v, getAtt)]),
  );
}
