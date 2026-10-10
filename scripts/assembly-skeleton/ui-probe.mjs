#!/usr/bin/env node
// D4 — UI PROBE OF THE ASSEMBLY SKELETON (01-PLAN §2 lane D, acceptance item 5 «nothing applied
// silently»). Headless chromium on the REAL door, panel and OperationsField over a real RHF form;
// only the proposal comes from a mock provider (scripts/assembly-skeleton/ui-probe-entry.tsx).
//
//   node scripts/assembly-skeleton/ui-probe.mjs                     run
//   node scripts/assembly-skeleton/ui-probe.mjs --mutate-autoapply   the door applies the proposal
//                                                                    the moment it is read — the
//                                                                    «nothing silently» checks MUST fail
//   node scripts/assembly-skeleton/ui-probe.mjs --mutate-pictures-churn  the card's unit pictures
//                                                                    re-read the graph whenever the
//                                                                    contour Map changes identity —
//                                                                    the «BOM keystroke» check MUST fail
//   SHOT_DIR=/path node … — where the screenshots go (default tmp/plans/assembly-from-pattern/shots/d)
//
// Scenarios:
//   A  look, don't apply: open → proposal → close; the form is byte-identical, autosave never asked
//   B  apply all accepted → N rows; rules 1–3/6/7 clean; zod clean; MACHINE rows carry a machine;
//      autosave asked with 'skeleton'; rail marks the rows «draft»; a touch takes one mark off
//   C  apply this step + ambiguous variant + a guess unticked by default
//   D  existing steps: append numbers after them; replace needs a second, confirming press
//   E  shut doors: released card, no engine — disabled and saying why in words; a card with no
//      DXF has NO header door at all (owner 09.10: silent, like the silhouette line), the reason
//      only in the empty-state door
//   H  readings: choosing the second reading REBUILDS the proposal; «apply all» then keeps the
//      order (sweep clean); readings lock once a step is applied; a remounted field does not replay
//   I  replace over steps with photos / units declares mediaCleared / assemblyCleared and says so
//   J  typing in the BOM (contour Map churns identity) does NOT re-read the seam graph
//   K  THE REAL ENGINE on the blazer: every step ticked, the second reading of an ambiguous join
//      chosen, «apply all» — the order stays clean (skipped, loudly, without the corpus)
//   G  THE REAL ENGINE on SS26-005 (25 pieces, sewing lines from the DXF): the production provider
//      reads the pattern; unit inputs and outputs carry real pictograms; after apply the schematic
//      shows unit glyphs through CardUnitPicturesProvider. Skipped, loudly, without the plans folder.
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUTATE_AUTOAPPLY = process.argv.includes('--mutate-autoapply');
const MUTATE_CHURN = process.argv.includes('--mutate-pictures-churn');

function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    /* npx cache next */
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
const REPO = resolve(HERE, '../..');
const SHOT_DIR =
  process.env.SHOT_DIR ?? resolve(REPO, '../tmp/plans/assembly-from-pattern/shots/d');
mkdirSync(SHOT_DIR, { recursive: true });
const outfile = resolve(tmpdir(), `skeleton-ui-${process.pid}.js`);

// ── mutation (in the bundler's memory, never in the file) ───────────────────────────────────────
const AUTOAPPLY_FIX = `    applyRequest,\n    onSkeletonApplied: (r) => {`;
const AUTOAPPLY_BROKEN = `    applyRequest: applyRequest ?? (ready ? { steps: ready.steps, mode: 'append', nonce: -1 } : null),\n    onSkeletonApplied: (r) => {`;
// Instrumentation (always on, in memory): count the card pictures' seam-graph reads.
const GRAPH_READ = `g = readSeamGraph(facts);`;
const GRAPH_READ_COUNTED = `g = ((window.__graphReads = (window.__graphReads || 0) + 1), readSeamGraph(facts));`;
const CHURN_FIX = `}, [factsSig, live]);`;
const CHURN_BROKEN = `}, [factsSig, live, shapes]);`;
const plugins = [
  {
    name: 'skeleton-instrument',
    setup(b) {
      b.onLoad({ filter: /card-unit-pictures\.tsx$/ }, async (args) => {
        let src = await readFile(args.path, 'utf8');
        if (!src.includes(GRAPH_READ)) throw new Error('instrumentation did not find its line');
        src = src.replace(GRAPH_READ, GRAPH_READ_COUNTED);
        if (MUTATE_CHURN) {
          if (!src.includes(CHURN_FIX)) throw new Error('churn mutation did not find its line');
          src = src.replace(CHURN_FIX, CHURN_BROKEN);
        }
        return { contents: src, loader: 'tsx' };
      });
    },
  },
];
if (MUTATE_AUTOAPPLY)
  plugins.push({
    name: 'skeleton-mutation',
    setup(b) {
      b.onLoad({ filter: /assembly-skeleton-panel\.tsx$/ }, async (args) => {
        const src = await readFile(args.path, 'utf8');
        if (!src.includes(AUTOAPPLY_FIX)) throw new Error('mutation did not find its line');
        return { contents: src.replace(AUTOAPPLY_FIX, AUTOAPPLY_BROKEN), loader: 'tsx' };
      });
    },
  });

await esbuild({
  entryPoints: [resolve(HERE, 'ui-probe-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
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
    store: resolve(REPO, 'src/store'),
    hooks: resolve(REPO, 'src/hooks'),
  },
});
const bundle = readFileSync(outfile, 'utf8');

// THE BUILT ADMIN CSS (dist/assets/index-*.css, as construction-audit-probe does). The checks do not
// depend on it; the screenshots do — without it no tailwind class exists. Run `yarn build` first
// for faithful shots; a missing build is said aloud, not hidden.
let css = '';
try {
  const dir = resolve(REPO, 'dist/assets');
  const name = readdirSync(dir).find((f) => /^index-.*\.css$/.test(f));
  if (name) css = readFileSync(resolve(dir, name), 'utf8');
} catch {
  /* no build */
}
if (!css) console.log('note: dist CSS missing — screenshots are unstyled (run `yarn build`)');

// SS26-005 as a card: the DXF through the product parser (node), the sewing line per block, keyed by
// the card's lineKeys from the B4 fixture — the same facts the tech card would build.
async function loadRealCard() {
  const plans = process.env.SKELETON_PLANS ?? resolve(REPO, '../tmp/plans');
  const dxf = resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf');
  if (!existsSync(dxf)) return null;
  const nodeOut = resolve(tmpdir(), `skeleton-ui-node-${process.pid}.mjs`);
  await esbuild({
    entryPoints: [resolve(HERE, 'seams-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: nodeOut,
    logLevel: 'warning',
    absWorkingDir: REPO,
  });
  const { loadFacts } = await import(nodeOut);
  const buf = readFileSync(dxf);
  const quiet = [console.log, console.warn];
  console.log = () => {};
  console.warn = () => {};
  const { facts } = await loadFacts(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    'M',
    'shirt',
  );
  [console.log, console.warn] = quiet;
  const card = JSON.parse(readFileSync(resolve(HERE, 'fixtures/ss26-005.json'), 'utf8')).facts;
  const byName = new Map(facts.pieces.map((p) => [p.name, p.piece]));
  return {
    category: 'shirts',
    pieces: card.pieces
      .filter((p) => byName.has(p.name))
      .map((p) => ({ lineKey: p.pieceKey, name: p.name, piece: byName.get(p.name) })),
  };
}

// The blazer (46 pieces, lined, numbered names) — the corpus card whose skeleton has readings.
async function loadBlazer() {
  const plans = process.env.SKELETON_PLANS ?? resolve(REPO, '../tmp/plans');
  const dxf = resolve(plans, 'pdf-to-dxf/corpus/dxf-clo/blazer.dxf');
  if (!existsSync(dxf)) return null;
  const nodeOut = resolve(tmpdir(), `skeleton-ui-node-${process.pid}.mjs`);
  await esbuild({
    entryPoints: [resolve(HERE, 'seams-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: nodeOut,
    logLevel: 'warning',
    absWorkingDir: REPO,
  });
  const { loadFacts } = await import(nodeOut);
  const buf = readFileSync(dxf);
  const quiet = [console.log, console.warn];
  console.log = () => {};
  console.warn = () => {};
  const { facts } = await loadFacts(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    'M',
    'jacket-lined',
  );
  [console.log, console.warn] = quiet;
  return {
    category: 'blazers',
    lining: true,
    pieces: facts.pieces.map((p) => ({
      lineKey: p.pieceKey,
      name: p.name,
      piece: p.piece,
      cloth: p.cloth ?? 'main',
    })),
  };
}

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
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

async function mount(m) {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((mm) => window.__sk.mount(mm), m);
  await page.waitForSelector('[data-skeleton-door]', { timeout: 20000 });
  await page.waitForTimeout(300);
}
const shot = async (name, el) => {
  const path = resolve(SHOT_DIR, `${name}.png`);
  if (el) await page.locator(el).screenshot({ path });
  else await page.screenshot({ path, fullPage: true });
  console.log(`        shot → ${path}`);
};
const ops = () => page.evaluate(() => window.__sk.ops());
const requests = () => page.evaluate(() => window.__sk.autosaveRequests());
const isDirty = () => page.evaluate(() => window.__sk.form().formState.isDirty);
// A card with steps asks «add or replace» before anything is read: `mode` answers it.
const openPanel = async (where = 'header', mode = null) => {
  await page.click(`[data-skeleton-door="${where}"]`);
  if (mode) {
    await page.waitForSelector('[data-skeleton-modes="unchosen"]', { timeout: 5000 });
    await page.click(`[data-skeleton-mode="${mode}"]`);
  }
  await page.waitForSelector('[data-skeleton-step="0"]', { timeout: 5000 });
};
const closePanel = async () => {
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-skeleton-panel]', { state: 'detached', timeout: 5000 });
};

const MACHINE = 'TECH_CARD_OPERATION_TYPE_MACHINE';

// ── A ───────────────────────────────────────────────────────────────────────────────────────────
head('A — look, do not apply: the form does not move');
await mount({});
const before = JSON.stringify(await ops());
ck(
  await page.locator('[data-skeleton-door="header"]').isEnabled(),
  'header door is open on a card with pieces',
);
ck(
  (await page.locator('[data-skeleton-door="empty"]').count()) === 1,
  'the empty state carries the second door',
);
await openPanel('empty');
const shownSteps = await page.locator('[data-skeleton-step]').count();
ck(shownSteps === 6, 'the proposal shows 6 steps', `shown ${shownSteps}`);
await shot('a-panel');
// fiddle: untick, switch press open, pick the second reading — still nothing written
await page.click('[data-skeleton-press]');
await page.click('[data-skeleton-variant="2.1"]');
await page.waitForFunction(
  () => document.querySelector('[data-skeleton-variant="2.1"]')?.className.includes('bg-textColor'),
  null,
  { timeout: 5000 },
);
await page.click('[data-skeleton-variant="2.0"]');
await page.waitForFunction(
  () => document.querySelector('[data-skeleton-variant="2.0"]')?.className.includes('bg-textColor'),
  null,
  { timeout: 5000 },
);
await page.click('[data-skeleton-press]');
await closePanel();
await page.waitForTimeout(200);
ck(JSON.stringify(await ops()) === before, 'operations unchanged after look + fiddle + close');
ck((await requests()).length === 0, 'autosave never asked', JSON.stringify(await requests()));
ck(!(await isDirty()), 'the form is not dirty');

// ── B ───────────────────────────────────────────────────────────────────────────────────────────
head('B — apply all accepted');
await mount({ machines: [{ machineType: 'TECH_CARD_MACHINE_TYPE_OVERLOCK' }] });
await openPanel();
const accepted = await page.locator('[data-skeleton-accepted="1"]').count();
ck(accepted === 5, 'five steps ticked by default (the guess is not)', `ticked ${accepted}`);
ck(
  (await page.locator('[data-skeleton-step="5"]').getAttribute('data-skeleton-accepted')) === '0',
  'the 0.4 hem step is unticked — shown, not applied',
);
ck(
  (await page.locator('[data-skeleton-checkflag]').count()) >= 4,
  'every MACHINE step says «check the machine»',
);
const ev = await page.locator('[data-skeleton-evidence="0"]').innerText();
ck(/128 = 128 mm/.test(ev) && /1 notch/.test(ev), 'evidence in words', ev);
ck(
  (await page.locator('[data-skeleton-leftout]').getAttribute('data-skeleton-leftout')) === '1',
  'the pocket is an honest gap',
);
ck(
  (await page.locator('[data-skeleton-nocontour]').count()) === 1,
  'the label without a contour is named',
);
await shot('b-panel-before-apply', '[data-skeleton-panel]');
await page.click('[data-skeleton-apply-all]');
await page.waitForSelector('[data-skeleton-applied]', { timeout: 5000 });
await shot('b-panel-after-apply', '[data-skeleton-panel]');
const rows = await ops();
ck(rows.length === 5, 'five rows in the form', `rows ${rows.length}`);
const machines = rows.filter((r) => r.operationType === MACHINE);
ck(
  machines.length === 4 &&
    machines.every((r) => r.machineType === 'TECH_CARD_MACHINE_TYPE_OVERLOCK'),
  'MACHINE rows carry the card default machine',
  machines.map((r) => r.machineType).join(','),
);
ck(
  rows.some(
    (r) =>
      r.operationType === 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN' &&
      r.pressEquipment === 'TECH_CARD_PRESS_EQUIPMENT_IRON',
  ),
  'press open carries pressing equipment (server-required)',
);
ck(
  rows.every((r) => r.zone && r.zone !== 'TECH_CARD_GARMENT_ZONE_UNKNOWN'),
  'every row has a zone',
);
ck(
  rows.every((r) => !r.work && !r.smv),
  'work and SMV stay empty for the technologist',
);
const viol = await page.evaluate(() => window.__sk.sweep());
const hard = viol.filter((v) => v.rule !== 4);
ck(hard.length === 0, 'assemblySweep: no violations of rules 1–3/6/7', JSON.stringify(hard));
console.log(
  `        rule 4 (release gate, words): ${
    viol
      .filter((v) => v.rule === 4)
      .map((v) => v.message)
      .join(' | ') || '—'
  }`,
);
ck((await page.evaluate(() => window.__sk.opErrors())) === 0, 'zod: the applied rows validate');
ck(
  (await requests()).includes('skeleton'),
  'autosave asked with «skeleton»',
  JSON.stringify(await requests()),
);
await closePanel();
// A card with units opens on the SCHEMATIC: the mark rides the step's label there.
const schematicDrafts = await page.evaluate(
  () => (document.body.textContent ?? '').match(/· draft/g)?.length ?? 0,
);
ck(schematicDrafts === 5, 'the schematic labels five steps «· draft»', `seen ${schematicDrafts}`);
await shot('b-schematic-draft');
await page.click('[role="radiogroup"][aria-label="sequence view"] [role="radio"]:has-text("list")');
await page.waitForSelector('[data-rail-step="0"]', { timeout: 5000 });
ck(
  (await page.locator('[data-rail-draft]').count()) === 5,
  'the list rail marks five rows «draft»',
);
await shot('b-rail-draft');
await page.evaluate(() => window.__sk.touch(1));
await page.waitForTimeout(250);
const drafts = await page
  .locator('[data-rail-draft]')
  .evaluateAll((n) => n.map((x) => x.getAttribute('data-rail-draft')));
ck(
  drafts.length === 4 && !drafts.includes('1'),
  'a touch takes the mark off that row only',
  drafts.join(','),
);
await page.evaluate(() =>
  window.__sk.form().setValue('operations.1.smv', '', { shouldDirty: true }),
);
await page.waitForTimeout(250);
ck(
  (await page.locator('[data-rail-draft]').count()) === 4,
  'undoing the touch does not bring the mark back',
);
// reopen: same proposal, applied marks kept, no second read
await openPanel();
ck(
  (await page.locator('[data-skeleton-step-applied]').count()) === 5,
  'reopened panel keeps «applied» marks',
);
ck(
  (await page.evaluate(() => window.__sk.providerCalls())) === 1,
  'reopening does not read the pattern again',
);
await closePanel();
{
  const n = (await ops()).length;
  await page.evaluate(() => window.__sk.remountField());
  await page.waitForTimeout(300);
  ck(
    (await ops()).length === n,
    'a remounted field does not replay the apply',
    `${n} → ${(await ops()).length}`,
  );
}

// ── C ───────────────────────────────────────────────────────────────────────────────────────────
head('C — apply this step, readings, a ticked guess');
await mount({});
await openPanel();
ck(
  (await page.locator('[data-skeleton-variants="2"] [data-skeleton-variant]').count()) === 2,
  'ambiguous join shows two readings',
);
ck(
  (await page.locator('[data-skeleton-variant="2.0"]').getAttribute('class'))?.includes(
    'bg-textColor',
  ) ?? false,
  'the first reading is preselected',
);
ck(
  await page.locator('[data-skeleton-apply-one="2"]').isDisabled(),
  '«apply this step» refuses a step whose unit is not made yet',
);
await page.click('[data-skeleton-apply-one="0"]');
await page.waitForSelector('[data-skeleton-applied="1"]', { timeout: 5000 });
let r = await ops();
ck(
  r.length === 1 && r[0].outputUnitKey === 'SHOULDERS',
  'one step applied, the first',
  JSON.stringify(r.map((x) => x.outputUnitKey)),
);
ck(
  await page.locator('[data-skeleton-apply-one="2"]').isEnabled(),
  'now the next join may go on its own',
);
await page.click('[data-skeleton-check="5"]');
ck(
  (await page.locator('[data-skeleton-step="5"]').getAttribute('data-skeleton-accepted')) === '1',
  'a guess can be ticked by hand',
);
await page.click('[data-skeleton-apply-all]');
await page.waitForSelector('[data-skeleton-applied="5"]', { timeout: 5000 });
r = await ops();
ck(
  r.length === 6,
  'apply all adds the rest (ticked guess included), not the applied one twice',
  `rows ${r.length}`,
);
ck(
  (await page.evaluate(() => window.__sk.sweep())).filter((v) => v.rule !== 4).length === 0,
  'still no violations',
);
await closePanel();

// ── D ───────────────────────────────────────────────────────────────────────────────────────────
head('D — a card that already has steps');
const EXIST = [
  {
    operationType: MACHINE,
    machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
    zone: 'TECH_CARD_GARMENT_ZONE_POCKET',
    inputKeys: ['PKT'],
  },
  {
    operationType: 'TECH_CARD_OPERATION_TYPE_HANDWORK',
    zone: 'TECH_CARD_GARMENT_ZONE_OTHER',
    inputKeys: ['LBL'],
  },
];
await mount({ ops: EXIST });
ck(
  (await page.locator('[data-skeleton-door="empty"]').count()) === 0,
  'no empty state, only the header door',
);
await page.click('[data-skeleton-door="header"]');
await page.waitForSelector('[data-skeleton-modes="unchosen"]', { timeout: 5000 });
ck(
  (await page.locator('[data-skeleton-step]').count()) === 0 &&
    (await page.evaluate(() => window.__sk.providerCalls())) === 0,
  'a card with steps: nothing is read until «add» or «replace» is chosen',
);
{
  const t = await page.locator('[data-skeleton-mode="replace"]').innerText();
  ck(
    /replace the 2 steps/i.test(t) && /goes when you apply: 2 steps/i.test(t),
    'the replace choice says what goes',
    t.replace(/\s+/g, ' '),
  );
}
await shot('d-mode-choice', '[data-skeleton-panel]');
await page.click('[data-skeleton-mode="append"]');
await page.waitForSelector('[data-skeleton-step="0"]', { timeout: 5000 });
ck(
  (await page.locator('[data-skeleton-step="0"] .tabular-nums').first().innerText()).trim() ===
    '30',
  'append numbers start after step 20',
);
await page.click('[data-skeleton-mode="replace"]');
await page.click('[data-skeleton-apply-all]');
ck((await ops()).length === 2, 'replace: the first press only asks to confirm');
await shot('d-replace-confirm', '[data-skeleton-panel]');
await page.click('[data-skeleton-apply-all]');
await page.waitForSelector('[data-skeleton-applied]', { timeout: 5000 });
r = await ops();
ck(
  r.length === 5 && r[0].outputUnitKey === 'SHOULDERS',
  'confirmed replace: the five proposal rows only',
  `rows ${r.length}`,
);
await closePanel();

// ── E ───────────────────────────────────────────────────────────────────────────────────────────
head('E — shut doors say why');
await mount({ noDxf: true });
ck(
  (await page.locator('[data-skeleton-door="header"]').count()) === 0 &&
    (await page.locator('[data-skeleton-why="header"]').count()) === 0,
  'no DXF: the header carries no door and no reason (silent)',
);
ck(
  await page.locator('[data-skeleton-door="empty"]').isDisabled(),
  'no DXF: the empty-state door is disabled',
);
{
  const w = (await page.locator('[data-skeleton-why="empty"]').textContent()) ?? '';
  ck(/no pattern/.test(w), 'no DXF: the empty state says why in words', w);
}
await shot('e-nodxf', 'section');
for (const [m, why, name] of [
  [{ frozen: true }, /released/, 'released card'],
  [{ noProvider: true }, /not connected/, 'no engine'],
]) {
  await mount(m);
  ck(
    await page.locator('[data-skeleton-door="header"]').isDisabled(),
    `${name}: the header door is disabled`,
  );
  const w =
    (await page
      .locator('[data-skeleton-why="header"]')
      .textContent()
      .catch(() => '')) ?? '';
  ck(why.test(w), `${name}: says why in words`, w);
  if (name === 'released card') await shot('e-frozen-header', 'section');
}

// ── F ───────────────────────────────────────────────────────────────────────────────────────────
head('F — a failing engine is named, not swallowed');
await mount({ failProvider: true });
await page.click('[data-skeleton-door="header"]');
await page.waitForSelector('[data-skeleton-state="error"]', { timeout: 5000 });
ck(
  /mock engine failed/.test(
    (await page.locator('[data-skeleton-state="error"]').textContent()) ?? '',
  ),
  'the error is shown with its reason',
);
ck((await ops()).length === 0, 'and nothing is written');

// ── H ───────────────────────────────────────────────────────────────────────────────────────────
head('H — the second reading rebuilds the order; apply all keeps it clean');
await mount({});
await openPanel();
await page.click('[data-skeleton-variant="2.1"]');
await page.waitForFunction(
  () => document.querySelector('[data-skeleton-variant="2.1"]')?.className.includes('bg-textColor'),
  null,
  { timeout: 5000 },
);
ck(
  /Body with pocket/.test(await page.locator('[data-skeleton-step="2"]').innerText()),
  'the chosen reading is the step now (rebuilt, not patched)',
);
ck((await page.evaluate(() => window.__sk.providerCalls())) === 2, 'one rebuild for one choice');
ck((await page.locator('[data-skeleton-violation]').count()) === 0, 'no step breaks the order');
await page.click('[data-skeleton-apply-all]');
await page.waitForSelector('[data-skeleton-applied]', { timeout: 5000 });
r = await ops();
ck(
  r.some((x) => x.outputUnitKey === 'NECK' && (x.inputKeys ?? []).includes('PKT')),
  'the applied order carries the chosen reading',
);
{
  const hard = (await page.evaluate(() => window.__sk.sweep())).filter((v) => v.rule !== 4);
  ck(hard.length === 0, 'assemblySweep clean after the second reading', JSON.stringify(hard));
}
ck(
  await page.locator('[data-skeleton-variant="2.0"]').isDisabled(),
  'readings lock once a step of the skeleton is applied',
);
await closePanel();

// ── I ───────────────────────────────────────────────────────────────────────────────────────────
head('I — replace over steps with photos and units says what goes, and tells the server');
const PHOTO = { mediaId: 7, caption: '', annotations: [] };
await mount({
  ops: [
    {
      operationType: MACHINE,
      machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
      zone: 'TECH_CARD_GARMENT_ZONE_POCKET',
      inputKeys: ['PKT', 'FP'],
      outputUnitKey: 'FRONT-P',
      outputUnitName: 'Front with pocket',
      media: [PHOTO, { ...PHOTO, mediaId: 8 }],
    },
  ],
});
await openPanel('header', 'replace');
await page.click('[data-skeleton-apply-all]');
{
  const t =
    (await page
      .locator('[data-skeleton-replace-loses]')
      .innerText()
      .catch(() => '')) ?? '';
  ck(/2 step photos/.test(t), 'the confirmation says the photos go', t);
}
await shot('i-replace-photos', '[data-skeleton-panel]');
await page.click('[data-skeleton-apply-all]');
await page.waitForSelector('[data-skeleton-applied]', { timeout: 5000 });
{
  const f = await page.evaluate(() => ({
    media: window.__sk.form().getValues('mediaCleared'),
    units: window.__sk.form().getValues('assemblyCleared'),
  }));
  ck(f.media === true, 'replace over photos declares mediaCleared', JSON.stringify(f));
  ck(f.units === false, 'replace with unit rows keeps assemblyCleared off', JSON.stringify(f));
}
await closePanel();
await mount({
  unitless: true,
  ops: [
    {
      operationType: MACHINE,
      machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
      zone: 'TECH_CARD_GARMENT_ZONE_POCKET',
      inputKeys: ['PKT', 'FP'],
      outputUnitKey: 'FRONT-P',
      outputUnitName: 'Front with pocket',
    },
  ],
});
await openPanel('header', 'replace');
await page.click('[data-skeleton-apply-all]');
{
  const t =
    (await page
      .locator('[data-skeleton-replace-loses]')
      .innerText()
      .catch(() => '')) ?? '';
  ck(/the unit markup/.test(t), 'the confirmation says the unit markup goes', t);
}
await page.click('[data-skeleton-apply-all]');
await page.waitForSelector('[data-skeleton-applied]', { timeout: 5000 });
ck(
  (await page.evaluate(() => window.__sk.form().getValues('assemblyCleared'))) === true,
  'replace with no unit rows over a card with units declares assemblyCleared',
);
await closePanel();

// ── J ───────────────────────────────────────────────────────────────────────────────────────────
head('J — typing in the BOM does not re-read the seam graph');
await mount({ churnShapes: true });
await openPanel();
await page.click('[data-skeleton-apply-all]');
await page.waitForSelector('[data-skeleton-applied]', { timeout: 5000 });
await closePanel();
await page.evaluate(() =>
  window.__sk.form().setValue('bomItems', [{ lineKey: 'B1', name: '' }], { shouldDirty: true }),
);
await page.waitForTimeout(1500);
const readsBefore = await page.evaluate(() => window.__graphReads ?? 0);
ck(readsBefore >= 1, 'the unit pictures read the graph once units exist', `${readsBefore} reads`);
const word = 'cotton twill';
for (let i = 1; i <= word.length; i++) {
  await page.evaluate(
    (v) => window.__sk.form().setValue('bomItems.0.name', v, { shouldDirty: true }),
    word.slice(0, i),
  );
  await page.waitForTimeout(40);
}
await page.waitForTimeout(1500);
const readsAfter = await page.evaluate(() => window.__graphReads ?? 0);
ck(
  readsAfter === readsBefore,
  `${word.length} BOM keystrokes (contour Map re-created each time) re-read the graph 0 times`,
  `${readsAfter - readsBefore} extra reads`,
);

// ── K ───────────────────────────────────────────────────────────────────────────────────────────
head('K — the real engine on the blazer: the second reading, everything ticked, apply all');
const blazer = await loadBlazer();
if (!blazer) {
  ck(false, 'blazer DXF found (SKELETON_PLANS)', 'corpus missing');
} else {
  await mount({ real: blazer });
  await page.click('[data-skeleton-door="header"]');
  await page.waitForSelector('[data-skeleton-step="0"]', { timeout: 20000 });
  const first = page.locator('[data-skeleton-variants]').first();
  const at = await first.getAttribute('data-skeleton-variants');
  const before = await page.locator('[data-skeleton-step]').allInnerTexts();
  await page.click(`[data-skeleton-variant="${at}.1"]`);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.className.includes('bg-textColor'),
    `[data-skeleton-variant="${at}.1"]`,
    { timeout: 10000 },
  );
  const after = await page.locator('[data-skeleton-step]').allInnerTexts();
  ck(
    JSON.stringify(after) !== JSON.stringify(before),
    `choosing reading ${at}.1 rebuilt the proposal`,
  );
  // tick everything still unticked, in order (a join's tick carries its riders)
  for (;;) {
    const off = page.locator(
      '[data-skeleton-accepted="0"]:not([data-skeleton-step-applied]) [data-skeleton-check]',
    );
    if ((await off.count()) === 0) break;
    await off.first().click();
  }
  const blocked = await page.locator('[data-skeleton-violation]').count();
  ck(blocked === 0, 'the whole rebuilt proposal keeps the order', `${blocked} violations`);
  await page.click('[data-skeleton-apply-all]');
  await page.waitForSelector('[data-skeleton-applied]', { timeout: 5000 });
  const hard = (await page.evaluate(() => window.__sk.sweep())).filter((v) => v.rule !== 4);
  ck(
    hard.length === 0,
    'assemblySweep clean on the applied blazer order (second reading)',
    JSON.stringify(hard).slice(0, 300),
  );
  await shot('k-blazer-second-reading', '[data-skeleton-panel]');
  await closePanel();
}

// ── L ───────────────────────────────────────────────────────────────────────────────────────────
head('L — the AI second opinion (stub asker): shown beside the steps, used only on a press');
if (!blazer) {
  ck(false, 'blazer DXF found (SKELETON_PLANS)', 'corpus missing');
} else {
  // The steps in their order, without the AI's own marks (its pills and its «AI:» lines).
  const stepWords = async () =>
    (await page.locator('[data-skeleton-step]').allInnerTexts()).map((t) =>
      t
        .split('\n')
        .filter((l) => !/^AI\b/.test(l.trim()))
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/ · AI\b/g, ''),
    );
  const aiCalls = () => page.evaluate(() => window.__sk.aiCalls());
  await mount({ real: blazer, ai: true });
  await page.click('[data-skeleton-door="header"]');
  await page.waitForSelector('[data-skeleton-step="0"]', { timeout: 20000 });
  ck((await page.locator('[data-skeleton-ai="idle"]').count()) === 1, 'the AI bar is there, idle');
  ck((await aiCalls()) === 0, 'opening the panel asks the AI nothing');
  const engineCalls = await page.evaluate(() => window.__sk.providerCalls());
  const opsBefore = JSON.stringify(await ops());
  const before = await stepWords();

  await page.click('[data-skeleton-ai-ask]');
  await page.waitForSelector('[data-skeleton-ai="ready"]', { timeout: 10000 });
  ck((await aiCalls()) === 1, 'one press, one call');
  ck(
    JSON.stringify(await stepWords()) === JSON.stringify(before),
    'the answer is SHOWN: the steps stay in the engine order',
  );
  ck(JSON.stringify(await ops()) === opsBefore, 'the form does not move');
  ck((await requests()).length === 0, 'autosave never asked');
  const places = await page.locator('[data-skeleton-ai-place]').count();
  ck(places >= 10, 'each ordered step carries its AI place', `${places} AI places`);
  const picksShown = await page.locator('[data-skeleton-ai-pick]').count();
  ck(picksShown >= 1, 'the AI pick is marked on the reading chips', `${picksShown}`);
  ck(
    (await page.locator('[data-skeleton-ai-cost="0.0123"]').innerText()).includes('$0.0123'),
    'the cost is printed',
  );
  ck(
    (await page.locator('[data-skeleton-ai-warning]').count()) === 1,
    'the AI doubt sits on its step',
  );
  const moved = Number(
    await page.locator('[data-skeleton-ai-use-order]').getAttribute('data-skeleton-ai-use-order'),
  );
  ck(moved > 0, 'the AI order moves steps — offered, not applied', `${moved} would move`);
  await shot('l-ai-shown', '[data-skeleton-panel]');

  // Readings first: a rebuild, and the order read on the old readings is no longer offered.
  await page.click('[data-skeleton-ai-use-readings]');
  await page.waitForFunction((n) => window.__sk.providerCalls() > n, engineCalls, {
    timeout: 10000,
  });
  await page.waitForSelector('[data-skeleton-ai-order-blocked]', { timeout: 10000 });
  ck(
    /changed since the AI read it/.test(
      await page.locator('[data-skeleton-ai-order-blocked]').innerText(),
    ),
    'after the AI readings the old AI order is refused in words',
  );
  ck(JSON.stringify(await ops()) === opsBefore, 'still nothing in the form');

  // Ask again on the rebuilt skeleton, then use its order.
  await page.click('[data-skeleton-ai-again]');
  await page.waitForFunction(() => window.__sk.aiCalls() === 2, null, { timeout: 10000 });
  await page.waitForSelector('[data-skeleton-ai="ready"]', { timeout: 10000 });
  const beforeOrder = await stepWords();
  await page.click('[data-skeleton-ai-use-order]');
  await page.waitForFunction(
    () => document.querySelector('[data-skeleton-ai-use-order]')?.textContent?.includes('in use'),
    null,
    { timeout: 10000 },
  );
  const afterOrder = await stepWords();
  ck(
    JSON.stringify(afterOrder) !== JSON.stringify(beforeOrder) &&
      // Step numbers («30», «↳ with 30») follow the order; what each step IS does not.
      JSON.stringify(afterOrder.map((t) => t.replace(/\d+/g, '#')).sort()) ===
        JSON.stringify(beforeOrder.map((t) => t.replace(/\d+/g, '#')).sort()),
    '«use AI order» reorders the same steps on screen',
  );
  ck(JSON.stringify(await ops()) === opsBefore, 'using the AI order writes nothing to the form');
  for (;;) {
    const off = page.locator(
      '[data-skeleton-accepted="0"]:not([data-skeleton-step-applied]) [data-skeleton-check]',
    );
    if ((await off.count()) === 0) break;
    await off.first().click();
  }
  const blocked = await page.locator('[data-skeleton-violation]').count();
  ck(blocked === 0, 'the AI-ordered batch keeps the order', `${blocked} violations`);
  await page.click('[data-skeleton-apply-all]');
  await page.waitForSelector('[data-skeleton-applied]', { timeout: 5000 });
  const hard = (await page.evaluate(() => window.__sk.sweep())).filter((v) => v.rule !== 4);
  ck(
    hard.length === 0,
    'assemblySweep clean on the applied AI order',
    JSON.stringify(hard).slice(0, 300),
  );
  await shot('l-ai-applied', '[data-skeleton-panel]');
  await closePanel();
  await page.click('[data-skeleton-door="header"]');
  await page.waitForSelector('[data-skeleton-ai="ready"]', { timeout: 5000 });
  ck((await aiCalls()) === 2, 'reopening shows the answer again without asking');
  await closePanel();
}

// ── G ───────────────────────────────────────────────────────────────────────────────────────────
head('G — the real engine on SS26-005: pictograms in the panel and on the schematic');
const real = await loadRealCard();
if (!real) {
  ck(false, 'SS26-005 DXF found (SKELETON_PLANS)', 'plans folder missing');
} else {
  await mount({ real });
  await page.click('[data-skeleton-door="header"]');
  await page.waitForSelector('[data-skeleton-step="0"]', { timeout: 20000 });
  const steps = await page.locator('[data-skeleton-step]').count();
  ck(steps >= 18, 'the real engine proposes the order', `${steps} steps`);
  {
    const head = page.locator('[data-skeleton-to-decide]');
    const n = Number(await head.getAttribute('data-skeleton-to-decide'));
    const riders = await page.locator('[data-skeleton-follows]').count();
    console.log(`        header: ${(await head.innerText()).replace(/\s+/g, ' ')}`);
    // The genuine guesses of SS26-005: collar with stand, collar into the neckline, set sleeves.
    ck(n <= 5, 'only the genuine guesses are left to decide', `${n} to decide, ${riders} riders`);
    ck(riders >= 15, 'presses and processing ride on their joins', `${riders} riders`);
  }
  const outPics = await page.locator('[data-skeleton-unit] svg[role="img"]').count();
  ck(outPics >= 8, 'unit outputs carry their pictogram', `${outPics} pictograms`);
  const inPics = await page.locator('[data-skeleton-unit-input] svg[role="img"]').count();
  ck(inPics >= 4, 'earlier units taken as inputs are drawn, not «▣ key»', `${inPics} unit inputs`);
  const blocked = await page.locator('[data-skeleton-violation]').count();
  ck(blocked === 0, 'the default ticks make a batch that keeps the order', `${blocked} violations`);
  await shot('g-real-panel', '[data-skeleton-panel]');
  if (process.env.SKELETON_DEBUG) {
    for (const t of await page.locator('[data-skeleton-violation]').allTextContents())
      console.log('   VIOLATION', t);
    for (const t of await page.locator('[data-skeleton-step]').allInnerTexts())
      console.log('   STEP', t.replace(/\s+/g, ' ').slice(0, 220));
  }
  await page.click('[data-skeleton-apply-all]');
  await page.waitForSelector('[data-skeleton-applied]', { timeout: 5000 });
  await closePanel();
  await page.waitForTimeout(500);
  const glyphs = await page.locator('section svg[role="img"][aria-label*=" pieces · "]').count();
  ck(glyphs >= 4, 'after apply the schematic draws unit glyphs', `${glyphs} glyphs`);
  await shot('g-real-schematic', 'section');
}

ck(pageErrors.length === 0, 'the page threw nothing', pageErrors.join(' | '));
await browser.close();
console.log(
  `\n${bad === 0 ? 'all checks passed' : `${bad} checks FAILED`}${MUTATE_AUTOAPPLY ? '  (mutation: autoapply)' : ''}`,
);
if (bad) process.exitCode = 1;
