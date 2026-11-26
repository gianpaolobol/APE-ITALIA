// Read-only inventory of selected advisory packages in a built image.
// Run with Node 22: node --input-type=module - /app < scripts/inventory-runtime-deps.mjs
// Reports installed manifests only, not runtime reachability or bundled JS.
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const targets = new Set(['deepmerge-ts', 'effect', 'glob', 'minimatch', 'image-size', 'postcss']);
const rootArg = process.argv[2];
if (!rootArg) throw new Error('An explicit inventory root is required');
const root = realpathSync(rootArg);
if (!statSync(root).isDirectory()) throw new Error('Inventory root must be a directory');
const found = [];
const pending = [root];
let nodeModulesSeen = 0;
while (pending.length) {
  const dir = pending.pop();
  if (basename(dir) === 'node_modules') nodeModulesSeen++;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Do not follow symlinks or inspect arbitrary file contents.
    if (entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      pending.push(path);
    } else if (entry.isFile() && entry.name === 'package.json' &&
               targets.has(basename(dir)) && relative(root, dir).split('/').includes('node_modules')) {
      const pkg = JSON.parse(readFileSync(path, 'utf8'));
      if (pkg.name !== basename(dir) || typeof pkg.version !== 'string') {
        throw new Error('Unexpected target manifest: ' + relative(root, path));
      }
      found.push({ name: pkg.name, version: pkg.version, path: relative(root, dir) });
    }
  }
}
if (!nodeModulesSeen) throw new Error('No node_modules directory found; inventory root may be incorrect');
found.sort((a, b) => a.path.localeCompare(b.path, 'en'));
console.log(JSON.stringify({ nodeModulesSeen, packages: found, missing: [...targets].filter(name => !found.some(p => p.name === name)) }, null, 2));
