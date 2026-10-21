#!/usr/bin/env node
// ICONS-UNIFY review stand — one command:
//
//   node scripts/icons-review/run.mjs            render BEFORE (origin/beta) + AFTER (this tree) → review.html
//   node scripts/icons-review/run.mjs --after    re-render only AFTER, reuse the saved BEFORE json
//   node scripts/icons-review/run.mjs --refresh-before   also move the BEFORE checkout to the current origin/beta
//
// BEFORE is a detached worktree of origin/beta next to this one (`…-wt-icons-before`, node_modules
// symlinked to the primary clone, submodules never initialised). It is created on first run.
// The stand (render.tsx) is bundled with esbuild against each checkout's own `src/` and run in node.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildHtml } from './build-html.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const AFTER_ROOT = resolve(HERE, '../..');
const BEFORE_ROOT = resolve(AFTER_ROOT, '../grbpwr-admin-client-wt-icons-before');
const PLAN_DIR = resolve(AFTER_ROOT, '../tmp/plans/icons-unify');
const OUT_DIR = resolve(PLAN_DIR, 'review');
const HTML = resolve(PLAN_DIR, 'review.html');
const args = new Set(process.argv.slice(2));

const ALIASES = [
  'components',
  'lib',
  'api',
  'utils',
  'ui',
  'constants',
  'store',
  'hooks',
  'context',
  'types',
  'styles',
];

/** Private members the stand needs, exported at bundle time only (source files stay untouched). */
const INJECT = {
  'src/components/managers/media/components/media-slot.tsx': ['PhotoGlyph'],
  'src/components/managers/tech-card/components/design/threed/model-upload-cell.tsx': [
    'ModelGlyph',
  ],
  'src/components/managers/tech-card/components/design/core/two-half-slot.tsx': ['PenGlyph'],
  'src/components/managers/model/components/measurement-pictograms.tsx': ['MEASUREMENT_GEOMETRY'],
};
const DRAW_GLYPH_FILE =
  'src/components/managers/tech-card/components/design/pattern/fabrics-hardware.tsx';

/** The JSX expression of the `drawGlyph={…}` prop, braces balanced. */
function drawGlyphExpression(source) {
  const at = source.search(/\bdrawGlyph=\{/);
  if (at < 0) return null;
  let i = source.indexOf('{', at);
  const start = i + 1;
  let depth = 0;
  let quote = null;
  for (; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(start, i);
  }
  return null;
}

function injectPlugin(root) {
  const targets = new Map(
    [...Object.entries(INJECT), [DRAW_GLYPH_FILE, []]].map(([rel, names]) => [
      resolve(root, rel),
      names,
    ]),
  );
  return {
    name: 'icons-review-inject',
    setup(b) {
      b.onLoad({ filter: /\.tsx$/ }, (a) => {
        const names = targets.get(a.path);
        if (!names) return undefined;
        let source = readFileSync(a.path, 'utf8');
        for (const name of names) {
          if (new RegExp(`\\b(?:function|const|let)\\s+${name}\\b`).test(source)) {
            source += `\nexport { ${name} as __stand_${name} };\n`;
          }
        }
        if (a.path.endsWith(DRAW_GLYPH_FILE)) {
          const expr = drawGlyphExpression(source);
          if (expr) source += `\nexport const __stand_drawGlyph = () => (<>{${expr}}</>);\n`;
        }
        return { contents: source, loader: 'tsx' };
      });
    },
  };
}

async function render(root, label) {
  const out = resolve(tmpdir(), `icons-review-${label}-${process.pid}.cjs`);
  await build({
    entryPoints: [resolve(HERE, 'render.tsx')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outfile: out,
    logLevel: 'error',
    absWorkingDir: root,
    jsx: 'automatic',
    plugins: [injectPlugin(root)],
    alias: {
      ...Object.fromEntries(ALIASES.map((name) => [name, resolve(root, 'src', name)])),
      '@': resolve(root, 'src'),
      'opentype.js': resolve(root, 'node_modules/opentype.js/dist/opentype.js'),
    },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    loader: {
      '.svg': 'dataurl',
      '.png': 'dataurl',
      '.jpg': 'dataurl',
      '.woff2': 'dataurl',
      '.css': 'empty',
      '.scss': 'empty',
    },
    banner: {
      js: [
        // Browser globals some modules touch at import time; nothing here is rendered by them.
        'globalThis.window ??= globalThis;',
        'globalThis.self ??= globalThis;',
        'globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };',
        'globalThis.sessionStorage ??= globalThis.localStorage;',
        "globalThis.location ??= new URL('http://localhost:4040/');",
        'globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });',
        'globalThis.addEventListener ??= () => {};',
        'globalThis.removeEventListener ??= () => {};',
      ].join('\n'),
    },
  });
  try {
    const json = execFileSync(process.execPath, [out], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      cwd: root,
    });
    const file = resolve(OUT_DIR, `${label}.json`);
    writeFileSync(file, json);
    const rows = JSON.parse(json);
    const errors = rows.filter((r) => r.error);
    console.log(`${label}: ${rows.length} icons, ${errors.length} errors → ${file}`);
    for (const r of errors) console.log(`  ! ${r.family}/${r.name}/${r.variant}: ${r.error}`);
    return rows;
  } finally {
    rmSync(out, { force: true });
  }
}

function git(...a) {
  return execFileSync('git', a, { cwd: AFTER_ROOT, encoding: 'utf8' }).trim();
}

function ensureBefore() {
  if (!existsSync(BEFORE_ROOT)) {
    git('fetch', '-q', 'origin', 'beta');
    // --detach, no submodule init: the generated proto clients are tracked files.
    git('worktree', 'add', '--detach', BEFORE_ROOT, 'origin/beta');
  } else if (args.has('--refresh-before')) {
    git('fetch', '-q', 'origin', 'beta');
    execFileSync('git', ['checkout', '-q', '--detach', 'origin/beta'], { cwd: BEFORE_ROOT });
  }
  const nm = resolve(BEFORE_ROOT, 'node_modules');
  if (!existsSync(nm)) symlinkSync('../grbpwr-admin-client/node_modules', nm);
  const head = execFileSync('git', ['log', '-1', '--format=%h %s'], {
    cwd: BEFORE_ROOT,
    encoding: 'utf8',
  }).trim();
  console.log(`before: ${BEFORE_ROOT} @ ${head}`);
}

mkdirSync(OUT_DIR, { recursive: true });
let before;
if (args.has('--after') && existsSync(resolve(OUT_DIR, 'before.json'))) {
  before = JSON.parse(readFileSync(resolve(OUT_DIR, 'before.json'), 'utf8'));
} else {
  ensureBefore();
  before = await render(BEFORE_ROOT, 'before');
}
const after = await render(AFTER_ROOT, 'after');
writeFileSync(HTML, buildHtml(before, after, { head: git('log', '-1', '--format=%h') }));
console.log(`review → ${HTML}`);
