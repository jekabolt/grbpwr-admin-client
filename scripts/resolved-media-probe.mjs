#!/usr/bin/env node
// RESOLVED MEDIA: AN ID OUTSIDE THE NEWEST-500 LIBRARY WINDOW STILL RESOLVES (live bug 06.10).
//
// Card 38 drew «NO IMAGE · media #125 not resolved» on all three INPUT — REFERENCES tiles: the
// screen resolved ids only through the newest 500 library items, beta had reached id 722, and the
// August references (124–126) had fallen out. `useResolvedMediaQuery` walks the library pages past
// the window for the ids neither the window nor the caller's `known` resolves.
//
// Fixture: a library of ids 1..722, served newest first, 500 per page.
//   A — ids 124, 125, 126 (outside the window) + 700 (inside) all resolve, with ONE extra page read;
//   B — an id in the window only: NO page past the window is read;
//   C — an id outside the window that the caller already knows: NO page past the window is read;
//   D — a deleted id (9999): the walk stops at the short last page, the hook settles (not pending).
//
//   node scripts/resolved-media-probe.mjs                 run
//   node scripts/resolved-media-probe.mjs --mutate-nowalk the walk disabled → A must fail
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUTATE_NOWALK = process.argv.includes('--mutate-nowalk');

function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    /* npx cache below */
  }
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const found = execFileSync(
      'find',
      [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)[0];
    return found ? `${found}/index.js` : null;
  } catch {
    return null;
  }
}

const entryPath = resolvePlaywright();
if (!entryPath) {
  console.log('playwright not found — probe skipped (not a failure)');
  process.exit(0);
}
const mod = await import(entryPath);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright without chromium — probe skipped');
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `resolved-media-${process.pid}.js`);

const WALK_ON = `    enabled: missingKey !== '',`;
const WALK_OFF = `    enabled: false,`;
const plugins = [];
if (MUTATE_NOWALK)
  plugins.push({
    name: 'resolved-media-mutation',
    setup(b) {
      b.onLoad({ filter: /useMediaQuery\.ts$/ }, async (args) => {
        const src = await readFile(args.path, 'utf8');
        if (!src.includes(WALK_ON)) throw new Error('mutation did not find its line');
        return { contents: src.replace(WALK_ON, WALK_OFF), loader: 'ts' };
      });
    },
  });

await esbuild({
  entryPoints: [resolve(HERE, 'resolved-media-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  plugins,
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'),
    utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'),
    constants: resolve(REPO, 'src/constants'),
    hooks: resolve(REPO, 'src/hooks'),
  },
});
const bundle = readFileSync(outfile, 'utf8');

const NEWEST = 722;
const library = Array.from({ length: NEWEST }, (_, i) => {
  const id = NEWEST - i;
  return { id, media: { thumbnail: { mediaUrl: `https://cdn.invalid/${id}.jpg` } } };
});

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
let offsets = [];
await page.route('http://stub.invalid/**', (route) => {
  const url = new URL(route.request().url());
  if (!url.pathname.endsWith('/api/admin/content'))
    return route.fulfill({ status: 404, body: '{}' });
  const limit = Number(url.searchParams.get('limit') ?? 0);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  offsets.push(offset);
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ list: library.slice(offset, offset + limit) }),
  });
});

async function run(ids, knownIds = []) {
  offsets = [];
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(([i, k]) => window.__resolved.mount(i, k), [ids, knownIds]);
  await page.waitForFunction(() => window.__resolved.out && !window.__resolved.out.pending, null, {
    timeout: 10000,
  });
  await page.waitForTimeout(150);
  return { ...(await page.evaluate(() => window.__resolved.out)), offsets: [...offsets] };
}

let bad = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${detail}`}`);
  if (!ok) bad++;
};

const a = await run([124, 125, 126, 700]);
check(
  'A: ids 124/125/126 (outside the 500 window) and 700 resolve',
  JSON.stringify(a.resolved) === '[124,125,126,700]',
  `resolved ${JSON.stringify(a.resolved)}`,
);
check(
  'A: one page past the window is read (offset 500)',
  JSON.stringify(a.offsets.sort((x, y) => x - y)) === '[0,500]',
  `offsets ${JSON.stringify(a.offsets)}`,
);

const b = await run([700, 300]);
check(
  'B: ids inside the window — no page past it',
  JSON.stringify(b.offsets) === '[0]' && b.resolved.length === 2,
  `offsets ${JSON.stringify(b.offsets)} resolved ${JSON.stringify(b.resolved)}`,
);

const c = await run([700], [125]);
check(
  'C: an outside id the caller already knows — no page past the window',
  JSON.stringify(c.offsets) === '[0]',
  `offsets ${JSON.stringify(c.offsets)}`,
);

const d = await run([9999, 125]);
check(
  'D: a deleted id settles at the short last page, the live one still resolves',
  !d.pending && !d.error && JSON.stringify(d.resolved) === '[125]' && d.offsets.length === 2,
  `out ${JSON.stringify(d)}`,
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nall green');
if (bad) process.exitCode = 1;
