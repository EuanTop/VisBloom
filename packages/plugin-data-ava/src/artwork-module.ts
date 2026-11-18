import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

// AVA 4.0.0's public browser bundle initializes a dynamic function at import
// time. Use its shipped pure profiler in exported artwork with a strict CSP.
export function artworkProfileEntry() {
  return join(dirname(require.resolve('@antv/ava/package.json')), 'lib/interpreter/javascript/profile.js');
}

export function artworkDataModule() {
  const browser = fileURLToPath(new URL('./browser.ts', import.meta.url));
  return [
    `import { createArtworkExplorer } from ${JSON.stringify(browser)};`,
    `import { profileTables } from ${JSON.stringify(artworkProfileEntry())};`,
    'export const exploreArtworkRows = createArtworkExplorer(profileTables);',
  ].join('\n');
}
