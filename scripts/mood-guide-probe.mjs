#!/usr/bin/env node
// ONBOARDING S5 · THE GUIDED FACE OF THE MOODBOARD STEP — live, in chromium.
// The real `StudioTab` on `?step=mood` over a stubbed network (`scripts/mood-guide-entry.tsx`; the
// harness is `mood-describe-probe.mjs`'s). One card mounted per case:
//   1 · guided, nothing yet      → the board alone: DESCRIPTION, callouts, the four lower blocks and
//                                  the footer hidden; the first tile says what goes there; ASK ME dead
//   2 · guided, answers          → the quiz row reads `next ✦` + `ask more ✦`; no `apply to …`
//   3 · guided, a description    → DESCRIPTION shows, its door reads `next ✦`; blocks still hidden
//   4 · LEGACY (guided=false)    → the step exactly as before: every block, GENERATE, the footer —
//                                  the negative control that old cards never change
//   5 · guided, nothing yet + a door to `bomItems.0.name` → the blocks open (reveal listener)
// Mutation: drop the `BLOCK_ROOTS` reveal in `guide-face.tsx` → case 5 goes red.
//   node scripts/mood-guide-probe.mjs  (needs `yarn build` for dist/assets/*.css)
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(HERE, '..');

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};

const assets = resolve(root, 'dist/assets');
const cssFile = existsSync(assets) ? readdirSync(assets).find((f) => f.endsWith('.css')) : null;
if (!cssFile) {
  console.log('DID NOT RUN: dist/assets/*.css is missing — run `yarn build` first');
  process.exit(2);
}
const css = readFileSync(resolve(assets, cssFile), 'utf8');

function resolvePlaywright() {
  const npx = `${homedir()}/.npm/_npx`;
  if (!existsSync(npx)) return null;
  const found = execFileSync(
    'find',
    [npx, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);
  for (const dir of found) if (existsSync(`${dir}/.local-browsers`)) return `${dir}/index.js`;
  return found[0] ? `${found[0]}/index.js` : null;
}
const pwPath = resolvePlaywright();
const pw = pwPath ? await import(pwPath) : null;
const chromium = pw?.chromium ?? pw?.default?.chromium;
if (!chromium) {
  console.log('DID NOT RUN: playwright not found');
  process.exit(2);
}

const stubNetwork = {
  name: 'stub-network',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub:api', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `
        const nope = () => Promise.resolve({});
        window.__calls = [];
        export const adminService = new Proxy({}, { get: (_, name) => (body) => {
          window.__calls.push(String(name));
          const f = (window.__api || {})[String(name)];
          try { return Promise.resolve(f ? f(body) : {}); } catch (e) { return Promise.reject(e); }
        } });
        export const requestHandler = () => Promise.resolve({});
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        // M17 pulled the playground registry into the board: its Ideas read the abortable service.
        export const abortableAdminService = adminService;
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: root,
    }));
  },
};
const out = resolve(tmpdir(), `mood-guide-${process.pid}.js`);
await build({
  entryPoints: [resolve(root, 'scripts/mood-guide-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile: out,
  logLevel: 'error',
  absWorkingDir: root,
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  plugins: [stubNetwork],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
  banner: { js: 'var __STUB_ENV__ = {};' },
  alias: Object.fromEntries(
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
      'styles',
    ].map((a) => [a, resolve(root, 'src', a)]),
  ),
});
const bundle = readFileSync(out, 'utf8');
rmSync(out, { force: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://probe.local/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });

  /** Mount one case and wait for the step and the quiz row to settle. */
  const mount = async (c) => {
    await page.evaluate((c) => window.__st.mount(c), c);
    await page
      .waitForSelector(`[data-probe-case="${c.card}"] [data-step-screen="mood"] [data-c19-draft]`, {
        state: 'attached',
        timeout: 15000,
      })
      .catch(async (e) => {
        console.log('DID NOT RUN: the step did not mount', errors.join(' | ').slice(0, 600));
        console.log((await page.evaluate(() => document.body.innerText)).slice(0, 600));
        throw e;
      });
    // the saved answers are read (the row stops saying «reading the saved answers»)
    await page
      .waitForFunction(() => !document.body.innerText.includes('reading the saved answers'), null, {
        timeout: 8000,
      })
      .catch(() => {});
    await page.waitForTimeout(150);
  };
  const look = () =>
    page.evaluate(() => {
      const seen = (sel) => {
        const el = document.querySelector(sel);
        return !!el && el.checkVisibility();
      };
      const buttons = (scope) =>
        [...document.querySelectorAll(`${scope} button`)]
          .filter((b) => b.checkVisibility())
          .map((b) => b.textContent?.replace(/\s+/g, ' ').trim());
      const blocks = document.querySelector('[data-guide-blocks]');
      const text = document.body.innerText;
      return {
        draft: seen('[data-c19-draft]'),
        concept: seen('[data-field="concept"]'),
        callouts: seen('[data-mb-callouts]'),
        blocksHidden: !!blocks && blocks.hidden,
        blocksSeen: !!blocks && [...blocks.children].some((c) => c.checkVisibility()),
        slots: /material slots/i.test(text),
        footer: seen('[data-step-footer="mood"]'),
        firstTile: text.includes('upload your moodboard here — pictures, sketches, references'),
        oldTile: text.includes('nothing on the board yet'),
        askMe: (() => {
          const b = [...document.querySelectorAll('#mb-board button')].find(
            (x) => x.textContent?.trim() === 'ASK ME',
          );
          return b ? { disabled: b.disabled, why: b.closest('[data-inert]')?.dataset.inert } : null;
        })(),
        board: [...document.querySelectorAll('#mb-board button')]
          .filter((b) => b.checkVisibility())
          .map((b) => b.textContent?.replace(/\s+/g, ' ').trim()),
        draftButtons: buttons('[data-c19-draft]'),
        askMore: seen('[data-quiz-ask-more]'),
        apply: text.includes('apply to description'),
        // every visible black primary on the step (Button variant='main' paints bg-textColor)
        primaries: [...document.querySelectorAll('[data-step-screen="mood"] button')]
          .filter(
            (b) => b.checkVisibility() && getComputedStyle(b).backgroundColor === 'rgb(0, 0, 0)',
          )
          .map((b) => b.textContent?.replace(/\s+/g, ' ').trim()),
        nextRight: (() => {
          const row = document.querySelector('[data-c19-draft-next]');
          const btn = [...(row?.querySelectorAll('button') ?? [])].find(
            (b) => b.textContent?.trim() === 'next ✦',
          );
          const sec = document.querySelector('[data-c19-draft]')?.closest('section') ?? row;
          if (!row || !btn || !sec) return null;
          const br = btn.getBoundingClientRect();
          const rr = row.getBoundingClientRect();
          const inspect = row.querySelector('[data-c19-draft-inspect]')?.getBoundingClientRect();
          return {
            gapRight: Math.round(rr.right - br.right),
            inspectLeft: !!inspect && inspect.right < br.left,
            last: [...row.querySelectorAll('button')].pop() === btn,
          };
        })(),
        askMeQuiet: !!document.querySelector('[data-quiz-quiet]'),
      };
    });

  console.log('\n1 · guided card, nothing yet — the board alone');
  await mount({ card: 11, guided: true });
  let v = await look();
  ck(!v.draft && !v.concept, 'DESCRIPTION hidden', JSON.stringify({ d: v.draft, c: v.concept }));
  ck(v.blocksHidden && !v.blocksSeen && !v.slots, 'GENERAL INFORMATION … COLOURWAYS hidden');
  ck(!v.callouts, 'callouts panel hidden');
  ck(!v.footer, 'no `go to flats ›` footer yet');
  ck(v.firstTile && !v.oldTile, 'the first tile: «upload your moodboard here — …»');
  ck(
    !!v.askMe?.disabled && v.askMe?.why === 'put a picture on the moodboard',
    'ASK ME stands dead with its reason until a picture is on the board',
    JSON.stringify(v.askMe),
  );

  console.log('\n2 · guided card, a picture and answers — the batch-end pair');
  await mount({ card: 12, guided: true, pictures: 1, answers: 2 });
  v = await look();
  ck(
    v.board.some((t) => /^next ✦$/i.test(t ?? '')) && v.askMore,
    '`next ✦` + `ask more ✦` in the quiz row',
    JSON.stringify(v.board),
  );
  ck(!v.apply, 'no `apply to description ✦` (one door)');
  ck(!v.draft && v.blocksHidden && !v.footer, 'DESCRIPTION, blocks and footer still hidden');
  ck(v.callouts, 'callouts panel beside the board');

  console.log('\n3 · guided card, a description — DESCRIPTION with `next ✦`');
  await mount({ card: 13, guided: true, pictures: 1, answers: 2, concept: 'a boxy wool coat' });
  v = await look();
  ck(v.draft && v.concept, 'DESCRIPTION shown');
  ck(
    v.draftButtons.some((t) => /^next ✦$/i.test(t ?? '')) &&
      !v.draftButtons.some((t) => /^generate$/i.test(t ?? '')),
    'its door reads `next ✦`, no GENERATE',
    JSON.stringify(v.draftButtons),
  );
  ck(
    !!v.nextRight && v.nextRight.gapRight <= 1 && v.nextRight.last && v.nextRight.inspectLeft,
    '`next ✦` sits bottom right of DESCRIPTION, `what the model gets ▸` to its left',
    JSON.stringify(v.nextRight),
  );
  ck(
    v.askMeQuiet && v.primaries.length === 1 && v.primaries[0] === 'next ✦',
    'ONE black primary on the face (`next ✦`); ASK ME steps down',
    JSON.stringify(v.primaries),
  );
  ck(v.blocksHidden && !v.footer, 'blocks and footer still hidden');

  console.log('\n4 · LEGACY card (guided=false) — negative control, the step as it was');
  await mount({ card: 14, guided: false });
  v = await look();
  ck(v.draft && v.concept, 'DESCRIPTION shown on an empty board');
  ck(!v.blocksHidden && v.blocksSeen && v.slots, 'every lower block shown (MATERIAL SLOTS)');
  ck(v.footer, '`go to flats ›` footer present');
  ck(v.oldTile && !v.firstTile, 'the old first-tile copy');
  ck(
    !v.askMeQuiet && v.nextRight === null,
    'ASK ME row and GENERATE row as before (no quiet row, no guided next row)',
  );
  ck(
    v.draftButtons.some((t) => /^generate$/i.test(t ?? '')),
    'the draft door reads GENERATE',
    JSON.stringify(v.draftButtons),
  );

  console.log('\n5 · guided card + a door to `bomItems.0.name` — the blocks open');
  await mount({ card: 15, guided: true });
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('grbpwr:reveal-field', {
        bubbles: true,
        cancelable: true,
        detail: { path: 'bomItems.0.name' },
      }),
    ),
  );
  await page.waitForTimeout(200);
  v = await look();
  ck(!v.blocksHidden && v.blocksSeen && v.slots, 'MATERIAL SLOTS un-hidden by the reveal');

  const shotDir = process.env.SHOT_DIR;
  if (shotDir) {
    for (const [n, c] of [
      ['empty', { card: 21, guided: true }],
      ['asked', { card: 22, guided: true, pictures: 1, answers: 2 }],
      [
        'described',
        { card: 23, guided: true, pictures: 1, answers: 2, concept: 'a boxy wool coat' },
      ],
    ]) {
      await mount(c);
      await page.screenshot({ path: `${shotDir}/guide-${n}.png`, fullPage: true });
    }
  }
  ck(errors.length === 0, 'no page errors', errors.join(' | ').slice(0, 300));
} finally {
  await browser.close();
}

console.log(`\n${total - bad} / ${total}, failures ${bad}`);
process.exit(bad ? 1 : 0);
