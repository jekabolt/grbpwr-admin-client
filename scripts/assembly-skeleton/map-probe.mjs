#!/usr/bin/env node
// ASSEMBLY MAP PROBE (04-ASSEMBLY-MAP-DESIGN §8: M1 lib gates + M2/M3 headless UI and print).
//
//   node scripts/assembly-skeleton/map-probe.mjs                 run (yarn skeleton:map)
//   node scripts/assembly-skeleton/map-probe.mjs --mutate-no-cross   drop the cross-input rule in
//        the bundler's memory — the «card steps get their seams» gates MUST fail
//   SHOT_DIR=/path … — screenshots (default ../tmp/plans/assembly-from-pattern/shots/map-impl)
//
// LIB (node, real pipeline on the SS26-005 DXF → proposeSkeleton → readMap):
//   • a card-like order (the proposal's steps with their own seams stripped) gets back EVERY seam the
//     proposal carried, through the cross-input rule alone; joins without seams = template-only;
//   • every STEP picture's overlap ≤ SKELETON.overlapMax (15 %) — the explode only adds distance;
//   • PIECES: 14 families on SS26-005 (mirror twins and identical layers collapsed), members cover
//     every contoured piece once.
// UI (chromium, real AssemblyMap + OperationsField + providers on real cards from prod-run stands):
//   SS26-005 (the technologist's own 47 steps): STEP for a geometry join, a join with no read edges,
//   a twin join; PIECES with numbers; hover rail → map, map number → rail; click = sticky, Esc
//   clears; THEN opens the step in the rail. Blazer (46 pieces, the skeleton's order applied). A card
//   with no DXF: the block is the sketch, no switch. Print: SEAM MAP on A4 landscape, nothing off the
//   sheet, nothing under 10 pt.
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const PLANS = process.env.SKELETON_PLANS ?? resolve(REPO, '../tmp/plans');
const SHOT_DIR = process.env.SHOT_DIR ?? resolve(PLANS, 'assembly-from-pattern/shots/map-impl');
mkdirSync(SHOT_DIR, { recursive: true });
const MUTATE = process.argv.includes('--mutate-no-cross');

const ALIAS = Object.fromEntries(
  [
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
  ].map((a) => [a, resolve(REPO, 'src', a)]),
);
const DEFINE = {
  'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
  'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
  'process.env.NODE_ENV': '"production"',
};
// The mutation: a step's seams are its own only — the cross-input rule is gone.
const CROSS_FIX = 'if (leaves.length < 2) return out;';
const plugins = MUTATE
  ? [
      {
        name: 'map-mutation',
        setup(b) {
          b.onLoad({ filter: /map[\\/]step-seams\.ts$/ }, async (args) => {
            const src = await readFile(args.path, 'utf8');
            if (!src.includes(CROSS_FIX)) throw new Error('mutation did not find its line');
            return { contents: src.replace(CROSS_FIX, 'return out;'), loader: 'ts' };
          });
        },
      },
    ]
  : [];

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ── LIB (node) ──────────────────────────────────────────────────────────────────────────────────
const dxf = resolve(PLANS, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf');
if (!existsSync(dxf)) {
  console.log(`no SS26-005 DXF at ${dxf} — probe skipped (set SKELETON_PLANS)`);
  process.exit(0);
}
const nodeOut = resolve(HERE, `.map-probe-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'map-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: REPO,
  outfile: nodeOut,
  logLevel: 'warning',
  banner: {
    js: "import { createRequire as __cr } from 'node:module';\nvar require = __cr(import.meta.url);",
  },
  define: DEFINE,
  alias: ALIAS,
  plugins,
});
let L;
try {
  L = await import(pathToFileURL(nodeOut).href);
} finally {
  rmSync(nodeOut, { force: true });
}

head('LIB — SS26-005 through the real pipeline');
{
  const buf = readFileSync(dxf);
  const quiet = [console.log, console.warn];
  console.log = () => {};
  console.warn = () => {};
  const { facts } = await L.loadFacts(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    'M',
    'shirt',
    { buttons: 8, interlining: 1 },
  );
  [console.log, console.warn] = quiet;
  const P = L.proposeSkeleton(facts, L.skeletonDeps, { pressOpen: true });
  const steps = P.steps.map((s) => ({
    inputs: s.inputs,
    outputUnitKey: s.outputUnitKey,
    sews: s.operationType === 'MACHINE',
    seams: s.seams,
  }));
  const own = L.readMap(P.graph, steps);
  const bare = L.readMap(
    P.graph,
    steps.map((s) => ({ ...s, seams: undefined })),
  );
  const joins = P.steps
    .map((s, i) => i)
    .filter((i) => P.steps[i].operationType === 'MACHINE' && P.steps[i].inputs.length >= 2);
  const key = (c) => [c.a, c.b].sort().join('~');
  const lost = joins.filter((i) => {
    const b = new Set(bare.seams[i].map(key));
    return own.seams[i].some((c) => !b.has(key(c)));
  });
  const ownCount = joins.filter((i) => P.steps[i].seams.length > 0).length;
  const bareCount = joins.filter((i) => bare.seams[i].length > 0).length;
  console.log(
    `  ${P.steps.length} steps · ${joins.length} machine joins · ${ownCount} carry seams of their own`,
  );
  ck(
    bareCount === ownCount && ownCount >= 14,
    'card-like order (own seams stripped): every join that had seams gets them back',
    `${bareCount} / ${ownCount}`,
  );
  ck(lost.length === 0, 'no seam of the proposal is lost by the cross-input rule', lost.join(', '));
  const unread = joins.filter((i) => bare.seams[i].length === 0);
  ck(
    unread.every((i) => P.steps[i].source === 'template'),
    'joins without seams are exactly the template-only joins',
    unread.map((i) => `${(i + 1) * 10} ${P.steps[i].label ?? ''}`).join(' · '),
  );
  let maxOv = 0;
  let pics = 0;
  for (let i = 0; i < steps.length; i++) {
    const p = L.pairPicture(bare, i);
    if (!p) continue;
    pics++;
    maxOv = Math.max(maxOv, p.overlap);
    if (p.sides.length < 2) ck(false, `step ${(i + 1) * 10}: both sides of the seam drawn`);
  }
  ck(
    maxOv <= 0.15 + 1e-9,
    'every STEP picture: overlap ≤ 15 %',
    `${pics} pictures, max ${(maxOv * 100).toFixed(1)} %`,
  );
  const fams = L.pieceFamilies(bare);
  const members = fams.flatMap((f) => f.members);
  ck(
    fams.length === 14,
    'PIECES: 14 families on SS26-005',
    `${fams.length}: ${fams.map((f) => f.name + (f.tag ? ` ${f.tag}` : '')).join(', ')}`,
  );
  ck(
    members.length === P.graph.pieces.length && new Set(members).size === members.length,
    'families cover every contoured piece exactly once',
  );
  const sleeve = fams.find((f) => /^SLV$/.test(f.name));
  ck(
    !!sleeve && sleeve.picture.edges.some((e) => e.steps.length >= 2),
    'a twin family carries both hands’ step numbers on one edge (140·160)',
    sleeve?.picture.edges.map((e) => e.steps.map((s) => (s + 1) * 10).join('·')).join(', '),
  );
  const nameOf = (k) => bare.geoms.get(k)?.name ?? k;
  const backJoin = joins.find((i) => P.steps[i].inputs.join() === 'BP_L,BP_1_L');
  if (backJoin != null) {
    const w = L.seamWords(bare, bare.seams[backJoin][0], nameOf);
    console.log(`  facts of ${(backJoin + 1) * 10}: ${w}`);
    ck(/onto .* mm, eased|= .* mm/.test(w), 'facts line says lengths in words');
  }
  const t = L.thenChain(steps, joins[0]);
  ck(t.length > 0, 'THEN follows the result to the end', t.map((x) => x.unitKey).join(' → '));
}

if (MUTATE) {
  console.log(`\n${bad} FAIL — the mutation ${bad > 0 ? 'was caught' : 'was NOT caught'}`);
  process.exit(bad > 0 ? 0 : 1);
}

// ── UI (chromium) ───────────────────────────────────────────────────────────────────────────────
function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    /* npx cache next */
  }
  const r = `${homedir()}/.npm/_npx`;
  if (!existsSync(r)) return null;
  const found = execFileSync(
    'find',
    [r, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean)[0];
  return found ? `${found}/index.js` : null;
}
const pw = resolvePlaywright();
if (!pw) {
  console.log('\nplaywright not found — UI half skipped (not a failure)');
  process.exit(bad ? 1 : 0);
}
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;
const stands = resolve(PLANS, 'assembly-from-pattern/prod-run');
const loadStand = (code) => {
  const f = resolve(stands, `${code}.stand.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};
const ss = loadStand('SS26-005');
const blazer = loadStand('blazer');
if (!ss) {
  console.log(`\nno prod-run stands in ${stands} — UI half skipped, loudly`);
  process.exit(bad ? 1 : 0);
}

const outfile = resolve(tmpdir(), `map-probe-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'map-probe-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
  define: DEFINE,
  alias: ALIAS,
  // paper-pdf's font imports (`?url`, a Vite feature): the stand never exports a PDF.
  plugins: [
    {
      name: 'vite-url-stub',
      setup(b) {
        b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path, namespace: 'url-stub' }));
        b.onLoad({ filter: /.*/, namespace: 'url-stub' }, () => ({
          contents: 'export default "";',
          loader: 'js',
        }));
      },
    },
  ],
});
const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
let css = '';
try {
  const dir = resolve(REPO, 'dist/assets');
  const name = readdirSync(dir).find((f) => /^index-.*\.css$/.test(f));
  if (name) css = readFileSync(resolve(dir, name), 'utf8');
} catch {
  /* no build */
}
if (!css) console.log('note: dist CSS missing — screenshots are unstyled (run `yarn build`)');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><head><style>${css}</style></head><body class="bg-pageBg"><div id="root"></div></body></html>`,
  }),
);
await page.route('http://stub.invalid/**', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{"works":[]}' }),
);
const shot = async (name, el = '[data-map-column]') => {
  const path = resolve(SHOT_DIR, `${name}.png`);
  if (el) await page.locator(el).first().screenshot({ path });
  else await page.screenshot({ path, fullPage: false });
  console.log(`  shot → ${path}`);
};
const mount = async (stand) => {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((c) => window.__map.mount(c), stand);
  await page.waitForTimeout(400);
};
const waitGraph = async () => {
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => window.__map.hasGraph())) return true;
    await page.waitForTimeout(200);
  }
  return false;
};
const mapStep = () =>
  page.locator('[data-map-step]').first().getAttribute('data-map-step').then(Number);
const toList = async () => {
  const list = page.locator('[aria-label="sequence view"] [role="radio"]', { hasText: 'list' });
  if (await list.count()) await list.first().click();
  await page.waitForTimeout(150);
};
const chooseView = async (v) => {
  await page.locator('[aria-label="assembly map view"] [role="radio"]', { hasText: v }).click();
  await page.waitForTimeout(120);
};
const away = async () => {
  await page.mouse.move(1430, 1090);
  await page.waitForTimeout(80);
};

// ── SS26-005 ──
head('UI — SS26-005, the technologist’s own order');
await page.evaluate(() => localStorage.clear()).catch(() => {});
await mount(ss);
ck(await waitGraph(), 'the provider reads the seam graph for the map');
await page.waitForTimeout(200);
await toList();
const pick = await page.evaluate(() => window.__map.pick());
console.log(
  `  ${pick.steps} steps · ${pick.machineJoins} machine joins · ${pick.withSeams} with read seams · ${pick.families} families · ${pick.numbered} numbered edges`,
);
ck(
  pick.machineJoins > 0 && pick.withSeams >= Math.ceil(pick.machineJoins * 0.6),
  'most of the card’s joins get seams by the cross-input rule',
  `${pick.withSeams} / ${pick.machineJoins}`,
);
ck(
  (await page.locator('[aria-label="assembly map view"]').count()) === 1,
  'the switch STEP · PIECES · SKETCH is there',
);
const first = await mapStep();
const firstMachine = pick.firstMachine;
ck(first === firstMachine, 'default: STEP on the first machine step', `step index ${first}`);

// geometry join
await page.locator(`[data-rail-step="${pick.geometry}"]`).hover();
await page.waitForTimeout(120);
ck(
  (await mapStep()) === pick.geometry,
  'hover a rail row → the map shows that step',
  `${(pick.geometry + 1) * 10}`,
);
ck(
  (await page.locator('[data-map-pair] [data-map-side]').count()) >= 2,
  'geometry join: the sewn edges on both pieces',
);
const facts = await page.locator('[data-map-facts]').innerText();
ck(
  /↔/.test(facts) && /mm/.test(facts),
  'geometry join: the facts line in words',
  facts.split('\n')[0],
);
await shot('ss26-step-geometry');
await page.locator(`[data-rail-step="${pick.geometry}"]`).click();
await away();
ck((await mapStep()) === pick.geometry, 'click = sticky: the step stays after the mouse leaves');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
ck((await mapStep()) === first, 'Esc clears the selection');

// template-only join
if (pick.template != null) {
  await page.locator(`[data-rail-step="${pick.template}"]`).click();
  await away();
  ck(
    (await page.locator('[data-map-tiles]').count()) === 1,
    'join with no read edges: input tiles, no invented edges',
    `${(pick.template + 1) * 10}`,
  );
  ck(
    /edges not read/.test(await page.locator('[data-map-facts]').innerText()),
    '… and says «edges not read · check at the machine»',
  );
  ck(
    (await page.locator('[data-map-confidence="check"]').count()) === 1,
    '… with the word «check»',
  );
  await shot('ss26-step-template');
} else ck(false, 'SS26-005 has a join with no read edges to show');

// THEN opens the step in the rail
const then = page.locator('[data-map-then]').first();
if (await then.count()) {
  const j = Number(await then.getAttribute('data-map-then'));
  await then.click();
  await page.waitForTimeout(150);
  ck(
    (await page.locator(`[data-rail-step="${j}"][aria-current="true"]`).count()) === 1 &&
      (await mapStep()) === j,
    'a THEN row is a link: the step opens in the rail and on the map',
    `${(j + 1) * 10}`,
  );
}

// twin join
if (pick.twin != null) {
  await page.locator(`[data-rail-step="${pick.twin}"]`).click();
  await away();
  await shot('ss26-step-twin');
  await chooseView('pieces');
  ck(
    (await page
      .locator(`[data-map-family="${pick.twinFamily}"][data-map-family-hot="1"]`)
      .count()) === 1,
    'twin join: PIECES lights the L·R tile drawn as the other hand',
    `${(pick.twin + 1) * 10}`,
  );
  ck(
    (await page
      .locator(`[data-map-family="${pick.twinFamily}"] [data-map-number="${pick.twin}"]`)
      .count()) >= 1,
    '… and its number sits on that tile',
  );
  await shot('ss26-pieces-twin');
} else {
  ck(false, 'SS26-005 has a twin join to show');
  await chooseView('pieces');
}
await page.keyboard.press('Escape');
await away();

// PIECES with numbers, map → rail
const nums = await page.locator('[data-map-number]').count();
ck(
  pick.families === (await page.locator('[data-map-family]').count()),
  'PIECES: one tile per family',
  `${pick.families}`,
);
ck(nums >= pick.numbered, 'PIECES: a step number at every sewn edge', `${nums} numbers`);
await shot('ss26-pieces');
const num = page.locator(`[data-map-number="${pick.geometry}"]`).first();
await num.hover();
await page.waitForTimeout(120);
ck(
  (await page.locator(`[data-map-lit="1"]:has([data-rail-step="${pick.geometry}"])`).count()) === 1,
  'hover an edge number → the rail lights that step',
);
ck((await page.locator('[data-map-hot="1"]').count()) >= 1, '… and its edges go bold on the map');
await shot('ss26-pieces-hover', null);
await away();
await chooseView('step');

// keyboard
await page.locator('[data-assembly-map]').focus();
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(80);
ck((await mapStep()) === first + 1, '↓ in the block walks to the next step');
await page.keyboard.press('Escape');

// ── print ──
head('PRINT — SEAM MAP sheet');
const pr = await page.evaluate(() => window.__map.print('SS26-005'));
console.log(
  `  sheet ${pr.w} × ${pr.h} mm · ${pr.families} families · key ${pr.key} rows (${pr.unread} edges not read)`,
);
ck(pr.w === 297 && pr.h === 210, 'A4 landscape');
ck(pr.out === 0, 'nothing off the sheet', `${pr.out} primitives outside`);
ck(pr.minPt >= 10, 'nothing smaller than 10 pt', `${pr.minPt} pt`);
await page.setViewportSize({ width: 1180, height: 840 });
await shot('print-seams-a4', '[data-print-stage]');
await page.setViewportSize({ width: 1440, height: 1100 });

// ── blazer ──
if (blazer) {
  head('UI — blazer, 46 pieces, the skeleton’s order applied');
  await mount({ ...blazer, propose: true });
  ck(await waitGraph(), 'the graph is read');
  await page.waitForTimeout(200);
  await toList();
  const b = await page.evaluate(() => window.__map.pick());
  console.log(
    `  ${b.steps} steps · ${b.machineJoins} joins · ${b.withSeams} with seams · ${b.families} families`,
  );
  if (b.geometry != null) {
    await page.locator(`[data-rail-step="${b.geometry}"]`).click();
    await away();
    ck((await page.locator('[data-map-pair]').count()) === 1, 'blazer: a STEP picture');
    await shot('blazer-step');
  }
  await chooseView('pieces');
  ck(
    (await page.locator('[data-map-family]').count()) === b.families,
    'blazer: PIECES draws every family',
  );
  await shot('blazer-pieces');
  const bp = await page.evaluate(() => window.__map.print('BLAZER'));
  console.log(`  print: ${bp.w} × ${bp.h} mm · ${bp.out} off-sheet`);
  ck(bp.out === 0, 'blazer print: nothing off the sheet');
  await shot('print-seams-blazer', '[data-print-stage]');
} else console.log('\n(blazer stand missing — skipped, loudly)');

// ── no DXF ──
head('UI — a card with no DXF');
await mount({ ...ss, code: 'NO-DXF', shapes: null });
await page.waitForTimeout(1500);
ck(
  (await page.locator('[aria-label="assembly map view"]').count()) === 0,
  'no switch: the block is the sketch',
);
ck(
  (await page.locator('h3', { hasText: 'sketch — assembly map' }).count()) === 1 &&
    (await page.locator('[data-sketch-stub]').count()) === 1,
  'the sketch block as today (title and sketch)',
);
await shot('no-dxf');

ck(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${bad === 0 ? 'ALL GREEN' : `${bad} FAIL`}`);
process.exit(bad ? 1 : 0);
