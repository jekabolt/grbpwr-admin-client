#!/usr/bin/env node
// SEAMS REVIEW — headless UI stand (03-SEAMS-DESIGN §6 L3).
//
//   node scripts/assembly-seams-ui/probe.mjs
//   SHOT_DIR=… STANDS=…  (defaults: ../tmp/plans/assembly-3d-doll/l3-ui and the prod-run stands)
//
// The REAL AssemblyMap + SeamsDoor + SeamsReview under the REAL providers, on prod cards' forms and
// contours (prod-run stand JSON: SS26-005; card 6 when its stand is given in CARD6_STAND). Every
// request is answered inside the page (stand-entry.tsx replaces fetch; the seams RPCs answer from
// an in-memory table) and every non-stand URL is routed to a stub here as well — nothing reaches a
// backend. Needs `vite build` for the CSS (dist/assets/index-*.css) and playwright.
import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const PLANS = resolve(REPO, '../tmp/plans');
const SHOT_DIR = process.env.SHOT_DIR ?? resolve(PLANS, 'assembly-3d-doll/l3-ui');
const STANDS = process.env.STANDS ?? resolve(PLANS, 'assembly-from-pattern/prod-run');
mkdirSync(SHOT_DIR, { recursive: true });

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

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
const outfile = resolve(tmpdir(), `seams-ui-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'stand-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: ALIAS,
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
if (!css) console.log('note: dist CSS missing — screenshots are unstyled (run `vite build`)');

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
  console.log('playwright not found — stand skipped');
  process.exit(1);
}
const mod = await import(pw);
const chromium = mod.chromium ?? mod.default?.chromium;
const loadStand = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
const ss = loadStand(resolve(STANDS, 'SS26-005.stand.json'));
const card6 = loadStand(process.env.CARD6_STAND ?? resolve(STANDS, 'card6-SS26-006.stand.json'));
if (!ss) {
  console.log(`no SS26-005 stand in ${STANDS}`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
const escaped = [];
page.on('pageerror', (e) => errors.push(String(e)));
// Every request: the stand page itself, else a stub — and noted if it was not the stub host.
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('http://probe.local/'))
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html><head><style>${css}</style></head><body class="bg-pageBg"><div id="root"></div></body></html>`,
    });
  if (!url.startsWith('data:')) escaped.push(url);
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});
const shot = async (name, el) => {
  const path = resolve(SHOT_DIR, `${name}.png`);
  if (el) await page.locator(el).first().screenshot({ path });
  else await page.screenshot({ path });
  console.log(`  shot → ${path}`);
};
const wait = (ms) => page.waitForTimeout(ms);
const waitFor = async (fn, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(fn)) return true;
    await wait(200);
  }
  return false;
};
const mount = async (stand, o) => {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(([c, opts]) => window.__seams.mount(c, opts), [stand, o ?? {}]);
  return waitFor(() => window.__seams.hasGraph());
};
const groupCount = (g) => page.locator(`[data-seam-group="${g}"]`).count();
const openReview = async () => {
  await page.locator('[data-seams-door="review"]').click();
  await page.locator('[data-seams-review]').waitFor();
  await wait(400);
};
const settle = () => wait(1600); // 400 ms settle + idle read + echo

// ── SS26-005 ──
head(
  'SS26-005 — the technologist’s card, 10 confirmed · 1 rejected · 1 stale (still fits) · 1 lost',
);
ck(await mount(ss), 'the provider reads the seam graph');
console.log(
  `  engine alone: ${JSON.stringify(await page.evaluate(() => window.__seams.graphInfo()))}`,
);
const fixture = await page.evaluate(() =>
  window.__seams.fixture({ confirm: 10, reject: 1, stale: 1, lost: 1 }),
);
ck(fixture.length === 13, 'fixture rows written by the product’s anchor code', `${fixture.length}`);
ck(await mount(ss, { seams: fixture }), 'remounted with the stored rows');
await settle();
const info0 = await page.evaluate(() => window.__seams.graphInfo());
console.log(
  `  graph: ${info0.pieces} pieces · ${info0.chosen} chosen · ${info0.forced} forced · ${info0.rejectedByPerson} rejected by a person`,
);
ck(
  info0.forced === 10,
  'the 10 confirmed rows are forced into the graph (Need A)',
  `${info0.forced}`,
);
ck(info0.rejectedByPerson >= 1, 'the rejected row is in graph.rejected with the person’s words');
const doorText = await page.locator('[data-seams-door-progress]').innerText();
console.log(`  door: ${doorText}`);
ck(/10 of \d+ seams decided/.test(doorText), 'door: «N of M seams decided»');
ck(/stale/.test(doorText), 'door: says stale');
await shot('01-door', '[data-map-column]');

await openReview();
const g0 = {
  decide: await groupCount('decide'),
  confirmed: await groupCount('confirmed'),
  rejected: await groupCount('rejected'),
  stale: await groupCount('stale'),
};
console.log(`  rail: ${JSON.stringify(g0)}`);
ck(
  g0.confirmed === 10 && g0.rejected === 1 && g0.stale === 2,
  'rail groups: 10 confirmed · 1 rejected · 2 stale',
);
ck(g0.decide > 0, 'the rest of the engine’s seams are TO DECIDE');
ck(
  (await page.locator('[data-sheet-state="confirmed"]').count()) > 0 &&
    (await page.locator('[data-sheet-state="decide"]').count()) > 0,
  'sheet: confirmed and proposed edges drawn by weight',
);
await shot('02-overlay-ss26-005');

// a stale row
await page.locator('[aria-label="show seams"] [role="radio"]', { hasText: 'stale' }).click();
await wait(200);
const staleTexts = await page.locator('[data-seam-group="stale"]').allInnerTexts();
staleTexts.forEach((t) => console.log(`  stale row: ${t.replace(/\n+/g, ' | ')}`));
ck(
  staleTexts.some((t) => /still fits/.test(t) && /re-confirm/.test(t)),
  'stale · still fits → re-confirm',
);
ck(
  staleTexts.some((t) => /connect again/.test(t)),
  'stale · not found → connect again / remove',
);
await page.locator('[data-seam-group="stale"]').first().click();
await wait(300);
await shot('03-stale-row');
// re-confirm the one that still fits
await page.locator('[data-seam-door="reconfirm"]').first().click();
await settle();
ck(
  (await groupCount('stale')) === 1,
  're-confirm: the row leaves STALE (rewritten on today’s pattern)',
);
await page.locator('[aria-label="show seams"] [role="radio"]', { hasText: 'all' }).click();
await wait(200);

// accept one proposal
const firstDecide = page.locator('[data-seam-group="decide"]').first();
const n = await firstDecide.getAttribute('data-seam-n');
await firstDecide.locator('[data-seam-door="accept"]').click();
await wait(150);
ck(
  (await page.locator(`[data-seam-n="${n}"]`).getAttribute('data-seam-group')) === 'confirmed',
  `accept: row ${n} moves to CONFIRMED at once (optimistic)`,
);
await settle();
const info1 = await page.evaluate(() => window.__seams.graphInfo());
ck(
  info1.forced === info0.forced + 2,
  'accept + re-confirm: the graph re-read has both forced',
  `${info0.forced} → ${info1.forced}`,
);
ck(
  /confirmed by Anna/.test(await page.locator(`[data-seam-n="${n}"]`).innerText()),
  'the echo replaces the optimistic row: «confirmed by Anna · date»',
);

// reject one with words
const nextDecide = page.locator('[data-seam-group="decide"]').first();
const rn = await nextDecide.getAttribute('data-seam-n');
await nextDecide.locator('[data-seam-door="reject"]').click();
await page.locator('[data-seam-words="reject"] input').fill('not this pair — pocket bag');
await page.keyboard.press('Enter');
await settle();
ck(
  (await page.locator(`[data-seam-n="${rn}"]`).getAttribute('data-seam-group')) === 'rejected',
  `reject with words: row ${rn} in REJECTED`,
);
const info2 = await page.evaluate(() => window.__seams.graphInfo());
ck(
  info2.rejectedByPerson > info1.rejectedByPerson,
  'the graph re-read drops the rejected pair with the words',
);

// refused write
await page.evaluate(() =>
  window.__seams.refuseNext('side_a.parts[0].piece_line_key: not a piece of this card'),
);
const r3 = page.locator('[data-seam-group="decide"]').first();
const n3 = await r3.getAttribute('data-seam-n');
await r3.locator('[data-seam-door="accept"]').click();
await settle();
const back = page.locator(`[data-seam-n="${n3}"]`);
ck(
  (await back.getAttribute('data-seam-group')) === 'decide',
  'refused write: the row reverts to TO DECIDE',
);
ck(
  /refused: side_a/.test(await back.innerText()),
  'refused write: the server’s field-addressed words on the row',
);

// hand connection
await page.locator('[data-seams-door="hand"]').click();
await wait(150);
// Cap ↔ armhole by hand, the case the engine leaves to the template on SS26-005: the sleeve's
// cap on side A, then the front's armhole, shift-click the back's armhole — a composite.
const titled = await page.evaluate(() =>
  [...document.querySelectorAll('[data-sheet-hit]')].map((e) => [
    e.getAttribute('data-sheet-hit'),
    e.querySelector('title')?.textContent ?? '',
  ]),
);
const lenOf = (t) => Number(/· (\d+) mm/.exec(t)?.[1] ?? 0);
const best = (re) =>
  titled.filter(([, t]) => re.test(t)).sort((x, y) => lenOf(y[1]) - lenOf(x[1]))[0]?.[0];
const a1 = best(/^SLV M L · cap/) ?? best(/^SLV M L · /) ?? titled[0][0];
const b1 = best(/^FRONT L · armhole/) ?? best(/^FRONT L · /);
const b2 = best(/^BP · armhole/) ?? best(/^BP · /);
console.log(`  hand: ${a1} ↔ ${b1} + ${b2}`);
const clickEdge = (id, shift = false) =>
  page.evaluate(
    ([i, s]) =>
      document
        .querySelector(`[data-sheet-hit="${i}"]`)
        .dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: s })),
    [id, shift],
  );
await clickEdge(a1);
await clickEdge(b1);
await clickEdge(b2, true);
await wait(200);
const strip = await page.locator('[data-connect-words]').innerText();
console.log(`  strip: ${strip}`);
ck(
  /↔/.test(strip) && /Δ/.test(strip) && /notch/.test(strip),
  'connect strip: both sides, Δ, notches, direction live',
);
await shot('04-connect-in-progress');
await page.keyboard.press('f');
await wait(100);
ck(
  /same way/.test(await page.locator('[data-connect-words]').innerText()),
  'f flips the direction in hand mode',
);
await page.locator('[data-connect-door="connect"]').click();
await settle();
const manual = await page.locator('[data-seam-row]', { hasText: 'connected by' }).allInnerTexts();
ck(
  manual.length >= 1,
  'hand connection → a CONFIRMED row «connected by …»',
  manual[0]?.replace(/\n+/g, ' | '),
);
ck(
  manual.some((t) => /across several edges/.test(t)),
  '… a composite (shift-click added a second run)',
);
await shot('05-after-decisions');

// keyboard: a row is selected, ↓ walks, Enter accepts, u undoes
await page.locator('[aria-label="show seams"] [role="radio"]', { hasText: 'to decide' }).click();
await wait(150);
await page
  .locator('[data-seam-group="decide"]')
  .first()
  .click({ position: { x: 4, y: 4 } });
await page.keyboard.press('ArrowDown');
await wait(100);
const kn = await page.locator('[data-seam-row][aria-selected="true"]').getAttribute('data-seam-n');
await page.keyboard.press('Enter');
await settle();
await page.locator('[aria-label="show seams"] [role="radio"]', { hasText: 'all' }).click();
await wait(150);
ck(
  (await page.locator(`[data-seam-n="${kn}"]`).getAttribute('data-seam-group')) === 'confirmed',
  `keyboard: ↓ then Enter accepts row ${kn}`,
);
await page.locator(`[data-seam-n="${kn}"]`).click({ position: { x: 4, y: 4 } });
await page.keyboard.press('u');
await settle();
ck(
  (await page.locator(`[data-seam-n="${kn}"]`).getAttribute('data-seam-group')) === 'decide',
  `keyboard: u undoes it — the row is deleted, the proposal is back`,
);
const del = await page.evaluate(() =>
  window.__seams.calls().filter((c) => /seams:delete$/.test(c.path)),
);
ck(del.length >= 1, 'undo goes through DeleteTechCardSeams');

// accept all sure
const sureLabel = await page.locator('[data-seams-door="accept-sure"]').innerText();
const sureN = Number(/\((\d+)\)/.exec(sureLabel)?.[1] ?? 0);
const before = await groupCount('confirmed');
if (sureN > 0) {
  await page.locator('[data-seams-door="accept-sure"]').click();
  await settle();
  ck(
    (await groupCount('confirmed')) === before + sureN,
    `accept all sure: +${sureN} confirmed, likely / check untouched`,
  );
}
const put = await page.evaluate(() => window.__seams.calls().filter((c) => c.method === 'PUT'));
ck(
  put.every((c) => (c.body?.seams ?? []).length <= Math.max(1, sureN)),
  'every upsert sends only the rows that changed',
  put.map((c) => c.body?.seams?.length).join(','),
);
await page.keyboard.press('Escape');
await wait(300);
ck((await page.locator('[data-seams-review]').count()) === 0, 'Esc closes the overlay');
await shot('06-door-after', '[data-map-column]');

// released card
head('released card');
await mount(ss, { seams: fixture, frozen: true });
await settle();
await openReview();
ck(
  /released/.test(await page.locator('[data-seams-frozen]').innerText()),
  'the frozen line says why, in words',
);
const enabled = await page.locator('[data-seam-row] button:not([disabled])').count();
ck(enabled === 0, 'every row door is disabled', `${enabled} enabled`);
ck(
  await page.locator('[data-seams-door="accept-sure"]').isDisabled(),
  'accept all sure is disabled',
);
await shot('07-released');

// card 6
if (card6) {
  head('prod card 6 — SS26-006 starvation (MAIN + POCKETING)');
  ck(await mount(card6), 'the provider reads the seam graph');
  const fx6 = await page.evaluate(() =>
    window.__seams.fixture({ confirm: 6, reject: 1, stale: 0, lost: 0 }),
  );
  await mount(card6, { seams: fx6 });
  await settle();
  await openReview();
  const g6 = {
    decide: await groupCount('decide'),
    confirmed: await groupCount('confirmed'),
    rejected: await groupCount('rejected'),
  };
  console.log(`  rail: ${JSON.stringify(g6)}`);
  ck(g6.confirmed === 6 && g6.rejected === 1, 'card 6: 6 confirmed · 1 rejected');
  await page.locator('[data-seam-group="decide"]').first().hover();
  await wait(200);
  await shot('08-overlay-card6');
} else console.log('\nno card 6 stand — skipped (CARD6_STAND)');

head('network');
ck(
  escaped.length === 0,
  'no request left the page (fetch is the fake backend)',
  escaped.slice(0, 3).join(', '),
);
const all = await page.evaluate(() => window.__seams.calls().map((c) => `${c.method} ${c.path}`));
console.log(`  fake backend saw ${all.length} calls on the last mount`);
ck(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));
await browser.close();
console.log(`\n${bad ? `${bad} FAIL` : 'all ok'}`);
process.exit(bad ? 1 : 0);
