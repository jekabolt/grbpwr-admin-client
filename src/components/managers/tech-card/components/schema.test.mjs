import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';

// This contract probe also runs under `node --test`; register with whichever runner loaded it.
const runner = process.env.VITEST ? await import('vitest') : await import('node:test');
const test = runner.test;
const after = 'afterAll' in runner ? runner.afterAll : runner.after;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../../..');
const outfile = resolve(tmpdir(), `sheet-binding-schema-${process.pid}.mjs`);

await build({
  entryPoints: [resolve(HERE, 'schema.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  outfile,
  absWorkingDir: REPO,
  jsx: 'automatic',
  logLevel: 'warning',
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    api: resolve(REPO, 'src/api'),
    components: resolve(REPO, 'src/components'),
    constants: resolve(REPO, 'src/constants'),
    hooks: resolve(REPO, 'src/hooks'),
    lib: resolve(REPO, 'src/lib'),
    store: resolve(REPO, 'src/store'),
    ui: resolve(REPO, 'src/ui'),
    utils: resolve(REPO, 'src/utils'),
  },
});

const schema = await import(pathToFileURL(outfile).href);
after(() => rmSync(outfile, { force: true }));

function form(overrides = {}) {
  return {
    ...schema.techCardDefaultData,
    name: 'schema test card',
    stage: 'TECH_CARD_STAGE_IDEA',
    ...overrides,
  };
}

test('write mapper preserves an alias whose material scope is no longer live', () => {
  const payload = schema.mapFormToTechCardInsert(
    form({
      bomItems: [],
      pieces: [{ name: 'front', lineKey: 'piece-front' }],
      pieceDxfAliases: [
        {
          bomLineKey: 'removed-fabric-line',
          fabricPurpose: 'TECH_CARD_BOM_PURPOSE_LINING',
          blockName: 'FRONT',
          pieceLineKey: 'piece-front',
        },
      ],
    }),
  );

  assert.deepEqual(payload.pieceDxfAliases?.items, [
    {
      bomLineKey: 'removed-fabric-line',
      fabricPurpose: 'TECH_CARD_BOM_PURPOSE_LINING',
      blockName: 'FRONT',
      pieceLineKey: 'piece-front',
    },
  ]);
});

test('empty BOM role validates and maps to purpose or section defaults', () => {
  const parsed = schema.techCardSchema.safeParse(
    form({
      bomItems: [
        {
          section: 'TECH_CARD_BOM_SECTION_FABRIC',
          purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
          name: '  ',
          materialId: 0,
          lineKey: 'main-fabric',
        },
        {
          section: 'TECH_CARD_BOM_SECTION_HARDWARE',
          purpose: 'TECH_CARD_BOM_PURPOSE_UNSET',
          name: '',
          materialId: 0,
          lineKey: 'hardware',
        },
      ],
    }),
  );

  assert.equal(parsed.success, true, parsed.error?.message);
  const payload = schema.mapFormToTechCardInsert(parsed.data);
  assert.equal(payload.bomItems?.[0]?.name, 'main material');
  assert.equal(payload.bomItems?.[1]?.name, 'hardware');
});

test('other BOM validation remains active', () => {
  const parsed = schema.techCardSchema.safeParse(
    form({
      bomItems: [
        {
          section: 'TECH_CARD_BOM_SECTION_HARDWARE',
          purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
          name: '',
          materialId: 0,
          lineKey: 'invalid-purpose',
        },
      ],
    }),
  );

  assert.equal(parsed.success, false);
  assert.ok(parsed.error.issues.some((issue) => issue.path.join('.') === 'bomItems.0.purpose'));
});
