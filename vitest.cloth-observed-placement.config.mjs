import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run this bounded CPU suite with: yarn vitest run --config vitest.cloth-observed-placement.config.mjs
// Optional JSON evidence: CLOTH_OBSERVED_EVIDENCE_DIR=<chosen-directory> (off by default).
const root = path.dirname(fileURLToPath(import.meta.url));
const archives = path.join(root, 'tests/cloth/fixtures/observed-placement-v3/original-evaluators');
const manifest = JSON.parse(readFileSync(path.join(archives, 'manifest.json'), 'utf8'));
const expectedAliases = new Set(['cloth-observed-pair-original', 'cloth-world-preflight-original']);
if (
  manifest.schemaVersion !== 'cloth-observed-placement-original-evaluators/1' ||
  manifest.testOnly !== true ||
  !Array.isArray(manifest.files) ||
  manifest.files.length !== 2
)
  throw new Error('Invalid observed-placement test baseline manifest.');
const aliases = new Map();
const originalPaths = new Map();
for (const entry of manifest.files) {
  if (
    !expectedAliases.delete(entry.alias) ||
    typeof entry.archiveFile !== 'string' ||
    path.basename(entry.archiveFile) !== entry.archiveFile ||
    entry.originalSourcePath !== `src/components/cloth-simulation-spike/${entry.archiveFile}` ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  )
    throw new Error('Invalid observed-placement test baseline entry.');
  const archive = path.join(archives, entry.archiveFile);
  const actual = createHash('sha256').update(readFileSync(archive)).digest('hex');
  if (actual !== entry.sha256)
    throw new Error(`Observed-placement original evaluator SHA mismatch: ${entry.archiveFile}`);
  aliases.set(entry.alias, archive);
  originalPaths.set(archive, path.join(root, entry.originalSourcePath));
}
const srcAliases = Object.fromEntries(
  [
    'components',
    'constants',
    'context',
    'hooks',
    'lib',
    'types',
    'ui',
    'utils',
    'styles',
    'api',
  ].map((name) => [name, path.join(root, 'src', name)]),
);
export default {
  root,
  esbuild: { jsx: 'automatic' },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    alias: { '@': path.join(root, 'src'), ...srcAliases },
  },
  plugins: [
    {
      name: 'observed-placement-test-original-evaluators',
      enforce: 'pre',
      resolveId(id, importer) {
        if (aliases.has(id)) return aliases.get(id);
        const original = importer ? originalPaths.get(importer.split('?')[0]) : undefined;
        if (!original || !id.startsWith('.')) return;
        // Only these two exact archives are rebased. All other test and production imports use
        // normal repository resolution; there is no outside checkout or temporary-root fallback.
        const candidate = path.resolve(path.dirname(original), id);
        if (!candidate.startsWith(path.join(root, 'src') + path.sep))
          throw new Error('Original evaluator dependency escaped repository source.');
        const resolved = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx']
          .map((extension) => candidate + extension)
          .find((file) => existsSync(file));
        if (!resolved) throw new Error(`Original evaluator dependency is missing: ${id}`);
        return resolved;
      },
    },
  ],
  test: {
    environment: 'node',
    maxWorkers: 1,
    testTimeout: 120000,
    // Exact 34-file suite from the 312-test pre-portability checkpoint.
    include: [
      'src/components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test.ts',
      'src/components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-garment-session-v1.test.ts',
      'src/components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1.integration.test.ts',
      'src/components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1.test.ts',
      'src/components/cloth-simulation-spike/saved-model-observed-placement-target-v1.test.ts',
      'src/components/managers/model/components/model-mannequin-pose-document-v1.test.ts',
      'src/components/managers/model/components/model-mannequin-pose-document-v2.test.ts',
      'src/components/managers/model/components/model-open-reference-full-body-pose-control-v4.test.tsx',
      'src/components/managers/models/components/saved-model-displayed-triangle-body-query-session-v2.test.ts',
      'src/components/managers/models/components/saved-model-displayed-triangle-body-session-v2.garment-pair-lifetime.test.ts',
      'src/components/managers/models/components/saved-model-displayed-triangle-body-session-v2.observed-placement-integration.test.ts',
      'src/components/managers/models/components/saved-model-displayed-triangle-body-session-v2.observed-placement-lifetime.test.ts',
      'src/components/managers/models/components/saved-model-displayed-triangle-body-session-v2.pair-lifetime.test.ts',
      'src/components/managers/models/components/saved-model-displayed-triangle-body-session-v2.test.ts',
      'src/components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-read-v1.test.ts',
      'src/components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-save-v1.test.ts',
      'src/lib/cloth/domain/observed-placement-v3-issuer.test.ts',
      'src/lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3.test.ts',
      'src/lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v2.test.ts',
      'src/lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2.hostile.test.ts',
      'src/lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2.test.ts',
      'src/lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v3.test.ts',
      'src/lib/cloth/domain/pattern-import-dxf-product-saved-annular-garment-v1.legacy-parity.test.ts',
      'src/lib/cloth/domain/pattern-import-dxf-product-saved-annular-garment-v1.test.ts',
      'src/lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1.test.ts',
      'src/lib/cloth/domain/saved-model-observed-placement-target-codec-v1.compatibility.test.ts',
      'src/lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-compile-session-v1.context-row.test.ts',
      'src/components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-first-save-v3.test.ts',
      'src/components/managers/models/components/saved-model-displayed-triangle-body-session-v2.observed-issue-lifetime.test.ts',
      'src/components/managers/models/components/saved-model-displayed-triangle-body-session-v2.observed-first-save-integration.test.ts',
      'src/components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1.test.ts',
      'src/components/cloth-simulation-spike/beta-skirt-saved-annular-displayed-body-world-initial-preflight-v1.test.ts',
      'src/components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-world-initial-preflight-v1.test.ts',
      'src/components/managers/models/components/saved-model-displayed-triangle-body-session-v2.observed-world-lifetime.test.ts',
    ],
  },
};
