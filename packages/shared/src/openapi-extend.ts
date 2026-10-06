/**
 * Must be imported before any Zod schemas used with OpenAPIRegistry.
 * Domain schemas stay pure; only the OpenAPI entry loads this.
 */
import * as z from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);
