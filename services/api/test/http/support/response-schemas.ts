import { buildOpenApiRegistry } from '@gagnechris/shared/openapi';

type Schema = {
  safeParse(
    value: unknown,
  ): { success: true } | { success: false; error: { message: string } };
};

type Operation = {
  method: string;
  path: string;
  pattern: RegExp;
  params: number;
  responses: Record<string, unknown>;
};

// An object key may contain slashes; every other path parameter is one segment.
const paramPattern = (name: string) => (name === 'key' ? '(.+)' : '([^/]+)');

const operations: Operation[] = buildOpenApiRegistry()
  .definitions.flatMap((d) => (d.type === 'route' ? [d.route] : []))
  .map((route) => {
    const params = route.path.match(/\{[^}]+\}/g)?.length ?? 0;
    const source = route.path
      .split(/(\{[^}]+\})/)
      .map((part) =>
        part.startsWith('{')
          ? paramPattern(part.slice(1, -1))
          : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('');
    return {
      method: route.method.toUpperCase(),
      path: route.path,
      pattern: new RegExp(`^${source}$`),
      params,
      responses: route.responses as Record<string, unknown>,
    };
  })
  // A literal segment such as /notes/batch wins over /notes/{id}.
  .sort((a, b) => a.params - b.params);

function jsonSchemaOf(response: unknown): Schema | undefined {
  const content = (
    response as { content?: Record<string, { schema?: unknown }> }
  )?.content;
  return content?.['application/json']?.schema as Schema | undefined;
}

/**
 * Throws unless a 2xx body parses with the shared schema the OpenAPI document
 * declares for that operation and status.
 */
export function assertResponseMatchesSchema(
  method: string,
  pathname: string,
  status: number,
  body: unknown,
): void {
  const label = `${method} ${pathname} ${status}`;
  // The router serves a trailing slash as the path without it.
  const routed = pathname.replace(/(.)\/$/, '$1');
  const op = operations.find(
    (o) => o.method === method.toUpperCase() && o.pattern.test(routed),
  );
  if (!op) {
    throw new Error(`${label}: no OpenAPI operation for this route`);
  }
  const declared = op.responses[String(status)];
  if (!declared) {
    throw new Error(`${label}: ${op.path} declares no ${status} response`);
  }
  const schema = jsonSchemaOf(declared);
  if (!schema) {
    if (body !== undefined) {
      throw new Error(`${label}: ${op.path} declares no ${status} body`);
    }
    return;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `${label}: body does not match the ${op.path} response schema\n${parsed.error.message}`,
    );
  }
}
