import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from './openapi.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'openapi');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'openapi.json');
writeFileSync(outPath, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);
console.log(`Wrote ${outPath}`);
