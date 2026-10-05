#!/usr/bin/env node
// СТЕНД ФЛЭТ-МАРШРУТА (05.10) — `scripts/flat-route-stand-entry.tsx`: блок JOINS (список A карточки
// 38, CAS-повтор, правка, отсутствие, слой, выбор фото), авто-чтение списка, 4 кандидата (`grey`,
// `pick` → режется только выбранный), `timed out · retry`, `taking too long` + `cancel`.
// Снимки tmp/plans/flat-consistency/shots/route-*.png.
//
//   node scripts/flat-route-shot.mjs     (нужен `yarn build` — CSS из dist)
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SHOTS = resolve(REPO, '../tmp/plans/flat-consistency/shots');
const LAYERS = resolve(REPO, '../tmp/plans/flat-consistency/out/layers');
function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {
    /* не в зависимостях — ищем в кэше npx */
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
      .filter(Boolean);
    for (const dir of found) if (existsSync(`${dir}/.local-browsers`)) return `${dir}/index.js`;
    return found[0] ? `${found[0]}/index.js` : null;
  } catch {
    return null;
  }
}

const entryPath = resolvePlaywright();
if (!entryPath) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const mod = await import(entryPath);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const stubNetwork = {
  name: 'stub-network',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub:api', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `
        const nope = () => Promise.resolve({});
        window.__calls = [];
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
        const reply = async (name, body) => {
          const card = body?.techCardId ?? 0;
          if (name === 'GetDesignBand') return clone(window.__bands[card] ?? { bench: [], runs: [] });
          if (name === 'GenerateDesignJoins') {
            await wait(1500);
            const joins = { ...clone(window.__joinsAuto), rev: 1 };
            window.__bands[card].joins = joins;
            return { joins, cached: false };
          }
          if (name === 'SetDesignJoins') {
            const band = window.__bands[card];
            window.__sets = (window.__sets ?? 0) + 1;
            if (window.__sets === 1) {
              // somebody else saved a second ago
              band.joins = { ...band.joins, rev: (band.joins?.rev ?? 0) + 1 };
              const e = new Error('Aborted: joins_rev_mismatch');
              e.status = 409;
              throw e;
            }
            if ((body.expectedRev ?? 0) !== (band.joins?.rev ?? 0)) {
              const e = new Error('Aborted: joins_rev_mismatch');
              e.status = 409;
              throw e;
            }
            const joins = { ...clone(body.joins), rev: (band.joins?.rev ?? 0) + 1, edited: true };
            joins.absences = (joins.absences ?? []).filter((a) => /^(no|not|none|nothing|without|never|zero)\\b/i.test(a));
            joins.items = (joins.items ?? []).map((it, i) => ({ ...it, id: it.id || it.kind + '_' + i }));
            band.joins = joins;
            return { joins };
          }
          if (name === 'SetDesignReferenceRole') {
            const band = window.__bands[card];
            band.references = (band.references ?? []).filter((r) => r.mediaId !== body.mediaId || body.role);
            return {};
          }
          return {};
        };
        export const adminService = new Proxy({}, { get: (_, name) => (body) => {
          window.__calls.push({ name: String(name), body: clone(body ?? {}) });
          return reply(String(name), body);
        } });
        export const requestHandler = (req) => {
          window.__calls.push({ name: 'requestHandler', body: req });
          return Promise.resolve({});
        };
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: REPO,
    }));
  },
};

const outfile = resolve(tmpdir(), `flat-route-stand-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'flat-route-stand-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
  plugins: [stubNetwork],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
  banner: { js: 'var __STUB_ENV__ = {};' },
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'),
    utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'),
    constants: resolve(REPO, 'src/constants'),
    store: resolve(REPO, 'src/store'),
    hooks: resolve(REPO, 'src/hooks'),
  },
});
const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });

const cssDir = resolve(REPO, 'dist/assets');
const CSS = existsSync(cssDir)
  ? execFileSync('find', [cssDir, '-maxdepth', '1', '-name', 'index-*.css'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
  : '';
if (!CSS) {
  console.log('dist/assets/index-*.css не найден — соберите `yarn build`; стенд пропущен');
  process.exit(0);
}
if (!existsSync(resolve(LAYERS, 'joins-A.json'))) {
  console.log('joins-A.json не найден — стенд пропущен');
  process.exit(0);
}
mkdirSync(SHOTS, { recursive: true });

// joins-A (the model's JSON) → the wire's DesignJoins
const A = JSON.parse(readFileSync(resolve(LAYERS, 'joins-A.json'), 'utf8'));
const wireJoins = (d, rev) => ({
  rev,
  model: 'anthropic/claude-opus-5.5',
  edited: false,
  layers: d.layers,
  uncertain: d.uncertain ?? [],
  absences: d.absent ?? d.absences ?? [],
  items: d.items.map((it) => {
    const path = it.path ?? [];
    return {
      id: it.id,
      kind: it.kind,
      from: it.kind === 'pocket' ? it.anchor ?? path[0] ?? '' : path[0] ?? '',
      to: it.kind === 'pocket' ? '' : path[path.length - 1] ?? '',
      via: path.slice(1, -1),
      width: it.width ?? '',
      text: it.note ?? '',
      layer: it.layer ?? 0,
      visibility: it.visibility ?? 'visible',
      boundedBy: it.bounded_by ?? [],
      freeEdge: !!it.free_edge,
      caughtInto: it.caught_into ?? [],
      sharp: it.sharp ?? [],
    };
  }),
});
const sheet = (n) => {
  const b = readFileSync(resolve(LAYERS, `test1/sheet-${n}.png`));
  return {
    url: `data:image/png;base64,${b.toString('base64')}`,
    w: b.readUInt32BE(16),
    h: b.readUInt32BE(20),
  };
};
const SHEETS = [1, 2, 3, 4].map(sheet);
const joinsA = wireJoins(A, 4);
joinsA.absences = [...joinsA.absences, 'no sleeves', 'no back neckline'];
joinsA.consistency = {
  consistent: false,
  note: 'photo 3 shows another garment',
  keepMediaIds: [1, 2],
  groups: [
    { mediaIds: [1, 2], what: 'white sheer rib top, crossed straps' },
    { mediaIds: [3], what: 'grey tank, other garment' },
  ],
};
const refs = [1, 2, 3].map((id, i) => ({
  mediaId: id,
  role: ['front', 'back', 'side_r'][i],
  ordinal: i + 1,
}));
const BANDS = {
  38: { bench: [], runs: [], references: refs, joins: joinsA },
  49: { bench: [], runs: [], references: refs.slice(0, 2) },
};
const AUTO = {
  ...wireJoins({ ...A, layers: [] }, 1),
  consistency: { consistent: true, groups: [] },
};
AUTO.items = AUTO.items.slice(0, 6).map((it) => ({ ...it, layer: 0, visibility: 'visible' }));

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const calls = (page, name) =>
  page.evaluate((n) => window.__calls.filter((c) => c.name === n), name);

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1150, height: 1600 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.evaluate(
    ([b, s, a]) => {
      window.__bands = b;
      window.__sheets = s;
      window.__joinsAuto = a;
    },
    [BANDS, SHEETS, AUTO],
  );
  await page.addScriptTag({ content: bundle });

  // ── JOINS ──
  const J = '[data-probe="joins"]';
  await page.waitForSelector(`${J} [data-join-row]`, { timeout: 20000 });
  check(
    'J1 the read is not repeated over a stored list',
    (await calls(page, 'GenerateDesignJoins')).filter((c) => c.body.techCardId === 38).length === 0,
  );
  check('J2 layers group the rows', (await page.$$(`${J} [data-join-layer]`)).length === 3);
  check('J3 photos disagree pill', !!(await page.$(`${J} [data-joins-disagree]`)));
  await page
    .locator(`${J} [data-flat-joins]`)
    .screenshot({ path: resolve(SHOTS, 'route-joins.png') });

  // AUTO read: reading… then rows
  const U = '[data-probe="auto"]';
  check('U1 reading… while the first read runs', !!(await page.$(`${U} [data-joins-reading]`)));
  await page
    .locator(`${U} [data-flat-joins]`)
    .screenshot({ path: resolve(SHOTS, 'route-joins-reading.png') });
  await page.waitForSelector(`${U} [data-join-row]`, { timeout: 20000 });
  check('U2 one read for the card', (await calls(page, 'GenerateDesignJoins')).length === 1);
  await page
    .locator(`${U} [data-flat-joins]`)
    .screenshot({ path: resolve(SHOTS, 'route-joins-auto.png') });

  // edit a row: double-click, change the note, Enter — the first write is stale, the edit is re-applied
  const first = page.locator(`${J} [data-join-row^="item:"] span[role="button"]`).first();
  const before = await first.getAttribute('title');
  await first.dblclick();
  const input = page.locator(`${J} input[aria-label="edit join"]`);
  await input.waitFor();
  const v = await input.inputValue();
  await input.fill(v.replace(/ — .*/, '') + ' — front only, stand-up');
  await input.press('Enter');
  await page.waitForFunction(() => (window.__sets ?? 0) >= 2, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  const sets = await calls(page, 'SetDesignJoins');
  check(
    'E1 a stale rev is retried once on the fresh rev',
    sets.length === 2 && sets[1].body.expectedRev === sets[0].body.expectedRev + 1,
    sets.map((s) => s.body.expectedRev).join(','),
  );
  check(
    'E2 the retry carries the edit',
    JSON.stringify(sets[1].body.joins.items[0].text) === '"front only, stand-up"',
    sets[1].body.joins.items[0].text,
  );
  check(
    'E3 the row shows it',
    (await first.textContent()).includes('front only, stand-up'),
    before,
  );

  // add an absence through + join; a refused line says why
  await page.click(`${J} [data-joins-add]`);
  const add = page.locator(`${J} input[aria-label="new join"]`);
  await add.fill('nonsense words');
  await add.press('Enter');
  check(
    'A1 a line with no kind is refused in words',
    (await page.locator(`${J} .text-error`).count()) > 0,
  );
  await add.fill('no pocket');
  await add.press('Enter');
  await page.waitForTimeout(500);
  check(
    'A2 the absence is saved',
    (await calls(page, 'SetDesignJoins')).at(-1).body.joins.absences.includes('no pocket'),
  );
  await page.click(`${J} [data-joins-add]`);
  await add.fill('binding narrow UA_L → BUSTSIDE_L → BUST_C — test');
  await add.press('Enter');
  await page.waitForTimeout(500);
  const added = (await calls(page, 'SetDesignJoins')).at(-1).body.joins.items.at(-1);
  check(
    'A3 a typed join is parsed onto the ruler',
    added.kind === 'binding' &&
      added.from === 'UA_L' &&
      added.to === 'BUST_C' &&
      added.via[0] === 'BUSTSIDE_L' &&
      added.width === 'narrow',
    JSON.stringify(added),
  );

  // visibility cycles
  const glyph = page.locator(`${J} [data-join-visibility]`).first();
  const was = await glyph.getAttribute('data-join-visibility');
  await glyph.click();
  await page.waitForTimeout(500);
  check(
    'V1 the visibility glyph cycles',
    (await glyph.getAttribute('data-join-visibility')) !== was,
    was,
  );

  // photos: pick group 1 only → keep_media_ids, the third reference loses its role
  await page.click(`${J} [data-joins-disagree]`);
  await page.waitForSelector(`${J} [data-joins-pick]`);
  await page
    .locator(`${J} [data-flat-joins]`)
    .screenshot({ path: resolve(SHOTS, 'route-joins-pick.png') });
  await page.click(`${J} [data-joins-keep]`);
  await page.waitForTimeout(800);
  const keep = (await calls(page, 'SetDesignJoins')).at(-1).body.joins.consistency.keepMediaIds;
  const roles = await calls(page, 'SetDesignReferenceRole');
  check('P1 kept photos stored', JSON.stringify(keep) === '[1,2]', JSON.stringify(keep));
  check(
    'P2 the left-out photo leaves the input',
    roles.length === 1 && roles[0].body.mediaId === 3 && roles[0].body.role === '',
    JSON.stringify(roles.map((r) => r.body)),
  );
  await page
    .locator(`${J} [data-flat-joins]`)
    .screenshot({ path: resolve(SHOTS, 'route-joins-after.png') });

  // ── CANDIDATES ──
  const C = '[data-probe="bench-50"]';
  await page.waitForSelector(`${C} [data-picture="300"]`, { timeout: 20000 });
  check(
    'C1 four candidates, none cut',
    (await page.$$(`${C} [data-picture]`)).length === 4 &&
      !(await page.$(`${C} [data-inline-split]`)),
  );
  check(
    'C2 the grey one is labelled',
    (await page.locator(`${C} [data-picture="301"]`).textContent()).includes('grey'),
  );
  await page.locator(C).screenshot({ path: resolve(SHOTS, 'route-candidates.png') });
  await page.hover(`${C} [data-picture="302"]`);
  await page.locator(`${C} [data-picture="302"] button`, { hasText: 'pick' }).click();
  await page.waitForSelector(`${C} [data-inline-split="302"]`, { timeout: 10000 });
  check(
    'C3 only the picked one opens the cut',
    (await page.$$(`${C} [data-inline-split]`)).length === 1,
  );
  await page.waitForTimeout(3000);
  const splits = await calls(page, 'SplitDesignPicture');
  check(
    'C4 no other candidate is auto-cut',
    splits.every((s) => s.body.pictureId === 302),
    splits.map((s) => s.body.pictureId).join(','),
  );
  await page.locator(C).screenshot({ path: resolve(SHOTS, 'route-candidates-picked.png') });

  // ── FAILED / LATE ──
  const F = '[data-probe="bench-51"]';
  await page.waitForSelector(`${F} [data-latest-failed]`, { timeout: 10000 });
  check(
    'F1 timed out · retry',
    (await page.locator(`${F} [data-latest-failed]`).textContent()).includes('timed out'),
  );
  await page.click(`${F} [data-latest-retry]`);
  await page.waitForTimeout(500);
  const starts = await calls(page, 'StartDesignRun');
  check(
    'F2 retry repeats the run',
    starts.length === 1 && starts[0].body.rerunOfRunId === 91,
    JSON.stringify(starts.map((s) => s.body.rerunOfRunId)),
  );
  await page.locator(F).screenshot({ path: resolve(SHOTS, 'route-failed.png') });
  const L = '[data-probe="bench-52"]';
  await page.waitForSelector(`${L} [data-live-tile]`, { timeout: 10000 });
  check('L1 taking too long', (await page.locator(L).textContent()).includes('taking too long'));
  const cancel = page.locator(`${L} [data-run-cancel]`);
  check(
    'L2 cancel in plain sight',
    (await cancel.evaluate((e) => getComputedStyle(e).opacity)) === '1',
  );
  await page.locator(L).screenshot({ path: resolve(SHOTS, 'route-late.png') });
  await ctx.close();
} finally {
  await browser.close();
}
console.log(fail ? `flat route stand: ${fail} failed` : 'flat route stand: all ok');
process.exit(fail ? 1 : 0);
