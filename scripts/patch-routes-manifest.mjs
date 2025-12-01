import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const manifestPath = path.join(process.cwd(), '.next', 'routes-manifest.json');

async function ensureManifestShape() {
  try {
    const contents = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(contents);

    if (!Array.isArray(manifest.dynamicRoutes)) {
      manifest.dynamicRoutes = [];
    }

    if (!Array.isArray(manifest.dataRoutes)) {
      manifest.dataRoutes = [];
    }

    if (!Array.isArray(manifest.staticRoutes)) {
      manifest.staticRoutes = manifest.staticRoutes ?? [];
    }

    if (!manifest.rewrites) {
      manifest.rewrites = { beforeFiles: [], afterFiles: [], fallback: [] };
    }

    await writeFile(manifestPath, JSON.stringify(manifest));
    console.log('[patch-routes-manifest] Normalized routes-manifest.json');
  } catch (error) {
    console.warn('[patch-routes-manifest] Unable to normalize manifest:', error instanceof Error ? error.message : error);
  }
}

ensureManifestShape();
