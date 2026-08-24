#!/usr/bin/env node
// CONSTRUCTION AUDIT — a component harness over the REAL `construction-audit.tsx`.
//
// WHAT IT IS. Not a snapshot of markup and not a contract with the server: it mounts the shipped
// component in a browser, with the shipped CSS, and MEASURES what a reader of the CONSTRUCTION tab
// would see and what the two controls on it actually do. Seven claims are checked, and the
// load-bearing one — «under `<fieldset disabled>` the ref anchor still navigates while «file as
// issue» is correctly dead» — cannot be reached by reading the source at all: it is a browser rule
// about native controls under a disabled fieldset, and it is the entire reason the anchor is a
// `Chip nonForm` and the filer is a `<button>`.
//
// FOUR TRAPS, EVERY ONE OF WHICH PRODUCES A SILENT FALSE GREEN (see the harness note):
//   1. `nodePaths` missing → `ui/…`, `components/…` and react itself do not resolve.
//   2. `plugins: [stub]` declared and not passed → the REAL api layer lands in the bundle, the
//      stand goes to the network, everything 404s, and the measurements «pass» against an error
//      screen. Guarded below by grepping the built bundle for a stub-only marker AND for a string
//      that only the real `api/api.ts` contains; either verdict aborts the run.
//   3. The built admin CSS not loaded → no tailwind class exists and every geometry measurement is
//      a measurement of bare HTML. Guarded by a live check of `--color-error` and of a computed
//      `text-transform: uppercase`.
//   4. `innerText` reads AFTER `text-transform`, and half this admin is uppercase — every text
//      comparison here is case-insensitive and whitespace-normalised.
//
// EVERY CHECK IS SHOWN ABLE TO FAIL. Each `--mutate-…` flag patches the SOURCE IN MEMORY at build
// time (esbuild `onLoad`) — no file on disk is touched — and must redden its own checks and no
// others. A mutation that breaks the build is a false red and proves nothing, so a patch whose
// anchor is not found aborts the run with «did not run» rather than failing a check.

const dieNotRun = (why) => {
  console.log(`\nDID NOT RUN: ${why}`);
  console.log('a green OR a red run in this state would prove nothing.');
  process.exit(2);
};
process.on('uncaughtException', (e) => dieNotRun(e?.stack ?? e?.message ?? String(e)));
process.on('unhandledRejection', (e) => dieNotRun(e?.stack ?? e?.message ?? String(e)));

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SCRATCH =
  '/private/tmp/claude-501/-Users-jekabolt-go-src-github-com-jekabolt/bedb1cec-7c30-47c5-a5f0-92bb7aea38d0/scratchpad';

// ─── MUTATION FLAGS ────────────────────────────────────────────────────────────────────────────
// An UNKNOWN --mutate flag means NO mutation was applied, and the run would then print a perfectly
// honest «GREEN» that proves nothing about the mutation the caller thought they ran.
const KNOWN_MUTATIONS = new Set([
  '--mutate-mute-detail', // 1
  '--mutate-notchecked-collapsed', // 2
  '--mutate-notchecked-gone', // 2
  '--mutate-known-severity-only', // 3
  '--mutate-piece-tab', // 4
  '--mutate-card-anchored', // 4
  '--mutate-file-navigates', // 5
  '--mutate-file-silent', // 5
  '--mutate-chip-as-button', // 6
  '--mutate-file-as-chip', // 6
  '--mutate-error-as-empty', // 7
  '--mutate-gate-off', // 8
  '--mutate-insert-after-ungated', // 9
]);
const stray = process.argv.slice(2).find((a) => a.startsWith('--mutate') && !KNOWN_MUTATIONS.has(a));
if (stray) {
  console.error(
    `UNKNOWN MUTATION FLAG: ${stray}\n` +
      `the probe DID NOT RUN — a green run under that flag would have proved nothing.\n` +
      `known: ${[...KNOWN_MUTATIONS].join(', ')}`,
  );
  process.exit(2);
}
const on = (f) => process.argv.includes(f);
const MUTATIONS_ON = [...KNOWN_MUTATIONS].filter(on);

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ─── SOURCE PATCHES ────────────────────────────────────────────────────────────────────────────
const AUDIT = /construction-audit\.tsx$/;
const QUERY = /useTechCardQuery\.ts$/;

const DETAIL_FIX = `      {detail && (
        <Text size='micro' variant='label' className='mt-0.5'>
          {detail}
        </Text>
      )}`;
const DETAIL_BROKEN = `      {null}`;

const NOTCHECKED_FIX = `          {notChecked.length > 0 && (
            <div className='space-y-px'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                not checked this run
              </Text>
              {notChecked.map((n, i) => (
                <Text key={i} size='micro' variant='label'>
                  · {n}
                </Text>
              ))}
            </div>
          )}`;
const NOTCHECKED_COLLAPSED = `          {notChecked.length > 0 && (
            <details className='space-y-px'>
              <summary className='text-micro uppercase tracking-label'>not checked this run</summary>
              {notChecked.map((n, i) => (
                <Text key={i} size='micro' variant='label'>
                  · {n}
                </Text>
              ))}
            </details>
          )}`;
const NOTCHECKED_GONE = `          {false && notChecked.length > 0 && (
            <div className='space-y-px'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                not checked this run
              </Text>
              {notChecked.map((n, i) => (
                <Text key={i} size='micro' variant='label'>
                  · {n}
                </Text>
              ))}
            </div>
          )}`;

const ORDERED_FIX = `  const ordered = [
    ...SEVERITY_ORDER.filter((s) => counts.has(s)),
    ...[...counts.keys()].filter((s) => !SEVERITY_ORDER.includes(s)),
  ];`;
const ORDERED_BROKEN = `  const ordered = SEVERITY_ORDER.filter((s) => counts.has(s));`;

const PIECE_FIX = `    case 'piece':
      return { tab: 'patterns' };`;
const PIECE_BROKEN = `    case 'piece':
      return { tab: 'construction' };`;

const CARD_FIX = `  if (!value) return null;`;
const CARD_BROKEN = `  if (!value) return { tab: 'construction' };`;

const FILE_WRITE_FIX = `    setValue('issues', [...(getValues('issues') ?? []), issue], { shouldDirty: true });`;
const FILE_WRITE_NAVIGATES = `    setValue('issues', [...(getValues('issues') ?? []), issue], { shouldDirty: true });
    onGoTab?.('issues');`;
const FILE_WRITE_SILENT = `    void issue;
    void getValues;
    void setValue;`;

const CHIP_FIX = `  return (
    <Chip nonForm dashed onClick={() => onGo(refString)} title={\`go to \${refString}\`}>
      → {refString}
    </Chip>
  );`;
const CHIP_BROKEN = `  return (
    <Button
      type='button'
      variant='underline'
      size='xs'
      onClick={() => onGo(refString)}
      title={\`go to \${refString}\`}
    >
      → {refString}
    </Button>
  );`;

const FILER_FIX = `        <Button
          type='button'
          variant='underline'
          size='xs'
          className='ml-auto shrink-0'
          onClick={() => onFile(finding)}
        >
          file as issue
        </Button>`;
const FILER_BROKEN = `        <Chip nonForm dashed className='ml-auto shrink-0' onClick={() => onFile(finding)}>
          file as issue
        </Chip>`;

const ERROR_FIX = `        <CalloutBox tone='error'>
          <Text size='micro'>
            the construction audit could not be run — this is not a clean card, it is a report that
            did not arrive.
          </Text>
        </CalloutBox>`;
const ERROR_BROKEN = `        <Text size='micro' variant='label' tracking='label' className='uppercase'>
          no findings — every check this run ran came back clean
        </Text>`;

const GATE_FIX = `    enabled: !!techCardId && active,`;
const GATE_BROKEN = `    enabled: !!techCardId,`;

const INSERT_FIX = `  const insertAfter = category === 'missing_step' ? (finding.insertAfter ?? '').trim() : '';`;
const INSERT_BROKEN = `  const insertAfter = (finding.insertAfter ?? '').trim();`;

const patcher = (name, filter, pairs, loader) => ({
  name,
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [fixed, broken] of pairs) {
        if (!src.includes(fixed))
          throw new Error(`mutation ${name} did not find its anchor in ${args.path}`);
        src = src.replace(fixed, broken);
      }
      return { contents: src, loader };
    });
  },
});

const mutations = () => {
  const out = [];
  if (on('--mutate-mute-detail'))
    out.push(patcher('mute-detail', AUDIT, [[DETAIL_FIX, DETAIL_BROKEN]], 'tsx'));
  if (on('--mutate-notchecked-collapsed'))
    out.push(patcher('notchecked-collapsed', AUDIT, [[NOTCHECKED_FIX, NOTCHECKED_COLLAPSED]], 'tsx'));
  if (on('--mutate-notchecked-gone'))
    out.push(patcher('notchecked-gone', AUDIT, [[NOTCHECKED_FIX, NOTCHECKED_GONE]], 'tsx'));
  if (on('--mutate-known-severity-only'))
    out.push(patcher('known-severity-only', AUDIT, [[ORDERED_FIX, ORDERED_BROKEN]], 'tsx'));
  if (on('--mutate-piece-tab')) out.push(patcher('piece-tab', AUDIT, [[PIECE_FIX, PIECE_BROKEN]], 'tsx'));
  if (on('--mutate-card-anchored'))
    out.push(patcher('card-anchored', AUDIT, [[CARD_FIX, CARD_BROKEN]], 'tsx'));
  if (on('--mutate-file-navigates'))
    out.push(patcher('file-navigates', AUDIT, [[FILE_WRITE_FIX, FILE_WRITE_NAVIGATES]], 'tsx'));
  if (on('--mutate-file-silent'))
    out.push(patcher('file-silent', AUDIT, [[FILE_WRITE_FIX, FILE_WRITE_SILENT]], 'tsx'));
  if (on('--mutate-chip-as-button'))
    out.push(patcher('chip-as-button', AUDIT, [[CHIP_FIX, CHIP_BROKEN]], 'tsx'));
  if (on('--mutate-file-as-chip'))
    out.push(patcher('file-as-chip', AUDIT, [[FILER_FIX, FILER_BROKEN]], 'tsx'));
  if (on('--mutate-error-as-empty'))
    out.push(patcher('error-as-empty', AUDIT, [[ERROR_FIX, ERROR_BROKEN]], 'tsx'));
  if (on('--mutate-insert-after-ungated'))
    out.push(patcher('insert-after-ungated', AUDIT, [[INSERT_FIX, INSERT_BROKEN]], 'tsx'));
  if (on('--mutate-gate-off')) out.push(patcher('gate-off', QUERY, [[GATE_FIX, GATE_BROKEN]], 'ts'));
  return out;
};

// ─── THE STUBBED NETWORK LAYER ─────────────────────────────────────────────────────────────────
// BY PATH SUFFIX, because `api/api` is reached both as an alias and (from generated code) as a
// relative import, and a relative import cannot be aliased. The marker string below is what the
// bundle is grepped for afterwards: without that grep, forgetting `plugins:` here would leave the
// real client in the bundle and every measurement would be taken against an error screen.
const STUB_MARKER = 'PROBE_STUB_CONSTRUCTION_AUDIT_NETWORK_LAYER';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const STUB_SOURCE = `
// ${STUB_MARKER}
const call = (method) => (req) => {
  (globalThis.__auditNetCalls || (globalThis.__auditNetCalls = [])).push(method);
  if (method === 'GetTechCardConstructionAudit') {
    const stub = globalThis.__auditStub || { mode: 'ok', response: {} };
    if (stub.mode === 'error') return Promise.reject(new Error('${STUB_MARKER}: refused'));
    if (stub.mode === 'hang') return new Promise(() => {});
    return Promise.resolve(stub.response || {});
  }
  return Promise.reject(new Error('${STUB_MARKER}: no such call ' + method + ' ' + JSON.stringify(req)));
};
const service = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? call(k) : undefined) });
export const adminService = service;
export const authService = service;
export const frontendService = service;
export const requestHandler = () => Promise.reject(new Error('${STUB_MARKER}'));
`;
const stub = {
  name: 'stub-network-layer',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({
      path: 'probe-stub-api',
      namespace: 'probe-stub',
    }));
    b.onLoad({ filter: /.*/, namespace: 'probe-stub' }, () => ({
      contents: STUB_SOURCE,
      loader: 'js',
    }));
  },
};

// ─── PLAYWRIGHT ────────────────────────────────────────────────────────────────────────────────
function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    /* fall through to the npx cache */
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
const pwPath = resolvePlaywright();
if (!pwPath) dieNotRun('playwright not found — there is no live stand, and nothing to prove with');
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) dieNotRun('playwright found, but without chromium');

// ─── BUILD ─────────────────────────────────────────────────────────────────────────────────────
const outfile = resolve(SCRATCH, `construction-audit-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'construction-audit-probe-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  // WITHOUT THIS NEITHER `ui/…`/`components/…` NOR REACT ITSELF RESOLVE.
  nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')],
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  alias: { '@': resolve(REPO, 'src') },
  // THE STUB IS ACTUALLY PASSED. Declaring it and forgetting this line is the documented trap.
  plugins: [stub, ...mutations()],
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
});
const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
if (!bundle.includes(STUB_MARKER))
  dieNotRun(`the built bundle carries no «${STUB_MARKER}» — the network layer was NOT stubbed`);
if (bundle.includes(REAL_API_MARKER))
  dieNotRun(`the built bundle still carries «${REAL_API_MARKER}» — the real api layer is in it`);

// THE BUILT ADMIN CSS. Without it no tailwind class exists and every measurement below is a
// measurement of bare html.
const cssName = readdirSync(resolve(REPO, 'dist/assets')).find(
  (f) => /^index-.*\.css$/.test(f),
);
if (!cssName) dieNotRun('dist/assets/index-*.css is missing — run `yarn build` first');
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

// ─── FIXTURE ───────────────────────────────────────────────────────────────────────────────────
const FINDINGS = [
  {
    source: 'machine',
    category: 'missing_step',
    severity: 'blocker',
    title: 'the side panel is never closed',
    detail: 'SL_INS_L is joined at the shoulder and no later step closes it at the side seam.',
    evidence: ['op:440 joins SL_INS_L at the shoulder', 'no step after 440 names SL_INS_L'],
    refs: ['op:460', 'piece:SL_INS_L'],
    insertAfter: 'op:120',
    suggestion: 'add an overlock step after op:460',
    confidence: '',
  },
  {
    source: 'machine',
    category: 'bom_mismatch',
    severity: 'error',
    title: 'a lining named in a step is not on the bom',
    detail: 'step 480 consumes подкладка, which no bom row provides.',
    evidence: ['op:480 → bom key «подкладка»'],
    refs: ['bom:подкладка', 'card'],
    insertAfter: '',
    suggestion: 'add the lining row to the bom, or drop it from the step',
    confidence: 'heuristic',
  },
  {
    source: 'machine',
    category: 'sequence',
    severity: 'warning',
    title: 'the base unit is assembled twice',
    detail: 'two steps declare unit base as their output.',
    evidence: ['op:200 outputs base', 'op:520 outputs base'],
    refs: ['unit:base'],
    // insert_after is meaningful on ONE category. On this one it must NOT reach the screen.
    insertAfter: 'op:999',
    suggestion: 'name the second output something else',
    confidence: 'likely',
  },
  {
    // A SEVERITY AND A CATEGORY THIS BUNDLE HAS NEVER HEARD OF. Both must reach the screen, and the
    // severity must be counted in the headline — an unknown value silently dropped is exactly the
    // failure protojson enums were avoided for.
    source: 'machine',
    category: 'thermodynamics',
    severity: 'catastrophe',
    title: 'the press would melt the shell',
    detail: 'the shell is 100% polyamide and step 610 presses it at 200°C.',
    evidence: ['op:610 presses at 200°C'],
    refs: ['mystery:7'],
    insertAfter: '',
    suggestion: 'drop the press temperature to 110°C',
    confidence: 'needs_owner',
  },
];
const NOT_CHECKED = [
  'seam allowances — no pattern is attached to this card',
  'thread consumption — the bom carries no thread rows',
  'the model layer did not run on this card',
];
const OK = { mode: 'ok', response: { findings: FINDINGS, notChecked: NOT_CHECKED, aiEnabled: false } };
const EMPTY = { mode: 'ok', response: { findings: [], notChecked: NOT_CHECKED, aiEnabled: false } };
const BROKEN = { mode: 'error' };

// ─── BROWSER ───────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 2000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
// EVERYTHING ELSE IS CUT OFF. If the stub ever failed to take, the request would not quietly 404 —
// it would abort, the query would error, and the measurements below would go red rather than pass
// against an error screen.
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url === 'http://probe.local/')
    return route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><meta charset="utf-8"><style>${CSS}</style><body class="bg-pageBg"><div id="root"></div>`,
    });
  if (url.startsWith('http://probe.local/')) return route.fulfill({ status: 200, body: '' });
  return route.abort();
});

let clicks = 0;
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

// `techCardId: null` = the UNSAVED card. Not `undefined`: a js default parameter swallows that and
// the case would silently run on id 42 — which is exactly how this probe first reported a red.
async function mount({ stub: s, techCardId = 42, active = true, frozen = false, noGoTab = false }) {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(
    ([st, o]) => {
      window.__auditStub = st;
      window.__audit.mount(o);
    },
    [s, { techCardId: techCardId ?? undefined, active, frozen, noGoTab }],
  );
  await page.waitForSelector('[data-probe-panel]', { timeout: 15000 });
  await page.waitForTimeout(350);
  await inject();
}

const panelText = () =>
  page.evaluate(() => norm2(document.querySelector('[data-probe-panel]')?.innerText || ''));

// Helpers injected into the page once per mount (innerText is read AFTER text-transform, so every
// comparison here is lowercased).
const INJECT = `
window.norm2 = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
window.leaves = (root) => [...(root || document).querySelectorAll('span,button,a,p,div,summary')]
  .filter((n) => n.children.length === 0);
window.findLeaf = (want) => {
  const root = document.querySelector('[data-probe-panel]');
  if (!root) return [];
  return window.leaves(root).filter((n) => window.norm2(n.textContent).replace(/^→\\s*/, '') === want);
};
`;
const inject = () => page.evaluate(INJECT);

/** One anchor, by its label: is it there, is it a control, does it carry a live handler. */
const anchor = (label) =>
  page.evaluate((lab) => {
    document.querySelectorAll('[data-probe-hit]').forEach((n) => n.removeAttribute('data-probe-hit'));
    const hits = window.findLeaf(lab);
    if (hits.length !== 1) return { n: hits.length };
    const el = hits[0];
    el.setAttribute('data-probe-hit', '');
    const r = el.getBoundingClientRect();
    return {
      n: 1,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      tabindex: el.getAttribute('tabindex'),
      // A native control under a disabled fieldset matches :disabled however its own props read.
      disabled: el.matches(':disabled'),
      cursor: getComputedStyle(el).cursor,
      visible: r.width > 0 && r.height > 0,
    };
  }, label);

const clickHit = async () => {
  clicks++;
  await page.locator('[data-probe-hit]').click({ force: true });
  await page.waitForTimeout(120);
};

const gone = () => page.evaluate(() => window.__audit.gone());
const issues = () => page.evaluate(() => window.__audit.issues());
const alerts = () => page.evaluate(() => window.__audit.alerts());
const netCalls = () => page.evaluate(() => window.__auditNetCalls || []);

console.log(
  `construction-audit probe — real component, built admin CSS, stubbed network layer` +
    (MUTATIONS_ON.length ? `\nMUTATIONS: ${MUTATIONS_ON.join(' ')}` : '\nMUTATIONS: none (baseline)'),
);

// ═══ CASE A: a run with findings ═══════════════════════════════════════════════════════════════
await mount({ stub: OK });
await inject();

// PRECONDITION: the stand is actually a stand. Without the built CSS every geometry check below is
// a check of bare html, and without the stub every text check is a check of an error screen.
head('0. the stand itself');
const pre = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const up = window
    .leaves(document.querySelector('[data-probe-panel]'))
    .some((n) => getComputedStyle(n).textTransform === 'uppercase' && n.textContent.trim());
  return { errorToken: cs.getPropertyValue('--color-error').trim(), uppercase: up };
});
if (!pre.errorToken || !pre.uppercase)
  dieNotRun(
    `the built admin CSS is not live (--color-error=«${pre.errorToken}», uppercase=${pre.uppercase})`,
  );
ck(true, 'built admin css is live', `--color-error=${pre.errorToken}`);
const calls = await netCalls();
ck(
  calls.length === 1 && calls[0] === 'GetTechCardConstructionAudit',
  'exactly one call left the component, and it was the audit',
  JSON.stringify(calls),
);
ck(pageErrors.length === 0, 'no page errors', pageErrors.join(' | '));

// ═══ 1. every finding reaches the screen ═══════════════════════════════════════════════════════
head('1. every finding reaches the screen — title, detail, suggestion, evidence');
const textA = await panelText();
for (const f of FINDINGS) {
  const miss = [];
  if (!textA.includes(norm(f.title))) miss.push('title');
  if (!textA.includes(norm(f.detail))) miss.push('detail');
  if (!textA.includes(norm(f.suggestion))) miss.push('suggestion');
  for (const e of f.evidence) if (!textA.includes(norm(e))) miss.push(`evidence «${e}»`);
  if (!textA.includes(norm(f.severity))) miss.push('severity badge');
  if (!textA.includes(norm(f.category.replace(/_/g, ' ')))) miss.push('category badge');
  ck(miss.length === 0, `«${f.title}» is on screen whole`, miss.join(', '));
}
ck(
  textA.includes('heuristic — may be wrong') && textA.includes('needs_owner'),
  'confidence is badged for the value the bundle knows AND for one it does not',
);

// ═══ 2. not checked, visible, without a click ══════════════════════════════════════════════════
head('2. «not checked this run» is visible WITHOUT any click');
ck(clicks === 0, 'nothing has been clicked yet on this mount', `clicks=${clicks}`);
const nc = await page.evaluate((lines) => {
  const root = document.querySelector('[data-probe-panel]');
  return lines.map((ln) => {
    const want = window.norm2('· ' + ln);
    const hits = window.leaves(root).filter((n) => window.norm2(n.textContent) === want);
    if (!hits.length) return { line: ln, present: false, visible: false };
    const el = hits[0];
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // GEOMETRY ALONE IS A FALSE GREEN HERE, MEASURED: a line inside a CLOSED <details> still
    // reports a full-width 18px box, `display: block`, `visibility: visible` and a live
    // `offsetParent` in current Chrome. Only `checkVisibility()` and `innerText` (which is the
    // RENDERED text, so it is empty for a skipped subtree) tell it from a line a reader can see.
    const cv = el.checkVisibility({
      contentVisibilityAuto: true,
      opacityProperty: true,
      visibilityProperty: true,
    });
    const rendered = window.norm2(el.innerText).length > 0;
    return {
      line: ln,
      present: true,
      visible:
        r.height > 0 && r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cv && rendered,
      h: Math.round(r.height),
      cv,
      rendered,
      collapsed: !!el.closest('details:not([open])'),
    };
  });
}, NOT_CHECKED);
for (const r of nc)
  ck(
    r.present && r.visible,
    `«${r.line.slice(0, 42)}…» is drawn and visible`,
    r.present
      ? `visible=${r.visible} h=${r.h ?? 0} checkVisibility=${r.cv} renderedText=${r.rendered}` +
        (r.collapsed ? ' INSIDE A CLOSED <details>' : '')
      : 'not in the dom at all',
  );
const textNC = await panelText();
ck(
  NOT_CHECKED.every((l) => textNC.includes(norm(l))),
  'every not-checked line is in the panel’s RENDERED text (innerText, not textContent)',
);
ck(textNC.includes('not checked this run'), 'the «not checked this run» heading is on screen');

// ═══ 3. the headline agrees with the list ══════════════════════════════════════════════════════
head('3. the headline count agrees with what is drawn (unknown severity included)');
const lines = await page.evaluate(() =>
  (document.querySelector('[data-probe-panel]')?.innerText || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
);
const headline = lines.map((l) => l.toLowerCase()).find((l) => /^\d+\s+\S+(\s*·\s*\d+\s+\S+)*$/.test(l)) || '';
const parsed = [...headline.matchAll(/(\d+)\s+([^\s·]+)/g)].map(([, n, w]) => [w, Number(n)]);
const sum = parsed.reduce((a, [, n]) => a + n, 0);
const drawn = await page.evaluate(() => window.findLeaf('file as issue').length);
ck(!!headline, 'a headline count line is on screen', headline || '(none found)');
ck(sum === FINDINGS.length, `the headline adds up to ${FINDINGS.length}`, `${headline} → ${sum}`);
ck(drawn === FINDINGS.length, `${FINDINGS.length} findings are actually drawn`, `drawn=${drawn}`);
ck(
  parsed.some(([w, n]) => w.startsWith('catastrophe') && n === 1),
  'the severity this bundle never heard of is COUNTED in the headline',
  headline,
);
ck(
  (await page.evaluate(() => window.findLeaf('catastrophe').length)) === 1,
  'the unknown severity is DRAWN as its own badge',
);
ck(
  (await panelText()).includes('thermodynamics'),
  'the category this bundle never heard of reaches the screen',
);

// ═══ 9. insert_after is gated on its one category ══════════════════════════════════════════════
head('9. insert_after is gated on missing_step, not on being non-empty');
const tA = await panelText();
ck(tA.includes('insert after') && tA.includes('op:120'), 'it is shown on the missing_step finding');
ck(!tA.includes('op:999'), 'it is NOT shown on the sequence finding', 'op:999 leaked onto the screen');

// ═══ 4. anchors ════════════════════════════════════════════════════════════════════════════════
head('4. clicking a ref anchor calls onGoTab with the right (tab, extra)');
const CASES = [
  ['op:460', 'construction', { op: '460' }],
  ['unit:base', 'construction', { unit: 'base' }],
  ['piece:sl_ins_l', 'patterns', undefined],
  ['bom:подкладка', 'bom', undefined],
];
for (const [label, tab, extra] of CASES) {
  const a = await anchor(label);
  if (a.n !== 1) {
    ck(false, `«${label}» is exactly one anchor on screen`, `found ${a.n}`);
    continue;
  }
  const before = (await gone()).length;
  await clickHit();
  const after = await gone();
  const last = after[after.length - 1];
  ck(
    after.length === before + 1 &&
      last[0] === tab &&
      JSON.stringify(last[1] ?? null) === JSON.stringify(extra ?? null),
    `«${label}» → onGoTab(${tab}, ${JSON.stringify(extra ?? null)})`,
    JSON.stringify(last ?? null),
  );
}
{
  const a = await anchor('card');
  ck(a.n === 1, '«card» is on screen', `found ${a.n}`);
  ck(
    a.n === 1 && a.tag === 'span' && a.role !== 'button' && a.tabindex === null,
    '«card» is PLAIN TEXT — no role, no tab stop, no handler',
    JSON.stringify(a),
  );
  const before = (await gone()).length;
  if (a.n === 1) await clickHit();
  ck((await gone()).length === before, 'clicking «card» navigates nowhere');
}
{
  const a = await anchor('mystery:7');
  ck(
    a.n === 1 && a.tag === 'span' && a.role !== 'button',
    'an anchor KIND this bundle never heard of also degrades to plain text',
    JSON.stringify(a),
  );
}

// ═══ 5. file as issue ══════════════════════════════════════════════════════════════════════════
head('5. «file as issue» writes into the form and does NOT navigate');
await mount({ stub: OK });
await inject();
{
  const before = await issues();
  const a = await anchor('file as issue');
  ck(a.n === 1 || a.n > 1, 'the filer is on screen', `found ${a.n}`);
  // The FIRST finding's filer: refs op:460 → operationNumber 460.
  await page.evaluate(() => {
    document.querySelectorAll('[data-probe-hit]').forEach((n) => n.removeAttribute('data-probe-hit'));
    window.findLeaf('file as issue')[0].setAttribute('data-probe-hit', '');
  });
  await clickHit();
  const after = await issues();
  const added = after[after.length - 1];
  ck(after.length === before.length + 1, 'exactly one issue was appended', `${before.length} → ${after.length}`);
  ck(added?.operationNumber === 460, 'operationNumber came from the first op: anchor', String(added?.operationNumber));
  ck(added?.raisedBy === '', 'raisedBy is left empty — the reporter is a human, not a report');
  ck(
    added?.severity === 'TECH_CARD_ISSUE_SEVERITY_MEDIUM' &&
      added?.status === 'TECH_CARD_ISSUE_STATUS_OPEN',
    'severity/status come from the shared defaults',
    `${added?.severity} / ${added?.status}`,
  );
  const d = norm(String(added?.description ?? ''));
  ck(
    d.includes(norm(FINDINGS[0].title)) &&
      d.includes(norm(FINDINGS[0].detail)) &&
      d.includes(norm(FINDINGS[0].suggestion)),
    'the description carries title + detail + suggestion',
  );
  ck((await gone()).length === 0, 'filing did NOT navigate', JSON.stringify(await gone()));
  ck((await alerts()).some((m) => /filed on the issues tab/i.test(m)), 'the operator was told');
}

// ═══ 6. THE LOAD-BEARING ONE: under <fieldset disabled> ════════════════════════════════════════
head('6. inside <fieldset disabled> — the anchor still navigates, the filer is dead');
await mount({ stub: OK, frozen: true });
await inject();
{
  const chip = await anchor('op:460');
  ck(chip.n === 1, 'the anchor is still on screen on a released card', `found ${chip.n}`);
  ck(chip.n === 1 && !chip.disabled, 'the anchor is not a native control, so the fieldset cannot kill it', JSON.stringify(chip));
  const beforeGo = (await gone()).length;
  if (chip.n === 1) await clickHit();
  ck((await gone()).length === beforeGo + 1, 'THE ANCHOR STILL NAVIGATES under a disabled fieldset', JSON.stringify(await gone()));

  const filer = await page.evaluate(() => {
    document.querySelectorAll('[data-probe-hit]').forEach((n) => n.removeAttribute('data-probe-hit'));
    const el = window.findLeaf('file as issue')[0];
    if (!el) return { n: 0 };
    el.setAttribute('data-probe-hit', '');
    return { n: 1, tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', disabled: el.matches(':disabled') };
  });
  ck(filer.n === 1, 'the filer is still on screen', JSON.stringify(filer));
  ck(filer.disabled === true, 'the filer IS a native control and the fieldset disabled it', JSON.stringify(filer));
  const beforeIssues = (await issues()).length;
  if (filer.n === 1) await clickHit();
  ck((await issues()).length === beforeIssues, 'clicking the filer wrote NOTHING', `issues=${(await issues()).length}`);
  ck((await alerts()).length === 0, 'and said nothing');
}

// ═══ 7. the error state and the empty state are different screens ══════════════════════════════
head('7. the error state and the empty state are visibly different');
await mount({ stub: EMPTY });
await inject();
const emptyText = await panelText();
const emptyBox = await page.evaluate(() => {
  const root = document.querySelector('[data-probe-panel]');
  const hits = [...root.querySelectorAll('div')].filter((n) =>
    window.norm2(n.textContent).includes('no findings'),
  );
  const el = hits[hits.length - 1];
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { border: cs.borderTopWidth, color: cs.borderTopColor };
});
const emptyNotChecked = emptyText.includes('not checked this run');

await mount({ stub: BROKEN });
await inject();
const errText = await panelText();
const errBox = await page.evaluate(() => {
  const root = document.querySelector('[data-probe-panel]');
  const hits = [...root.querySelectorAll('div')].filter((n) =>
    window.norm2(n.textContent).includes('could not be run'),
  );
  const el = hits[hits.length - 1];
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { border: cs.borderTopWidth, color: cs.borderTopColor };
});
ck(emptyText.includes('no findings'), 'the empty state says every check came back clean');
ck(emptyNotChecked, 'the empty state STILL lists what was not checked — the only honest content on it');
ck(errText.includes('could not be run'), 'the error state says the report did not arrive');
ck(!errText.includes('no findings'), 'the error state does NOT read as clean', errText.slice(0, 120));
ck(emptyText !== errText, 'the two screens are not the same screen');
ck(
  !!errBox && parseFloat(errBox.border) >= 1,
  'the error state is drawn in a bordered callout',
  JSON.stringify(errBox),
);
ck(
  !!errBox && !!emptyBox && errBox.color !== emptyBox.color,
  'and in a different colour from the empty state',
  `${JSON.stringify(errBox)} vs ${JSON.stringify(emptyBox)}`,
);

// ═══ 8. the gate ═══════════════════════════════════════════════════════════════════════════════
head('8. the query is gated — no id, or the tab not open, and nothing leaves');
await mount({ stub: OK, techCardId: null });
ck((await netCalls()).length === 0, 'an unsaved card makes no request', JSON.stringify(await netCalls()));
ck(
  (await panelText()).includes('the audit reads the saved card'),
  'and says so instead of pretending to load',
);
await mount({ stub: OK, active: false });
ck(
  (await netCalls()).length === 0,
  'the construction tab closed makes no request',
  JSON.stringify(await netCalls()),
);

// ─── VERDICT ───────────────────────────────────────────────────────────────────────────────────
ck(pageErrors.length === 0, 'no page errors over the whole run', pageErrors.join(' | '));
await browser.close();
console.log(
  `\n${bad === 0 ? `GREEN — ${total} checks` : `RED: ${bad} of ${total} checks failed`}` +
    (MUTATIONS_ON.length ? `   [mutations: ${MUTATIONS_ON.join(' ')}]` : ''),
);
process.exit(bad === 0 ? 0 : 1);
