#!/usr/bin/env node
// PACKAGING ITEMS — the real shelf in the labels tab's block, in a real browser. The labels themselves
// are rows of their own: scripts/sewn-label-row-probe.mjs. The whole shelf and sheet 05b with production
// CSS: scripts/packaging-shelf-probe.mjs. THE NETWORK IS STUBBED.
//
//   (1) empty state: the shelf shows ONLY the dashed `+ item` tile — no tile, no detail field;
//   (2) `+ item` opens the one picker; using a catalog material adds its tile and exactly one form row;
//   (3) an aux card goes in by kind rank, whatever the order of picking;
//   (4) a detail edit reaches the row, and clearing it again does NOT drop the row (keepBare);
//   (5) the picture of the pick shows on its tile, and only on its tile;
//   (6) the details have exactly ONE remove control, and it removes the row through the writer;
//   (7) carton row present, one `+ item`.
//
// Every run is checked on the real code AND on in-memory mutants that each must turn a named
// check red (the negative controls). The repository is never touched.
//
//   node scripts/labels-blocks-probe.mjs                  real + all mutants
//   node scripts/labels-blocks-probe.mjs --mutate=NAME    one mutant, output as is (red)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const ONLY = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').split('=')[1] ?? '';

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {}
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
const pw = resolvePlaywright();
if (!pw) {
  console.log('DID NOT RUN: playwright not found');
  process.exit(2);
}
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('DID NOT RUN: playwright without chromium');
  process.exit(2);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const C = 'src/components/managers/tech-card/components';

// [file suffix, from, to] + the check prefix that MUST go red.
const MUTANTS = {
  // the ✕ no longer calls the writer
  removeNoop: {
    file: `${C}/packaging-shelf.tsx`,
    from: 'onClick={disabled ? onClose : onRemove}',
    to: 'onClick={disabled ? onClose : () => {}}',
    breaks: '6',
  },
  // the tile ignores the pick's picture
  noPicture: {
    file: `${C}/packaging-shelf.tsx`,
    from: 'mediaUrl(item.pickedThumbnail) ||',
    to: '',
    breaks: '5',
  },
  // the details patch without keepBare: clearing the last field drops the row
  noKeepBare: {
    file: `${C}/packaging-shelf.tsx`,
    from: 'onPatch({ size: event.target.value }, { index, keepBare: true })',
    to: 'onPatch({ size: event.target.value }, { index, keepBare: false })',
    breaks: '4',
  },
  // the door opens nothing
  deadDoor: {
    file: `${C}/packaging-shelf.tsx`,
    from: 'onClick={() => setPickerOpen(true)}',
    to: 'onClick={() => {}}',
    breaks: '2',
  },
  // a new item lands at the end, not by kind rank
  noRank: {
    file: `${C}/form-writers.ts`,
    from: 'insertPackagingItemByRank(',
    to: '((_rows, row) => [..._rows, row])(',
    breaks: '3',
  },
};

async function bundle(mutant) {
  const m = mutant ? MUTANTS[mutant] : null;
  let hit = false;
  const outfile = resolve(tmpdir(), `labels-blocks-${process.pid}-${mutant || 'real'}.js`);
  await esbuild({
    entryPoints: [resolve(HERE, 'labels-blocks-probe-entry.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile,
    logLevel: 'silent',
    absWorkingDir: REPO,
    jsx: 'automatic',
    loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
    plugins: m
      ? [
          {
            name: 'mutate',
            setup(b) {
              b.onLoad({ filter: /\.(ts|tsx)$/ }, async (args) => {
                if (!args.path.endsWith(m.file)) return null;
                const src = await readFile(args.path, 'utf8');
                if (!src.includes(m.from)) throw new Error(`mutant ${mutant}: anchor not found`);
                hit = true;
                return { contents: src.split(m.from).join(m.to), loader: 'tsx' };
              });
            },
          },
        ]
      : [],
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
      store: resolve(REPO, 'src/store'),
      hooks: resolve(REPO, 'src/hooks'),
      context: resolve(REPO, 'src/context'),
      types: resolve(REPO, 'src/types'),
    },
  });
  if (m && !hit) throw new Error(`mutant ${mutant}: did not apply`);
  const text = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });
  return text;
}

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwMDEAAMADgIBAWiJ8fMAAAAASUVORK5CYII=';
const PNG = Buffer.from(PNG_B64, 'base64');
const media = (id) => ({
  id,
  media: {
    fullSize: { mediaUrl: `https://cdn.example/${id}-full.png`, width: 2, height: 2 },
    thumbnail: { mediaUrl: `https://cdn.example/${id}-thumb.png`, width: 2, height: 2 },
    blurhash: '',
  },
});

const MATERIALS = [
  {
    id: 301,
    name: 'poly bag small',
    code: 'PKG-301',
    materialClass: 'MATERIAL_CLASS_PACKAGING',
    image: media(601),
  },
  { id: 302, name: 'wooden hanger', code: 'PKG-302', materialClass: 'MATERIAL_CLASS_PACKAGING' },
];
const AUX = [{ id: 41, name: 'octagon tote', outputMaterialId: 77 }];

async function run(browser, code, log) {
  const results = [];
  const ck = (ok, what, d = '') => {
    results.push({ ok, what });
    if (log) console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
  };
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  // A mutant may take a control away: a step waits a few seconds, not thirty, and fails as a check.
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('http://probe.local/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.route('https://cdn.example/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  );
  await page.route('http://stub.invalid/**', (r) => {
    const url = r.request().url();
    const json = (o) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        body: JSON.stringify(o),
      });
    if (/api\/admin\/materials(\?|$)/.test(url)) return json({ materials: MATERIALS });
    if (/api\/admin\/tech-card\/list/.test(url)) return json({ techCards: AUX });
    return json({ list: [], total: 0 });
  });
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: code });
  await page.evaluate(() => window.__lb.mount());
  await page.waitForSelector('#packaging-spec', { timeout: 15000 });

  const form = () => page.evaluate(() => window.__lb.form());
  const rows = async () => (await form()).packagingItems ?? [];
  const S = '#packaging-spec';
  const DIALOG = '[role="dialog"]';
  const door = () => page.locator(`${S} button`, { hasText: /^\+ item$/i });
  const tile = (title) => page.locator(`${S} button[title="${title}"]`);
  const use = async (name) => {
    await door().click();
    await page.waitForSelector(DIALOG);
    await page.locator(`${DIALOG} [title="${name}"]`).click();
    await page.locator(`${DIALOG} button`, { hasText: /^use item$/i }).click();
    await page.waitForSelector(DIALOG, { state: 'detached' });
    await page.waitForTimeout(150);
  };
  const size = () => page.locator(`${S} div.min-w-0:has(> span:text-is("size")) input`).last();

  // (1) empty state
  try {
    const tiles = await page.locator(`${S} button[title]`).count();
    const remove = await page.locator(`${S} button[aria-label="remove item"]`).count();
    ck(
      tiles === 0 && remove === 0 && (await door().count()) === 1,
      '1 · empty items = only the + item tile',
      `tiles ${tiles}, removes ${remove}`,
    );
  } catch (e) {
    ck(false, '1 · step threw', String(e).split('\n')[0]);
  }

  // (2) picker + a catalog material
  try {
    await use('poly bag small');
    ck((await tile('poly bag small').count()) === 1, '2 · the picked thing has its tile');
    const ls = await rows();
    ck(
      ls.length === 1 && ls[0].key === 'polybag' && ls[0].materialId === 301,
      '2 · the form holds one row keyed polybag with the material',
      JSON.stringify(ls.map((l) => [l.key, l.materialId])),
    );
    ck((await door().count()) === 1, '2 · one + item after adding');
  } catch (e) {
    ck(false, '2 · step threw', String(e).split('\n')[0]);
  }

  // (3) kind rank
  try {
    await use('wooden hanger');
    await use('octagon tote');
    const keys = (await rows()).map((l) => l.key);
    ck(
      JSON.stringify(keys) === '["hanger","polybag","tote_bag"]',
      '3 · form keys in kind order',
      JSON.stringify(keys),
    );
    const tote = (await rows()).find((l) => l.key === 'tote_bag');
    ck(tote?.auxTechCardId === 41 && tote?.perOrder === true, '3 · the aux card is a per-order row');
  } catch (e) {
    ck(false, '3 · step threw', String(e).split('\n')[0]);
  }

  // (4) a detail edit by row; clearing keeps the row
  try {
    await tile('wooden hanger').click();
    await size().fill('42 cm');
    let row = (await rows()).find((l) => l.key === 'hanger');
    ck(row?.size === '42 cm', '4 · size reached the row');
    await size().fill('');
    await page.waitForTimeout(100);
    row = (await rows()).find((l) => l.key === 'hanger');
    ck(!!row && (await tile('wooden hanger').count()) === 1, '4 · clearing keeps a picked row and its tile');
    // A stored row without a pick: its size is its last fact, keepBare is what holds it.
    await tile('wooden hanger').click();
    const picked = await rows();
    await page.evaluate(
      (all) => window.__lb.set('packagingItems', all),
      [...picked, { key: 'tax stamp', size: '10 cm', qtyPerGarment: 1 }],
    );
    await page.waitForTimeout(100);
    await tile('tax stamp').click();
    await size().fill('');
    await page.waitForTimeout(100);
    ck((await rows()).some((l) => l.key === 'tax stamp'), '4 · clearing the last fact keeps a row without a pick');
    await tile('tax stamp').click().catch(() => {});
    await page.evaluate((all) => window.__lb.set('packagingItems', all), picked);
    await page.waitForTimeout(100);
    await tile('wooden hanger').click();
  } catch (e) {
    ck(false, '4 · step threw', String(e).split('\n')[0]);
  }

  // (5) the pick's picture
  try {
    ck(
      (await tile('poly bag small').locator('img').count()) === 1,
      '5 · the pick with a picture shows it on the tile',
    );
    ck((await tile('wooden hanger').locator('img').count()) === 0, '5 · and not on the neighbour');
  } catch (e) {
    ck(false, '5 · step threw', String(e).split('\n')[0]);
  }

  // (6) one remove control; it removes via the writer
  try {
    const removes = page.locator(`${S} button[aria-label="remove item"]`);
    ck((await removes.count()) === 1, '6 · exactly one remove control in the details');
    await removes.click();
    await page.waitForTimeout(150);
    const keys = (await rows()).map((l) => l.key);
    ck(
      JSON.stringify(keys) === '["polybag","tote_bag"]' &&
        (await tile('wooden hanger').count()) === 0,
      '6 · ✕ removed the row and the tile',
      JSON.stringify(keys),
    );
  } catch (e) {
    ck(false, '6 · step threw', String(e).split('\n')[0]);
  }

  // (7) packaging block
  try {
    ck(
      (await page.locator('label', { hasText: /^units per box$/ }).count()) === 1 &&
        (await page.locator(`${S} label`, { hasText: /^gross weight \(g\)$/ }).count()) === 1,
      '7 · carton row present (units per box, gross weight)',
    );
    ck((await door().count()) === 1, '7 · packaging keeps one + item');
  } catch (e) {
    ck(false, '7 · step threw', String(e).split('\n')[0]);
  }

  ck(errors.length === 0, 'no page errors', errors.join(' | '));
  await page.close();
  return results;
}

const browser = await chromium.launch();
let exit = 0;
try {
  if (ONLY) {
    if (!MUTANTS[ONLY]) {
      console.log(`unknown mutant ${ONLY}`);
      process.exit(2);
    }
    console.log(`MUTANT ${ONLY} (must go red on ${MUTANTS[ONLY].breaks})`);
    const r = await run(browser, await bundle(ONLY), true);
    exit = r.every((x) => x.ok) ? 1 : 0;
  } else {
    console.log('REAL CODE');
    const real = await run(browser, await bundle(''), true);
    const green = real.every((x) => x.ok);
    let caught = 0;
    for (const [name, m] of Object.entries(MUTANTS)) {
      const r = await run(browser, await bundle(name), false);
      const red = r.filter((x) => !x.ok && x.what.startsWith(`${m.breaks} `));
      console.log(
        `${red.length ? '✓ red on mutant ' : '✗ MUTANT SURVIVED '} ${name} → (${m.breaks})`,
      );
      if (red.length) caught += 1;
    }
    const all = green && caught === Object.keys(MUTANTS).length;
    console.log(
      `\n${green ? 'ALL GREEN (real code)' : 'RED ON REAL CODE'} · ${caught}/${Object.keys(MUTANTS).length} mutants caught`,
    );
    exit = all ? 0 : 1;
  }
} finally {
  await browser.close();
}
process.exit(exit);
