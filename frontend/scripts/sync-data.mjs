// Copy the deployed static dataset (docs/data) into Vite's public dir.
//
// Vite serves `public/data/*` in dev and copies it into dist/ on build, but the
// same files are already committed under docs/data for GitHub Pages. Keeping a
// second copy in git doubled the repo size (two ~10 MB field collections), so
// `public/data` is generated on demand instead.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../docs/data');
const dest = resolve(here, '../public/data');

if (!existsSync(src)) {
  console.warn(`[sync-data] ${src} not found — keeping existing public/data`);
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[sync-data] copied docs/data → frontend/public/data`);
