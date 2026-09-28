import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokensToCssRoot } from '../src/tokens.js';

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/variables.css',
);
writeFileSync(out, tokensToCssRoot(), 'utf8');
console.log(`Wrote ${out}`);
