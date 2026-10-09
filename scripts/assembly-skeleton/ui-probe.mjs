#!/usr/bin/env node
// D4 — UI PROBE OF THE ASSEMBLY SKELETON (01-PLAN §2 lane D, acceptance item 5 «nothing applied
// silently»). Headless chromium on the REAL door, panel and OperationsField over a real RHF form;
// only the proposal comes from a mock provider (scripts/assembly-skeleton/ui-probe-entry.tsx).
//
//   node scripts/assembly-skeleton/ui-probe.mjs                     run
//   node scripts/assembly-skeleton/ui-probe.mjs --mutate-autoapply   the door applies the proposal
//                                                                    the moment it is read — the
//                                                                    «nothing silently» checks MUST fail
//   SHOT_DIR=/path node … — where the screenshots go (default tmp/plans/assembly-from-pattern/shots/d)
//
// Scenarios:
//   A  look, don't apply: open → proposal → close; the form is byte-identical, autosave never asked
//   B  apply all accepted → N rows; rules 1–3/6/7 clean; zod clean; MACHINE rows carry a machine;
//      autosave asked with 'skeleton'; rail marks the rows «draft»; a touch takes one mark off
//   C  apply this step + ambiguous variant + a guess unticked by default
//   D  existing steps: append numbers after them; replace needs a second, confirming press
//   E  shut doors: released card, no DXF, no engine — disabled and saying why in words
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUTATE_AUTOAPPLY = process.argv.includes('--mutate-autoapply');

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
const plugins = [];
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
  await page.waitForSelector('[data-skeleton-door="header"]', { timeout: 20000 });
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
const openPanel = async (where = 'header') => {
  await page.click(`[data-skeleton-door="${where}"]`);
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
await page.click('[data-skeleton-variant="2.0"]');
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
await openPanel();
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
for (const [m, why, name] of [
  [{ frozen: true }, /released/, 'released card'],
  [{ noDxf: true }, /no pattern/, 'no DXF'],
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

ck(pageErrors.length === 0, 'the page threw nothing', pageErrors.join(' | '));
await browser.close();
console.log(
  `\n${bad === 0 ? 'all checks passed' : `${bad} checks FAILED`}${MUTATE_AUTOAPPLY ? '  (mutation: autoapply)' : ''}`,
);
if (bad) process.exitCode = 1;
