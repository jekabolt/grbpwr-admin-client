#!/usr/bin/env node
// PACKAGING ITEMS — the real shelf in the labels tab's block, in a real browser. The labels themselves
// are rows of their own: scripts/sewn-label-row-probe.mjs. The whole shelf and sheet 05b with production
// CSS: scripts/packaging-shelf-probe.mjs. THE NETWORK IS STUBBED.
//
//   (1) empty pack with one add door and no pack-row controls;
//   (2) confirm a catalog pick and write one row with its owned BOM line;
//   (3) choose hanger separately and verify kind rank and auxiliary defaults;
//   (4) edit quantity by row and preserve the row's identity on clearing the last detail;
//   (5) only the picked material with a picture displays that image;
//   (6) remove the pack row and its owned BOM line, then undo both;
//   (7) the empty shipping box leaves per-box quantity disabled.
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
import { build as esbuild } from './probe-esbuild.mjs';

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
    from: 'onClick={() => removePackItem(index)}',
    to: 'onClick={() => {}}',
    breaks: '6',
  },
  // the tile ignores the pick's picture
  noPicture: {
    file: `${C}/packaging-shelf.tsx`,
    from: 'const media = mediaUrl(item.pickedThumbnail) ? item.pickedThumbnail : resolved;',
    to: 'const media = resolved;',
    breaks: '5',
  },
  // the details patch without keepBare: clearing the last field drops the row
  noKeepBare: {
    file: `${C}/packaging-shelf.tsx`,
    from: '{ index, keepBare: true },',
    to: '{ index, keepBare: false },',
    breaks: '4',
  },
  // the door opens nothing
  deadDoor: {
    file: `${C}/packaging-shelf.tsx`,
    from: "onClick={() => setPicker('pack')}",
    to: 'onClick={() => {}}',
    breaks: '2',
  },
  // a new item lands at the end, not by kind rank
  noRank: {
    file: `${C}/form-writers.ts`,
    from: 'insertPackagingItemByRank(',
    to: '((_rows, row) => ({ rows: [..._rows, row], index: _rows.length }))(',
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
  const shelf = page.locator('#packaging-spec');
  const dialog = page.getByRole('dialog');
  const button = (name) => shelf.getByRole('button', { name, exact: true });
  const door = () => button('+ item');
  const remove = (name) => button(`remove ${name}`);
  const itemRow = (name) => remove(name).locator('..');
  const quantity = (name) => itemRow(name).getByRole('spinbutton', { name: 'per garment' });
  const use = async (trigger, name) => {
    await trigger.click();
    await dialog.locator(`button[title="${name}"]`).click();
    await dialog.getByRole('button', { name: 'done', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
  };

  // (1) empty state
  ck(
    (await shelf.getByRole('spinbutton', { name: 'per garment' }).count()) === 0 &&
      (await shelf.getByRole('button', { name: /^remove / }).count()) === 0 &&
      (await door().count()) === 1,
    '1 · empty pack has one add door and no row controls',
  );

  // (2) picker + a catalog material
  try {
    await use(door(), 'poly bag small');
    const current = await form();
    const [polybag] = current.packagingItems ?? [];
    ck((await itemRow('poly bag small').count()) === 1, '2 · the picked material has one pack row');
    ck(
      current.packagingItems.length === 1 && polybag.key === 'polybag' && polybag.materialId === 301,
      '2 · the form holds one row keyed polybag with the material',
    );
    ck(
      !!polybag.bomLineKey &&
        current.bomItems.filter((line) => line.lineKey === polybag.bomLineKey && line.materialId === 301).length === 1,
      '2 · the material owns its exact BOM line',
    );
    ck((await door().count()) === 1, '2 · one + item after adding');
  } catch (e) {
    ck(false, '2 · step threw', String(e).split('\n')[0]);
  }

  // (3) kind rank across the separate hanger picker and the pack
  try {
    await button('on hanger').click();
    await use(button('+ hanger'), 'wooden hanger');
    await use(door(), 'octagon tote');
    const current = await rows();
    const keys = current.map((item) => item.key);
    ck(keys.join() === 'hanger,polybag,tote_bag', '3 · form keys in kind order', keys.join());
    ck(current[0]?.materialId === 302, '3 · the separate hanger is the picked catalog material');
    const tote = current.find((item) => item.key === 'tote_bag');
    ck(tote?.auxTechCardId === 41 && tote?.perOrder === true, '3 · the aux card is a per-order row');
  } catch (e) {
    ck(false, '3 · step threw', String(e).split('\n')[0]);
  }

  // (4) changing quantity writes the chosen row. The default leaves a chosen bare row in place.
  try {
    await quantity('poly bag small').fill('3');
    ck(
      (await rows()).find((item) => item.key === 'polybag')?.qtyPerGarment === 3 &&
        (await rows()).find((item) => item.key === 'tote_bag')?.qtyPerGarment === 1,
      '4 · quantity writes only its own row',
    );
    await quantity('poly bag small').fill('');
    ck(
      (await rows()).find((item) => item.key === 'polybag')?.qtyPerGarment === 1 &&
        (await itemRow('poly bag small').count()) === 1,
      '4 · clearing restores default quantity and keeps a picked row',
    );
    const picked = await rows();
    await page.evaluate(
      (all) => window.__lb.set('packagingItems', all),
      [...picked, { key: 'tax stamp', qtyPerGarment: 2 }],
    );
    await quantity('item').fill('');
    ck(
      (await rows()).find((item) => item.key === 'tax stamp')?.qtyPerGarment === 1,
      '4 · clearing the last fact keeps a row without a pick',
    );
    await page.evaluate((all) => window.__lb.set('packagingItems', all), picked);
  } catch (e) {
    ck(false, '4 · step threw', String(e).split('\n')[0]);
  }

  // (5) the pick's picture belongs to its own row only.
  const image = itemRow('poly bag small').getByRole('img', { name: 'poly bag small' });
  ck(
    (await image.count()) === 1 &&
      (await image.getAttribute('src'))?.startsWith('https://cdn.example/601-'),
    '5 · the photographed material has its exact picture',
  );
  ck(
    (await itemRow('octagon tote').locator('img').count()) === 0,
    '5 · its neighbouring row without a picture has no image',
  );

  // (6) one remove control for the selected row. Removal and undo own both wire rows.
  try {
    const before = await form();
    const polybag = before.packagingItems.find((item) => item.key === 'polybag');
    ck((await remove('poly bag small').count()) === 1, '6 · one remove control for the row');
    await remove('poly bag small').click();
    const after = await form();
    const keys = after.packagingItems.map((item) => item.key);
    ck(
      keys.join() === 'hanger,tote_bag' && (await itemRow('poly bag small').count()) === 0 &&
        !after.bomItems.some((line) => line.lineKey === polybag.bomLineKey),
      '6 · removal clears only the selected pack row and its BOM line',
      keys.join(),
    );
    await button('undo').click();
    const restored = await form();
    ck(
      JSON.stringify(restored.packagingItems) === JSON.stringify(before.packagingItems) &&
        JSON.stringify(restored.bomItems) === JSON.stringify(before.bomItems),
      '6 · undo restores the exact pack items and BOM lines',
    );
  } catch (e) {
    ck(false, '6 · step threw', String(e).split('\n')[0]);
  }

  // (7) shipping box
  ck(
    (await button('+ box').count()) === 1 &&
      (await shelf.getByRole('spinbutton', { name: 'per box' }).isDisabled()),
    '7 · shipping box opens separately and quantity is disabled until picked',
  );
  ck((await door().count()) === 1, '7 · packaging keeps one + item');

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
