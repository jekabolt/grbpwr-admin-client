#!/usr/bin/env node
// СТЕНД ФЛЭТ-МАРШРУТА ПОСЛЕ 82-INPUT-REDESIGN (06.10; M7 07.10) — `scripts/flat-route-stand-entry.tsx`:
// ряд `GENERATE · target ▾ · (from my flat) · what the model gets ▸` без конструкции (ни ASK, ни
// пилюли маршрута, ни straps, ни замка чтения списка), `from my flat`, один лист → авто-разрез и
// авто-раскладка в слоты (квиз кандидатов снят, волна 10), `stale · discard` в FLAT SLOTS,
// `timed out · retry`, `taking too long`, повтор `hand_flat`.
// Снимки tmp/plans/flat-consistency/shots/redesign/*.png (или SHOTS_DIR).
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
const SHOTS = process.env.SHOTS_DIR
  ? resolve(process.env.SHOTS_DIR)
  : resolve(REPO, '../tmp/plans/flat-consistency/shots/redesign');
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
            if (window.__cacheHit) {
              // the free re-read: the same list at the same rev (a cache hit)
              window.__cacheHit = false;
              const joins = clone(window.__bands[card].joins);
              return { joins, cached: true };
            }
            await wait(1500);
            if (window.__failNextRead) {
              // the read failed for the client, but a list landed on the server meanwhile
              window.__failNextRead = false;
              window.__bands[card].joins = { ...clone(window.__joinsAuto), rev: 9 };
              const e = new Error('Unavailable: upstream');
              e.status = 503;
              throw e;
            }
            const joins = { ...clone(window.__joinsAuto), rev: 1 };
            window.__bands[card].joins = joins;
            return { joins, cached: false };
          }
          if (name === 'SetDesignJoins') {
            const band = window.__bands[card];
            if (window.__failNextSet) {
              window.__failNextSet = false;
              const e = new Error('Internal: the store is down');
              e.status = 500;
              throw e;
            }
            window.__sets = (window.__sets ?? 0) + 1;
            if (window.__sets === 1) {
              // somebody else saved a second ago
              band.joins = { ...band.joins, rev: (band.joins?.rev ?? 0) + 1 };
              if (window.__staleMutate) {
                band.joins = window.__staleMutate(clone(band.joins));
                window.__staleMutate = null;
              }
              const e = new Error('Aborted: joins_rev_mismatch');
              e.status = 409;
              throw e;
            }
            if ((body.expectedRev ?? 0) !== (band.joins?.rev ?? 0)) {
              const e = new Error('Aborted: joins_rev_mismatch');
              e.status = 409;
              throw e;
            }
            const joins = {
              ...clone(body.joins),
              rev: (band.joins?.rev ?? 0) + 1,
              edited: true,
              confirmed: !!body.confirm,
            };
            joins.absences = (joins.absences ?? []).filter((a) => /^(no|not|none|nothing|without|never|zero)\\b/i.test(a));
            joins.items = (joins.items ?? []).map((it, i) => ({ ...it, id: it.id || it.kind + '_' + i }));
            band.joins = joins;
            return { joins };
          }
          if (name === 'StartDesignRun') {
            const r = window.__startRefusal;
            if (r) {
              window.__startRefusal = null;
              const e = new Error(r.words ?? 'refused');
              e.status = r.status ?? 400;
              e.details = [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: r.reason, ...(r.meta ? { metadata: r.meta } : {}) }];
              throw e;
            }
            const n = (window.__runs = (window.__runs ?? 0) + 1);
            const mode = body.params?.flat?.mode ?? '';
            return {
              run: {
                id: 900 + n,
                kind: 'flat',
                status: 'pending',
                params: body.params,
                requestedOutputs: mode === 'straps' ? 4 : 2,
              },
            };
          }
          if (name === 'SplitDesignPicture') {
            // the cut lands as four pieces of the sheet, each with its view
            const run = Object.values(window.__bands)
              .flatMap((b) => b.runs ?? [])
              .find((r) => (r.pictures ?? []).some((p) => p.id === body.pictureId));
            if (!run) return {};
            if (run.pictures.some((p) => p.derivedFrom === body.pictureId)) return {};
            const sheet = run.pictures.find((p) => p.id === body.pictureId);
            const pieces = ['front', 'back', 'side_l', 'side_r'].map((v, k) => ({
              id: body.pictureId * 10 + k,
              runId: run.id,
              kind: 'flat',
              derivation: 'crop',
              derivedFrom: body.pictureId,
              ghostView: v,
              media: sheet.media,
            }));
            run.pictures = [...run.pictures, ...pieces];
            return { pictures: pieces };
          }
          if (name === 'GetTechCard') {
            return {
              techCard: {
                id: body.id,
                resolvedTechnicalMedia: [801, 802, 803].map((id, i) => ({
                  media: {
                    id,
                    media: { thumbnail: { mediaUrl: window.__sheets[i].url } },
                  },
                })),
              },
            };
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
      continuesInto: it.continues_into ?? [],
      type: it.type ?? '',
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
const CAP = { imageRunCapSeconds: 360, cappedRunKinds: ['flat', 'render'] };
const BANDS = {
  38: { ...CAP, bench: [], runs: [], references: refs, joins: joinsA },
  49: { ...CAP, bench: [], runs: [], references: refs.slice(0, 2) },
  60: {
    ...CAP,
    bench: ['front', 'back', 'side_l', 'side_r'].map((viewKey, i) => ({
      id: i + 1,
      viewKey,
      kind: 'flat',
      pictureId: 0,
      slotRev: 1,
    })),
    runs: [],
    references: refs.slice(0, 2),
    joins: { ...joinsA, rev: 7, confirmed: false, consistency: { consistent: true, groups: [] } },
  },
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

  const shot = (sel, name) => page.locator(sel).screenshot({ path: resolve(SHOTS, name) });
  const lastStart = async () => (await calls(page, 'StartDesignRun')).at(-1)?.body;
  const nStarts = async () => (await calls(page, 'StartDesignRun')).length;
  const generateLive = (sel) =>
    page.$eval(
      `${sel} [data-flat-generate] button`,
      (b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true',
    );
  const pressGenerate = async (sel) => {
    await page.click(`${sel} [data-flat-generate] button:has-text("generate")`);
    await page.waitForTimeout(400);
    await page
      .waitForFunction(
        (s) => !document.querySelector(`${s} [data-flat-generate] [aria-busy="true"]`),
        sel,
        { timeout: 10000 },
      )
      .catch(() => {});
  };

  // ── WAVE 10: THE LIST DOES NOT GATE GENERATE (no lock, no questions, no straps route) ──
  const U = '[data-probe="auto"]';
  await page.waitForSelector(`${U} [data-flat-run]`, { timeout: 10000 });
  await page.waitForTimeout(1500);
  check(
    'U1 no reading lock, no `generate without it ›`, no route pill (M7)',
    (await page
      .locator(
        `${U} [data-flat-reading], ${U} [data-flat-without-list], ${U} [data-flat-route-pill]`,
      )
      .count()) === 0,
  );
  check('U2 GENERATE is live while the list may still be read', await generateLive(U));
  const s0 = await nStarts();
  await pressGenerate(U);
  const w = await lastStart();
  check(
    'U3 GENERATE runs the photos route at once',
    (await nStarts()) === s0 + 1 && !w?.params?.flat && w?.params?.views?.length === 4,
    JSON.stringify(w?.params?.flat ?? null),
  );
  await shot(U, 'no-construction-gate.png');

  const M = '[data-probe="modes"]';
  await page.waitForSelector(`${M} [data-flat-run]`, { timeout: 10000 });
  await page.waitForTimeout(1500);
  check(
    'A1 a strap list asks nothing and locks nothing',
    (await page.locator(`${M} [data-ask-construction], ${M} [data-flat-skip-all]`).count()) === 0 &&
      (await generateLive(M)),
  );
  check(
    'A2 no `straps & openings` route',
    !((await page.textContent(`${M} [data-flat-run]`)) ?? '').includes('straps & openings'),
  );
  const s1 = await nStarts();
  await pressGenerate(M);
  const st = await lastStart();
  check(
    'A3 the press is the photos route, one sheet, no list saved',
    (await nStarts()) === s1 + 1 &&
      !st?.params?.flat &&
      st?.params?.layout === 'one' &&
      (await calls(page, 'SetDesignJoins')).filter((c) => c.body.techCardId === 60).length === 0,
    JSON.stringify(st?.params?.flat ?? null),
  );

  // ── FROM MY FLAT ──
  await page.click(`${M} [data-flat-myflat]`);
  await page.waitForSelector(`${M} [data-flat-structure]`);
  check(
    'H1 the toggle redraws the flats: no second «from my flat» word',
    (await page.locator(`${M} [data-flat-route-pill]`).count()) === 0 &&
      (await page.getAttribute(`${M} [data-flat-run]`, 'data-flat-route')) === 'hand_flat',
  );
  const roles = await page.$$eval(`${M} [data-flat-structure-tile]`, (els) =>
    els.map((e) => e.getAttribute('data-structure-role')).join(','),
  );
  check('H2 the first two flats are front and back', roles === 'front_flat,back_flat,', roles);
  await shot(M, 'from-my-flat.png');
  await pressGenerate(M);
  const hf = await lastStart();
  check(
    'H3 hand_flat with the picked flats',
    hf?.params?.flat?.mode === 'hand_flat' &&
      JSON.stringify(hf.params.flat.structureRefs) ===
        JSON.stringify([
          { mediaId: 801, role: 'front_flat' },
          { mediaId: 802, role: 'back_flat' },
        ]),
    JSON.stringify(hf?.params?.flat),
  );
  await page.click(`${M} [data-flat-myflat]`);
  check(
    'H4 off again: the tiles go',
    (await page.locator(`${M} [data-flat-structure]`).count()) === 0,
  );

  // ── ONE SHEET (wave 10: the candidate quiz is gone) ──
  const C = '[data-probe="bench-50"]';
  await page.waitForSelector(`${C} [data-inline-split="300"], ${C} [data-picture]`, {
    timeout: 20000,
  });
  check('C1 no quiz anywhere', (await page.locator('[data-candidate-quiz]').count()) === 0);
  const confirm = page.locator(`${C} [data-split-confirm="300"]`);
  await page.waitForTimeout(2500);
  if (
    (await page.locator(`${C} [data-picture]`).count()) === 0 &&
    (await confirm.count()) > 0 &&
    (await confirm.isEnabled())
  )
    await confirm.click();
  await page
    .waitForFunction(
      () => window.__calls.filter((c) => c.name === 'SetDesignBenchSlot').length >= 4,
      null,
      { timeout: 15000 },
    )
    .catch(() => {});
  const splits = await calls(page, 'SplitDesignPicture');
  check(
    'C2 the one sheet is cut',
    splits.length >= 1 && splits.every((s) => s.body.pictureId === 300),
    splits.map((s) => s.body.pictureId).join(','),
  );
  const placed = (await calls(page, 'SetDesignBenchSlot')).filter((c) => c.body.techCardId === 50);
  check(
    'C3 the four pieces go into the four slots by themselves',
    placed.length === 4 &&
      placed.map((c) => c.body.slot?.viewKey).join() === 'front,back,side_l,side_r',
    JSON.stringify(placed.map((c) => [c.body.slot?.viewKey, c.body.pictureId])),
  );
  await shot(C, 'one-sheet-applied.png');

  // a legacy four-candidate run: every sheet stands, nothing cut or applied by itself
  const N = '[data-probe="bench-54"]';
  await page.waitForSelector(`${N} [data-inline-split]`, { timeout: 10000 });
  await page.waitForTimeout(2500);
  check(
    'N1 legacy candidates: no quiz, no auto cut, no auto apply',
    (await page.locator(`${N} [data-candidate-quiz]`).count()) === 0 &&
      (await calls(page, 'SplitDesignPicture')).every((s) => s.body.pictureId === 300) &&
      (await calls(page, 'SetDesignBenchSlot')).every((c) => c.body.techCardId !== 54),
  );

  // ── STALE DETAIL ──
  const S = '[data-probe="slots-55"]';
  await page.waitForSelector(`${S} [data-detail-stale]`, { timeout: 10000 });
  check(
    'S1 a detail older than the views is `stale`',
    (await page.locator(`${S} [data-detail-stale]`).textContent()).includes('stale'),
  );
  await shot(S, 'stale-detail.png');
  // ── T75 · at rest, while `collar` still holds its (mixed-input) plate ──
  const D = `${S} [data-flat-details]`;
  const rest = await page.evaluate((d) => {
    const row = document.querySelector(d);
    return {
      inputs: row.querySelectorAll('input:not([type="file"])').length,
      mixed: /from mixed input/i.test(row.innerText),
      remove: [...row.querySelectorAll('button')].filter((b) =>
        /^remove$/i.test(b.innerText.trim()),
      ).length,
      caps: [...row.querySelectorAll('[data-detail-name]')].map((n) =>
        n.getAttribute('data-detail-name'),
      ),
    };
  }, D);
  check(
    'T75a no name field, no «from mixed input», no REMOVE under the detail cells',
    rest.inputs === 0 && !rest.mixed && rest.remove === 0,
    JSON.stringify(rest),
  );
  check(
    'T75b every detail name is a rename button in its cap',
    ['collar', 'cuff vent construction', 'pocket'].every((n) => rest.caps.includes(n)),
    JSON.stringify(rest.caps),
  );
  check(
    'T75h the filled detail has no delete ✕ (its ✕ takes the picture off) — and its tile ✕ is there',
    (await page.locator(`${D} [data-bench-slot="collar"] [data-detail-delete]`).count()) === 0 &&
      (await page
        .locator(`${D} [data-bench-slot="collar"] [aria-label="unmark collar"]`)
        .count()) === 1,
  );
  // the owner's reference: a filled detail beside an empty one with its ✕ (hovered)
  await page.hover(`${D} [data-bench-slot="cuff vent construction"]`);
  await page
    .locator(D)
    .screenshot({ path: process.env.T75_SHOT || resolve(SHOTS, 't75-details.png') });
  await page.click(`${S} [data-detail-stale-keep]`);
  await page.waitForTimeout(500);
  const kept = (await calls(page, 'SetDesignDetailKept')).at(-1)?.body;
  check(
    'S1b keep is stored on the server, against the views run it saw',
    kept?.slotId === 71 && kept?.keep === true && kept?.againstRunId === 120,
    JSON.stringify(kept),
  );
  await page.click(`${S} [data-detail-stale-discard]`);
  await page.waitForTimeout(500);
  const un = (await calls(page, 'SetDesignBenchSlot'))
    .filter((c) => c.body.techCardId === 55)
    .at(-1)?.body;
  check(
    'S2 discard empties the slot (the picture stays in the history)',
    un?.pictureId === 0 && un?.slot?.slotId === 71,
    JSON.stringify(un),
  );

  // ── T75 · DETAIL CELLS: name in the cap only, rename by click, ✕ in the empty frame ──
  const cuff = `${D} [data-bench-slot="cuff vent construction"]`;
  const setsBefore = (await calls(page, 'SetDesignBenchSlot')).length;
  await page.click(`${cuff} [data-detail-name]`);
  const capH = await page.$eval(
    `${cuff} [data-bench-cap]`,
    (n) => n.getBoundingClientRect().height,
  );
  await page.waitForSelector(`${cuff} [data-detail-rename]`);
  const capEditH = await page.$eval(
    `${cuff} [data-bench-cap]`,
    (n) => n.getBoundingClientRect().height,
  );
  await page.keyboard.type('xx');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const afterEsc = (await calls(page, 'SetDesignBenchSlot')).length;
  check(
    'T75c Esc cancels the rename — no write, the field closes',
    afterEsc === setsBefore && (await page.locator(`${cuff} [data-detail-rename]`).count()) === 0,
  );
  await page.click(`${cuff} [data-detail-name]`);
  await page.fill(`${cuff} [data-detail-rename]`, 'cuff vent');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const renamed = (await calls(page, 'SetDesignBenchSlot')).at(-1)?.body;
  check(
    'T75d Enter renames through SetDesignBenchSlot, echoing the (empty) plate',
    renamed?.slot?.slotId === 72 &&
      renamed?.newDetailName === 'cuff vent' &&
      renamed?.pictureId === 0,
    JSON.stringify(renamed),
  );
  check(
    'T75e the cap keeps its height while editing',
    Math.abs(capEditH - capH) < 1,
    `${capH} → ${capEditH}`,
  );
  await page.click(`${cuff} [data-detail-name]`);
  await page.fill(`${cuff} [data-detail-rename]`, '   ');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check(
    'T75f an empty name keeps the old one — no write',
    (await calls(page, 'SetDesignBenchSlot')).length === afterEsc + 1,
  );
  // the ✕ lives inside the empty frame, clear of FROM MEDIA / DRAW, and the filled cell has none
  await page.hover(cuff);
  const geo = await page.evaluate((c) => {
    const cell = document.querySelector(c);
    const x = cell.querySelector('[data-detail-delete]');
    const box = cell.querySelector('[data-place-or-draw]').getBoundingClientRect();
    const xr = x.getBoundingClientRect();
    const words = [...cell.querySelectorAll('[data-place-or-draw] *')]
      .filter((n) => n.children.length === 0 && /^(from media|draw)$/i.test(n.textContent.trim()))
      .map((n) => n.getBoundingClientRect());
    const hit = (a, b) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return {
      inside:
        xr.left >= box.left &&
        xr.right <= box.right &&
        xr.top >= box.top &&
        xr.bottom <= box.bottom,
      words: words.length,
      overlap: words.some((w) => hit(w, xr)),
      label: x.getAttribute('aria-label'),
      opacity: getComputedStyle(x).opacity,
    };
  }, cuff);
  check(
    'T75g the empty detail has a ✕ inside its frame, clear of FROM MEDIA / DRAW, shown on hover',
    geo.inside &&
      geo.words === 2 &&
      !geo.overlap &&
      geo.opacity === '1' &&
      /^delete detail /.test(geo.label),
    JSON.stringify(geo),
  );
  await page.click(`${cuff} [data-detail-delete]`);
  await page.waitForTimeout(400);
  const del1 = await calls(page, 'DeleteDesignDetailSlot');
  check(
    'T75i a detail nothing points at is deleted by its ✕ at once',
    del1.length === 1 &&
      del1[0].body.slotId === 72 &&
      (await page.locator('[role="dialog"]').count()) === 0,
    JSON.stringify(del1.map((c) => c.body)),
  );
  const pocket = `${D} [data-bench-slot="pocket"]`;
  await page.hover(pocket);
  await page.click(`${pocket} [data-detail-delete]`);
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  const ask = await page.locator('[role="dialog"]').innerText();
  const del2 = (await calls(page, 'DeleteDesignDetailSlot')).length;
  await page.getByRole('button', { name: /^delete detail$/i }).click();
  await page.waitForTimeout(400);
  const del3 = await calls(page, 'DeleteDesignDetailSlot');
  check(
    'T75j a detail a run asked for asks first, then deletes',
    del2 === 1 && /1 run/.test(ask) && del3.length === 2 && del3[1].body.slotId === 73,
    JSON.stringify({ ask: ask.replace(/\s+/g, ' '), n: del3.length }),
  );

  // ── FAILED / LATE ──
  const F = '[data-probe="bench-51"]';
  await page.waitForSelector(`${F} [data-latest-failed]`, { timeout: 10000 });
  check(
    'F1 timed out · retry',
    (await page.locator(`${F} [data-latest-failed]`).textContent()).includes('timed out'),
  );
  const f0 = await nStarts();
  await page.click(`${F} [data-latest-retry]`);
  await page.click(`${F} [data-latest-retry]`, { force: true }).catch(() => {});
  await page.waitForTimeout(500);
  const fr = (await calls(page, 'StartDesignRun')).slice(f0);
  check(
    'F2 retry repeats the run, once on a double press',
    fr.length === 1 && fr[0].body.rerunOfRunId === 91,
    JSON.stringify(fr.map((s) => s.body.rerunOfRunId)),
  );
  const L = '[data-probe="bench-52"]';
  await page.waitForSelector(`${L} [data-live-tile]`, { timeout: 10000 });
  check('L1 taking too long', (await page.locator(L).textContent()).includes('taking too long'));
  const cancel = page.locator(`${L} [data-run-cancel]`);
  check(
    'L2 cancel in plain sight',
    (await cancel.evaluate((e) => getComputedStyle(e).opacity)) === '1',
  );

  // a rerun carries the parent's flat block
  const R = '[data-probe="bench-62"]';
  await page.waitForSelector(`${R} [data-latest-retry]`, { timeout: 10000 });
  await page.click(`${R} [data-latest-retry]`);
  await page.waitForTimeout(500);
  const rerun = await lastStart();
  check(
    'X1 retry repeats with the parent params.flat',
    rerun.rerunOfRunId === 95 && rerun.params.flat?.mode === 'hand_flat',
    JSON.stringify(rerun.params.flat),
  );
  await page.screenshot({ path: resolve(SHOTS, 'stand-full.png'), fullPage: true });
  await ctx.close();
} finally {
  await browser.close();
}
console.log(fail ? `flat route stand: ${fail} failed` : 'flat route stand: all ok');
process.exit(fail ? 1 : 0);
