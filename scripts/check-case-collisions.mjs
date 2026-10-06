import { execFileSync } from 'node:child_process';

// Extensionless imports resolve `./foo` to foo.ts or Foo.tsx alike on a
// case-insensitive filesystem, so module stems must be unique ignoring case too.
const moduleExtension = /\.[cm]?[jt]sx?$/;

function addTo(groups, key, value) {
  const set = groups.get(key) ?? new Set();
  set.add(value);
  groups.set(key, set);
}

function findCaseCollisions(paths) {
  const groups = new Map();
  for (const path of paths) {
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i += 1) {
      const prefix = parts.slice(0, i).join('/');
      addTo(groups, `path:${prefix.toLowerCase()}`, prefix);
    }
    if (moduleExtension.test(path)) {
      const stem = path.replace(moduleExtension, '');
      addTo(groups, `module:${stem.toLowerCase()}`, stem);
    }
  }
  return [...groups.values()]
    .filter((set) => set.size > 1)
    .map((set) => [...set].sort());
}

const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const collisions = findCaseCollisions(paths);

if (collisions.length > 0) {
  console.error('Paths that differ only by case:');
  for (const group of collisions) console.error(`  ${group.join('  vs  ')}`);
  process.exit(1);
}
