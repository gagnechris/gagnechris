import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployedFunctionCode } from './deployed-code.js';

/**
 * Runs the CloudFront Functions in this directory under Node, and the default
 * S3 behaviour's viewer-request → origin → viewer-response pipeline around
 * them, for the edge tests and the local static server.
 */

export type CfHeaders = Record<string, { value: string }>;

export type CfQueryString = Record<
  string,
  { value?: string; multiValue?: Array<{ value: string }> }
>;

export type CfRequest = {
  uri: string;
  querystring?: CfQueryString;
  headers: { host: { value: string } } & CfHeaders;
};

export type CfResponse = {
  statusCode: number;
  statusDescription?: string;
  headers: CfHeaders;
  body?: string;
};

/** The part of `cf.kvs()` the viewer-request function reads. */
export type CfKvs = {
  exists: (key: string) => Promise<boolean>;
  get?: (key: string) => Promise<string>;
};

export type ViewerRequest = (event: {
  request: CfRequest;
}) => Promise<CfRequest | CfResponse>;

export type ViewerRequestApi = {
  handler: ViewerRequest;
  setPublishedKeysForTests: (keys: Record<string, number> | null) => void;
  setOptionBPagesForTests: (pages: string[] | null) => void;
};

export type ViewerResponse = (event: {
  request: { uri: string };
  response: CfResponse;
}) => CfResponse;

export const FUNCTIONS_DIR = dirname(fileURLToPath(import.meta.url));

/** A function's code exactly as CloudFront receives it. */
export const functionSource = (name: string, dir = FUNCTIONS_DIR): string =>
  deployedFunctionCode(join(dir, name));

/**
 * `kvs` stands in for `cf.kvs()`, which only exists at the edge; a function
 * is called on every `cf.kvs()`. Without one, `cf.kvs()` throws, which the
 * function treats as a KVS outage.
 */
export function loadViewerRequest(
  options: { kvs?: CfKvs | (() => CfKvs); dir?: string } = {},
): ViewerRequestApi {
  const { kvs, dir = FUNCTIONS_DIR } = options;
  const cf = {
    kvs: (): CfKvs => {
      if (kvs === undefined) throw new Error('kvs unavailable');
      return typeof kvs === 'function' ? kvs() : kvs;
    },
  };
  const code = functionSource('viewer-request-function.js', dir).replace(
    /import\s*cf\s*from\s*["']cloudfront["'];?\s*/g,
    '',
  );
  return new Function(
    'cf',
    `${code}\nreturn { handler, setPublishedKeysForTests, setOptionBPagesForTests };`,
  )(cf) as ViewerRequestApi;
}

export function loadViewerResponse(dir = FUNCTIONS_DIR): ViewerResponse {
  return new Function(
    `${functionSource('viewer-response-function.js', dir)}\nreturn handler;`,
  )() as ViewerResponse;
}

export function loadAppViewerRequest(
  dir = FUNCTIONS_DIR,
): (event: { request: { uri: string } }) => { uri: string } {
  return new Function(
    `${functionSource('app-viewer-request.js', dir)}\nreturn handler;`,
  )() as (event: { request: { uri: string } }) => { uri: string };
}

/** What the origin holds at a key: text CloudFront functions can see, or bytes. */
type ObjectHeaders = { contentType: string; contentDisposition?: string };

export type OriginObject =
  | ({ kind: 'text'; body: string } & ObjectHeaders)
  | ({ kind: 'binary'; body: Uint8Array } & ObjectHeaders);

export type EdgeResult =
  | { kind: 'response'; response: CfResponse }
  | ({ kind: 'binary'; body: Uint8Array } & ObjectHeaders);

/** S3's answer for a missing key. CloudFront runs no viewer-response on it. */
export const noSuchKey = (uri: string): CfResponse => ({
  statusCode: 404,
  headers: { 'content-type': { value: 'application/xml' } },
  body: `<Error><Code>NoSuchKey</Code><Key>${uri}</Key></Error>`,
});

/**
 * The default S3 behaviour: viewer-request, then the origin (`null` for a
 * missing key), then viewer-response on text below 400.
 */
export function edgePipeline(options: {
  viewerRequest: ViewerRequest;
  viewerResponse: ViewerResponse;
  origin: (uri: string) => Promise<OriginObject | null>;
}): (request: CfRequest) => Promise<EdgeResult> {
  return async (request) => {
    const rewritten = await options.viewerRequest({ request });
    if ('statusCode' in rewritten) {
      return { kind: 'response', response: rewritten };
    }
    const object = await options.origin(rewritten.uri);
    if (object === null) {
      return { kind: 'response', response: noSuchKey(rewritten.uri) };
    }
    if (object.kind === 'binary') return object;
    return {
      kind: 'response',
      response: options.viewerResponse({
        request: { uri: rewritten.uri },
        response: {
          statusCode: 200,
          statusDescription: 'OK',
          headers: {
            'content-type': { value: object.contentType },
            ...(object.contentDisposition
              ? { 'content-disposition': { value: object.contentDisposition } }
              : {}),
          },
          body: object.body,
        },
      }),
    };
  };
}
