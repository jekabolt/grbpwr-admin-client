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
  49: { ...CAP, bench: [], runs: [], references: refs.slice(0, 2) },
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
  check(
    'J4 notes are tooltips, not text',
    !(await page.locator(`${J} [data-join-row^="item:"]`).first().textContent()).includes(
      'High crew',
    ),
  );
  const chips = await page.locator(`${J} [data-joins-absence]`).allTextContents();
  check(
    'J5 absences: one row of chips, deduped',
    (await page.$$(`${J} [data-joins-absences]`)).length === 1 &&
      chips.filter((c) => /^no sleeves/i.test(c)).length === 1 &&
      chips.filter((c) => /^no back neckline✕?$/i.test(c)).length === 1,
    chips.join(' | '),
  );
  check(
    'J6 doubts folded behind ? N',
    !(await page.$(`${J} [data-joins-questions]`)) &&
      !!(await page.$(`${J} [data-joins-doubts="6"]`)),
  );
  await page
    .locator(`${J} [data-flat-joins]`)
    .screenshot({ path: resolve(SHOTS, 'route-joins.png') });
  await page.click(`${J} [data-joins-doubts]`);
  check(
    'J7 ? N opens the questions',
    (await page.locator(`${J} [data-joins-questions] [data-join-row]`).count()) === 6,
  );
  await page
    .locator(`${J} [data-flat-joins]`)
    .screenshot({ path: resolve(SHOTS, 'route-joins-questions.png') });
  await page.click(`${J} [data-joins-doubts]`);
  check('J8 and closes them', !(await page.$(`${J} [data-joins-questions]`)));

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

  // c6 · a failed read whose list landed meanwhile: retry re-reads the band, then reads non-force
  {
    await page.evaluate(() => {
      window.__failNextRead = true;
    });
    const n0 = (await calls(page, 'GenerateDesignJoins')).length;
    await page.click(`${U} [data-joins-rejoin]`);
    await page.waitForSelector(`${U} [data-joins-retry]`, { timeout: 10000 });
    await page.click(`${U} [data-joins-retry]`);
    await page.waitForFunction(
      (n) => window.__calls.filter((c) => c.name === 'GenerateDesignJoins').length > n + 1,
      n0,
      { timeout: 10000 },
    );
    const reads = (await calls(page, 'GenerateDesignJoins')).slice(n0);
    check(
      'T1 retry after a landed list reads the non-force way',
      reads.length === 2 && reads[0].body.force === true && reads[1].body.force === false,
      JSON.stringify(reads.map((r) => r.body.force)),
    );
    await page.waitForTimeout(1800);
  }

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
    (await first.getAttribute('title')).includes('front only, stand-up'),
    before,
  );

  // a failed save keeps the editor and the typed text, with the reason under it
  await first.dblclick();
  await input.waitFor();
  const typed = (await input.inputValue()).replace(/ — .*/, '') + ' — kept on failure';
  await input.fill(typed);
  await page.evaluate(() => {
    window.__failNextSet = true;
  });
  await input.press('Enter');
  await page.waitForTimeout(600);
  check(
    'E4 a failed save keeps the editor with the typed text and the reason',
    (await input.count()) === 1 &&
      (await input.inputValue()) === typed &&
      (await page.locator(`${J} .text-error`).textContent()).includes('not saved'),
  );
  // a blur keeps the typed text too
  await page.locator(`${J} [data-flat-joins]`).click({ position: { x: 2, y: 2 } });
  await page.waitForTimeout(200);
  check(
    'E5 a blur keeps the typed text',
    (await input.count()) === 1 && (await input.inputValue()) === typed,
  );
  await input.press('Enter');
  await page.waitForTimeout(600);
  check(
    'E6 Enter again saves it',
    (await input.count()) === 0 && (await first.getAttribute('title')).includes('kept on failure'),
  );

  // M4/c5 · the stale replay checks its row: rewritten elsewhere → the editor stays, one line
  await page.evaluate(() => {
    window.__sets = 0;
    window.__staleMutate = (j) => ({
      ...j,
      items: j.items.map((it, i) => (i === 0 ? { ...it, text: 'changed by someone else' } : it)),
    });
  });
  const setsE7 = (await calls(page, 'SetDesignJoins')).length;
  await first.dblclick();
  await input.waitFor();
  const typedE7 = (await input.inputValue()).replace(/ — .*/, '') + ' — mine over a stale row';
  await input.fill(typedE7);
  await input.press('Enter');
  await page.waitForTimeout(800);
  check(
    'E7 a replay over a row changed elsewhere does not save: editor stays, one line',
    (await calls(page, 'SetDesignJoins')).length === setsE7 + 1 &&
      (await input.count()) === 1 &&
      (await input.inputValue()) === typedE7 &&
      (await page.locator(`${J} .text-error`).first().textContent()).trim() ===
        'list changed — check again',
  );
  check(
    'E7b the other change stands',
    (await page.evaluate(() => window.__bands[38].joins.items[0].text)) ===
      'changed by someone else',
  );
  await input.press('Escape');
  // the row is gone on the fresh list: the editor stays (under the rows), nothing silent
  const goneId = await page.evaluate(() => window.__bands[38].joins.items[1].id);
  await page.evaluate((id) => {
    window.__sets = 0;
    window.__staleMutate = (j) => ({ ...j, items: j.items.filter((it) => it.id !== id) });
  }, goneId);
  const second = page.locator(`${J} [data-join-row="item:${goneId}"] span[role="button"]`);
  await second.dblclick();
  await input.waitFor();
  const typedE8 = (await input.inputValue()).replace(/ — .*/, '') + ' — row gone meanwhile';
  await input.fill(typedE8);
  await input.press('Enter');
  await page.waitForTimeout(800);
  check(
    'E8 a replay whose row is gone keeps the editor with the typed line',
    (await page.locator(`${J} [data-joins-orphan] input`).count()) === 1 &&
      (await page.locator(`${J} [data-joins-orphan] input`).inputValue()) === typedE8 &&
      (await page.locator(`${J} [data-joins-orphan]`).textContent()).includes(
        'list changed — check again',
      ),
  );
  await page.locator(`${J} [data-joins-orphan] input`).press('Escape');

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

  // photos: pick group 1 only → keep_media_ids; no role is touched
  await page.click(`${J} [data-joins-disagree]`);
  await page.waitForSelector(`${J} [data-joins-pick]`);
  check(
    'P0 the left-out photo is dimmed in the picker',
    (await page.locator(`${J} [data-joins-pick] button[aria-pressed="false"]`).count()) >= 1,
  );
  await page
    .locator(`${J} [data-flat-joins]`)
    .screenshot({ path: resolve(SHOTS, 'route-joins-pick.png') });
  await page.click(`${J} [data-joins-keep]`);
  await page.waitForTimeout(800);
  const keep = (await calls(page, 'SetDesignJoins')).at(-1).body.joins.consistency.keepMediaIds;
  const roles = await calls(page, 'SetDesignReferenceRole');
  check('P1 kept photos stored', JSON.stringify(keep) === '[1,2]', JSON.stringify(keep));
  check('P2 no reference role is touched', roles.length === 0, String(roles.length));
  // un-pick restores: open again, keep all three
  await page.click(`${J} [data-joins-disagree]`);
  await page.locator(`${J} [data-joins-pick] button[aria-pressed="false"]`).first().click();
  await page.click(`${J} [data-joins-keep]`);
  await page.waitForTimeout(800);
  const keep2 = (await calls(page, 'SetDesignJoins')).at(-1).body.joins.consistency.keepMediaIds;
  check(
    'P3 un-picking brings a photo back',
    JSON.stringify([...keep2].sort()) === '[1,2,3]',
    JSON.stringify(keep2),
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

  // a candidate cut on the server is the pick; the local pick is ignored, nothing else is cut
  const K = '[data-probe="bench-53"]';
  await page.waitForSelector(`${K} [data-picture="320"]`, { timeout: 20000 });
  await page.waitForTimeout(2500);
  check(
    'K1 server-cut candidate wins: no editor, no pick door, no cut of another',
    !(await page.$(`${K} [data-inline-split]`)) &&
      (await page.locator(`${K} button`, { hasText: /^pick$/ }).count()) === 0 &&
      (await calls(page, 'SplitDesignPicture')).every((s) => s.body.pictureId === 302),
  );
  await page.locator(K).screenshot({ path: resolve(SHOTS, 'route-candidates-servercut.png') });

  // ── FAILED / LATE ──
  const F = '[data-probe="bench-51"]';
  await page.waitForSelector(`${F} [data-latest-failed]`, { timeout: 10000 });
  check(
    'F1 timed out · retry',
    (await page.locator(`${F} [data-latest-failed]`).textContent()).includes('timed out'),
  );
  await page.click(`${F} [data-latest-retry]`);
  await page.click(`${F} [data-latest-retry]`, { force: true }).catch(() => {});
  await page.waitForTimeout(500);
  const starts = await calls(page, 'StartDesignRun');
  check(
    'F2 retry repeats the run, once on a double press',
    starts.length === 1 && starts[0].body.rerunOfRunId === 91,
    JSON.stringify(starts.map((s) => s.body.rerunOfRunId)),
  );
  await page.locator(F).screenshot({ path: resolve(SHOTS, 'route-failed.png') });
  const L = '[data-probe="bench-52"]';
  await page.waitForSelector(`${L} [data-live-tile]`, { timeout: 10000 });
  check('L1 taking too long', (await page.locator(L).textContent()).includes('taking too long'));
  check(
    'L3 the clock is measured against the band cap',
    !(await page.locator(L).textContent()).includes('stuck'),
  );
  const cancel = page.locator(`${L} [data-run-cancel]`);
  check(
    'L2 cancel in plain sight',
    (await cancel.evaluate((e) => getComputedStyle(e).opacity)) === '1',
  );
  await page.locator(L).screenshot({ path: resolve(SHOTS, 'route-late.png') });

  // ── MODES (81-FINAL-MODES) ──
  const MODES = resolve(SHOTS, 'modes');
  mkdirSync(MODES, { recursive: true });
  const M = '[data-probe="modes"]';
  const lastStart = async () => (await calls(page, 'StartDesignRun')).at(-1)?.body;
  const nStarts = async () => (await calls(page, 'StartDesignRun')).length;
  const generate = `${M} [data-flat-generate] button:has-text("generate")`;
  const press = async () => {
    const before = await nStarts();
    await page.click(generate);
    await page.waitForFunction(
      ([sel, n]) =>
        window.__calls.filter((c) => c.name === 'StartDesignRun').length > n ||
        !!document.querySelector(sel),
      [`${M} [data-flat-refusal]`, before],
      { timeout: 10000 },
    );
    await page.waitForTimeout(300);
  };
  const generateLive = async () =>
    (await page.locator(`${M} [data-flat-generate] [data-inert]`).count()) === 0;
  await page.waitForSelector(`${M} [data-flat-generate]`, { timeout: 20000 });
  await page.locator(M).screenshot({ path: resolve(MODES, 'm0-default.png') });

  // GENERATE = photos: no flat block on the wire
  await press();
  const p0 = await lastStart();
  check(
    'M1 GENERATE runs photos (no params.flat)',
    p0 && !p0.params.flat,
    JSON.stringify(p0?.params?.flat),
  );
  check(
    'M2 the list with a running-on strap suggests straps & openings',
    (await page.locator(`${M} [data-flat-suggest="straps"]`).count()) === 1,
  );
  check(
    'M2b no confirm door while photos is chosen',
    (await page.locator(`${M} [data-joins-confirm]`).count()) === 0,
  );

  // c1 · a JOINS line typed and not saved holds GENERATE, one quiet word
  {
    const row = page.locator(`${M} [data-join-row^="item:"] span[role="button"]`).first();
    await row.dblclick();
    const ed = page.locator(`${M} input[aria-label="edit join"]`);
    await ed.waitFor();
    await ed.fill((await ed.inputValue()) + ' typed');
    await page.waitForTimeout(200);
    check(
      'H1 an unsaved join line holds GENERATE',
      !(await generateLive()) &&
        (await page.locator(`${M} [data-flat-unsaved]`).textContent()).trim() === 'unsaved',
    );
    const before = await nStarts();
    await page.click(generate, { force: true }).catch(() => {});
    await page.waitForTimeout(300);
    check('H1b no run starts', (await nStarts()) === before);
    await ed.press('Escape');
    await page.waitForTimeout(200);
    check(
      'H1c Esc frees it',
      (await generateLive()) && (await page.locator(`${M} [data-flat-unsaved]`).count()) === 0,
    );
  }

  // open custom: the mode switch
  await page.click(`${M} [aria-expanded]:has-text("custom")`);
  const modeRadio = (name) =>
    page.locator(`${M} [role="radiogroup"][aria-label="mode"] [role="radio"]`, { hasText: name });
  check(
    'M3 mode switch: three segments',
    (await page.locator(`${M} [role="radiogroup"][aria-label="mode"] [role="radio"]`).count()) ===
      3,
  );
  check(
    'M3b from my flat is live with technical flats',
    (await modeRadio('from my flat').getAttribute('aria-disabled')) === null,
  );

  // from my flat: tiles, the first two auto-assigned
  await modeRadio('from my flat').click();
  await page.waitForSelector(`${M} [data-flat-structure-tile]`);
  const tileRoles = await page.$$eval(`${M} [data-flat-structure-tile]`, (els) =>
    els.map(
      (e) =>
        `${e.getAttribute('data-flat-structure-tile')}:${e.getAttribute('data-structure-role')}`,
    ),
  );
  check(
    'M4 three technical flats, the first two front and back',
    tileRoles.join(',') === '801:front_flat,802:back_flat,803:',
    tileRoles.join(','),
  );
  check(
    'M4b the per-view layout is off in this mode',
    (await page
      .locator(`${M} [role="radio"]:has-text("a picture per view")`)
      .getAttribute('aria-disabled')) === 'true',
  );
  await page.locator(M).screenshot({ path: resolve(MODES, 'm1-from-my-flat.png') });
  // the back goes to the third flat: one flat per side
  await page.click(`${M} [data-flat-structure-tile="803"] [data-structure-pick="back_flat"]`);
  const roles2 = await page.$$eval(`${M} [data-flat-structure-tile]`, (els) =>
    els.map((e) => e.getAttribute('data-structure-role')).join(','),
  );
  check('M5 one flat per side', roles2 === 'front_flat,,back_flat', roles2);
  await press();
  const p1 = await lastStart();
  check(
    'M5b hand_flat sends its structure refs, front first',
    JSON.stringify(p1.params.flat) ===
      JSON.stringify({
        mode: 'hand_flat',
        structureRefs: [
          { mediaId: 801, role: 'front_flat' },
          { mediaId: 803, role: 'back_flat' },
        ],
      }),
    JSON.stringify(p1.params.flat),
  );
  check(
    'M5c layout one, no details',
    p1.params.layout === 'one' && p1.params.detailSlotIds.length === 0,
  );

  // a server refusal: one plain line in short words
  await page.evaluate(() => {
    window.__startRefusal = {
      status: 400,
      reason: 'structure_not_on_card',
      words: 'InvalidArgument: params.flat.structure_refs[0] is not a technical media of this card',
    };
  });
  await press();
  const line = page.locator(`${M} [data-flat-refusal="structure_not_on_card"]`);
  check(
    'R1 refusal → one line with the short reason',
    (await line.count()) === 1 &&
      (await line.textContent()).includes('that flat is not on this card'),
    (await line.count()) ? await line.textContent() : 'none',
  );
  await page.locator(M).screenshot({ path: resolve(MODES, 'm2-refusal.png') });
  await line.locator('button:has-text("dismiss")').click();
  for (const [reason, words] of [
    ['structure_required', 'pick a front or back flat'],
    ['mode_not_for_this_run', 'one picture'],
    ['too_many_pictures', 'too many pictures'],
  ]) {
    await page.evaluate((r) => {
      window.__startRefusal = { status: 400, reason: r, words: 'x' };
    }, reason);
    await press();
    const l = page.locator(`${M} [data-flat-refusal="${reason}"]`);
    check(
      `R2 ${reason} → «${words}»`,
      (await l.count()) === 1 && (await l.textContent()).includes(words),
    );
    await l.locator('button:has-text("dismiss")').click();
  }

  // a flat removed from the card while it saved: refused here, nothing sent
  const beforeGone = await nStarts();
  await page.evaluate(() => {
    const f = window.__modesForm;
    f.setValue('technicalMedia', [{ mediaId: 801, kind: '', caption: '', role: '' }]);
  });
  await page.waitForTimeout(200);
  check(
    'M6 a removed flat leaves the picks, the row keeps one front',
    (await page.$$eval(`${M} [data-flat-structure-tile]`, (els) => els.length)) === 1,
  );
  await press();
  check(
    'M6b nothing sent for the gone flat (front only)',
    (await nStarts()) === beforeGone + 1 &&
      JSON.stringify((await lastStart()).params.flat.structureRefs) ===
        JSON.stringify([{ mediaId: 801, role: 'front_flat' }]),
  );
  // no technical flats → from my flat is disabled
  await page.click(`${M} [role="radio"]:has-text("photos")`);
  await page.evaluate(() => window.__modesForm.setValue('technicalMedia', []));
  await page.waitForTimeout(200);
  check(
    'M7 no technical media → from my flat disabled',
    (await modeRadio('from my flat').getAttribute('aria-disabled')) === 'true',
  );
  await page.locator(M).screenshot({ path: resolve(MODES, 'm3-no-technical.png') });
  await page.evaluate(() =>
    window.__modesForm.setValue(
      'technicalMedia',
      [801, 802, 803].map((mediaId) => ({ mediaId, kind: '', caption: '', role: '' })),
    ),
  );

  // straps & openings: the suggestion pill switches the mode
  await page.click(`${M} [data-flat-suggest="straps"]`);
  await page.waitForTimeout(200);
  check(
    'S1 the suggestion picks straps & openings',
    (await page.locator(`${M} [data-flat-mode]`).getAttribute('data-flat-mode')) === 'straps',
  );
  check('S2 GENERATE waits for the confirmed list', !(await generateLive()));
  check(
    'S3 one quiet word: unconfirmed',
    (await page.locator(`${M} [data-flat-unconfirmed]`).textContent()).trim() === 'unconfirmed',
  );
  check(
    'S4 confirm joins door in the JOINS header',
    (await page.locator(`${M} [data-joins-confirm]`).count()) === 1,
  );
  await page.locator(M).screenshot({ path: resolve(MODES, 'm4-straps-unconfirmed.png') });
  const setsBefore = (await calls(page, 'SetDesignJoins')).length;
  await page.click(`${M} [data-joins-confirm]`);
  await page.waitForSelector(`${M} [data-joins-confirmed]`, { timeout: 10000 });
  const confirmSet = (await calls(page, 'SetDesignJoins')).at(-1).body;
  check(
    'S5 confirm saves the list as is with confirm:true at its rev',
    (await calls(page, 'SetDesignJoins')).length === setsBefore + 1 &&
      confirmSet.confirm === true &&
      confirmSet.expectedRev === 7,
    JSON.stringify({ confirm: confirmSet.confirm, rev: confirmSet.expectedRev }),
  );
  check('S6 GENERATE is live once confirmed', await generateLive());
  check(
    'S6b the quiet word is gone',
    (await page.locator(`${M} [data-flat-unconfirmed]`).count()) === 0,
  );
  await page.locator(M).screenshot({ path: resolve(MODES, 'm5-straps-confirmed.png') });
  await press();
  const p2 = await lastStart();
  check(
    'S7 straps sends its mode, no structure refs',
    JSON.stringify(p2.params.flat) === JSON.stringify({ mode: 'straps', structureRefs: [] }),
    JSON.stringify(p2.params.flat),
  );
  // the server still refuses (edited in another tab): the short line
  await page.evaluate(() => {
    window.__startRefusal = {
      status: 400,
      reason: 'joins_unconfirmed',
      words: 'FailedPrecondition: joins_unconfirmed',
    };
  });
  await press();
  check(
    'S8 joins_unconfirmed → «confirm the joins first»',
    (await page.locator(`${M} [data-flat-refusal="joins_unconfirmed"]`).textContent()).includes(
      'confirm the joins first',
    ),
  );
  await page.locator(`${M} [data-flat-refusal] button:has-text("dismiss")`).click();
  // confirmed against other photos (server: reason=stale) → one quiet line, the pill drops
  await page.evaluate(() => {
    window.__startRefusal = {
      status: 400,
      reason: 'joins_unconfirmed',
      words: 'FailedPrecondition: joins_unconfirmed',
      meta: { reason: 'stale', joins_rev: String(window.__bands[60].joins.rev) },
    };
  });
  await press();
  check(
    'S8b stale confirmation → «photos changed — confirm joins again», pill dropped',
    (await page.locator(`${M} [data-flat-refusal="joins_unconfirmed"]`).textContent()).includes(
      'photos changed — confirm joins again',
    ) &&
      (await page.locator(`${M} [data-joins-confirmed]`).count()) === 0 &&
      (await page.locator(`${M} [data-joins-confirm]`).count()) === 1,
  );
  await page.locator(`${M} [data-flat-refusal] button:has-text("dismiss")`).click();

  // neck shape: inline select on the neck row; any save clears the confirmation
  const neck = page.locator(`${M} select[data-join-neck]`);
  check(
    'N1 the neck row carries a shape select',
    (await neck.count()) >= 1,
    String(await neck.count()),
  );
  await neck.first().selectOption('crew');
  await page.waitForTimeout(600);
  const neckSet = (await calls(page, 'SetDesignJoins')).at(-1).body;
  const neckId = await neck.first().getAttribute('data-join-neck');
  const neckItem = neckSet.joins.items.find((it) => it.id === neckId);
  check(
    'N2 the shape is saved as the item type',
    neckItem?.type === 'crew' && neckSet.confirm === false,
    JSON.stringify(neckItem?.type),
  );
  check(
    'S9 an edit clears the confirmation — GENERATE waits again',
    !(await generateLive()) && (await page.locator(`${M} [data-joins-confirm]`).count()) === 1,
  );
  await page.locator(M).screenshot({ path: resolve(MODES, 'm6-neck-edit-unconfirmed.png') });

  // a rerun carries the parent's flat block; a fix copies it from the plate's run
  const R = '[data-probe="bench-62"]';
  await page.waitForSelector(`${R} [data-latest-retry]`, { timeout: 10000 });
  await page.click(`${R} [data-latest-retry]`);
  await page.waitForTimeout(500);
  const rerun = await lastStart();
  check(
    'X1 retry repeats with the parent params.flat',
    rerun.rerunOfRunId === 95 &&
      JSON.stringify(rerun.params.flat) ===
        JSON.stringify({
          mode: 'hand_flat',
          structureRefs: [
            { mediaId: 801, role: 'front_flat' },
            { mediaId: 802, role: 'back_flat' },
          ],
        }),
    JSON.stringify(rerun.params.flat),
  );
  const fix = await page.evaluate(() => {
    const M = window.__flatMode;
    return {
      fromHand: M.flatParamsForFix({
        params: {
          flat: { mode: 'hand_flat', structureRefs: [{ mediaId: 5, role: 'front_flat' }] },
        },
      }),
      fromStraps: M.flatParamsForFix({ params: { flat: { mode: 'straps', structureRefs: [] } } }),
      fromPhotos: M.flatParamsForFix({ params: {} }) ?? null,
      photos: M.flatParamsFor('photos', [{ mediaId: 1, role: 'front_flat' }]) ?? null,
    };
  });
  check(
    'X2 a fix copies params.flat from the plate run',
    JSON.stringify(fix.fromHand) ===
      JSON.stringify({ mode: 'hand_flat', structureRefs: [{ mediaId: 5, role: 'front_flat' }] }) &&
      JSON.stringify(fix.fromStraps) === JSON.stringify({ mode: 'straps', structureRefs: [] }) &&
      fix.fromPhotos === null &&
      fix.photos === null,
    JSON.stringify(fix),
  );
  await ctx.close();
} finally {
  await browser.close();
}
console.log(fail ? `flat route stand: ${fail} failed` : 'flat route stand: all ok');
process.exit(fail ? 1 : 0);
