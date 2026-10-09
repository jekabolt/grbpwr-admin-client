#!/usr/bin/env node
// T39 · MOODBOARD DESCRIPTION: `write from the board ✦` (item 39).
// Настоящий `MoodBoard` в chromium над заглушенной сетью (харнесс — `mood-description-probe.mjs`).
//   · пустое описание + картинка на доске → слово стоит;
//   · заглушенный `DraftDesignIdea` (construction:false) → текст лёг в поле, слово ушло;
//   · в поле есть текст → слова нет.
//   node scripts/mood-describe-probe.mjs  (нужен `yarn build` ради dist/assets/*.css)
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
const out = resolve(tmpdir(), `mood-describe-${process.pid}.js`);
await build({
  entryPoints: [resolve(root, 'scripts/mood-describe-entry.tsx')],
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
  await page
    .waitForSelector('[data-field="concept"] textarea', { timeout: 15000 })
    .catch(async (e) => {
      console.log('DID NOT RUN: the board did not mount', errors.join(' | ').slice(0, 600));
      console.log((await page.evaluate(() => document.body.innerText)).slice(0, 600));
      throw e;
    });

  const W = '[data-mb-describe-from-board]';
  const ta = '[data-field="concept"] textarea';
  console.log('\nT39 · write from the board ✦');
  const w0 = await page.evaluate((W) => {
    const b = document.querySelector(W);
    if (!b) return null;
    const s = getComputedStyle(b);
    return { t: b.textContent?.trim(), u: s.textDecorationLine, border: s.borderTopWidth };
  }, W);
  ck(
    !!w0 && w0.t === 'write from the board ✦',
    'shown inside the placeholder: empty description + a picture on the board',
    JSON.stringify(w0),
  );
  ck(
    !!w0 && w0.u.includes('underline') && w0.border === '0px',
    'a quiet underlined word, no frame',
    JSON.stringify(w0),
  );
  const ov = await page.evaluate(
    ([W, ta]) => {
      const o = document.querySelector('[data-mb-describe-placeholder]');
      const t = document.querySelector(ta);
      const b = document.querySelector(W);
      if (!o || !t || !b) return null;
      const os = getComputedStyle(o);
      const ts = getComputedStyle(t);
      const or = o.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      return {
        text: o.textContent?.replace(/\s+/g, ' ').trim(),
        nativePh: t.getAttribute('placeholder'),
        pe: os.pointerEvents,
        linkPe: getComputedStyle(b).pointerEvents,
        sameType:
          os.fontSize === ts.fontSize &&
          os.lineHeight === ts.lineHeight &&
          os.fontFamily === ts.fontFamily,
        sameColor: os.color === getComputedStyle(b).color,
        origin: [
          or.left +
            parseFloat(os.borderLeftWidth) +
            parseFloat(os.paddingLeft) -
            (tr.left + parseFloat(ts.borderLeftWidth) + parseFloat(ts.paddingLeft)),
          or.top +
            parseFloat(os.borderTopWidth) +
            parseFloat(os.paddingTop) -
            (tr.top + parseFloat(ts.borderTopWidth) + parseFloat(ts.paddingTop)),
        ],
      };
    },
    [W, ta],
  );
  ck(
    !!ov && ov.text === 'describe the thing — or write from the board ✦' && !ov.nativePh,
    'placeholder reads «describe the thing — or write from the board ✦», no native placeholder',
    JSON.stringify(ov),
  );
  ck(
    !!ov && ov.pe === 'none' && ov.linkPe === 'auto',
    'overlay lets clicks through, only the link catches them',
  );
  ck(
    !!ov && ov.sameType && ov.sameColor && ov.origin.every((d) => Math.abs(d) < 0.5),
    'same font, size, line height, grey, at the padding origin',
    JSON.stringify(ov),
  );
  await page.mouse.click(
    ...(await page.evaluate((ta) => {
      const r = document.querySelector(ta).getBoundingClientRect();
      return [r.left + r.width - 40, r.top + r.height / 2];
    }, ta)),
  );
  ck(
    await page.evaluate((ta) => document.activeElement === document.querySelector(ta), ta),
    'a click elsewhere in the empty field focuses it',
  );
  const shotDir = process.env.SHOT_DIR;
  if (shotDir) {
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.activeElement?.blur());
    const box = await page.evaluate(() => {
      const r = document.querySelector('[data-field="concept"]').getBoundingClientRect();
      return {
        x: Math.max(0, r.left - 16),
        y: Math.max(0, r.top - 16),
        width: r.width + 32,
        height: r.height + 32,
      };
    });
    await page.screenshot({ path: `${shotDir}/ah-placeholder.png`, clip: box });
    await page.mouse.move(0, 0);
  }
  await page.evaluate(() => {
    window.__api.DraftDesignIdea = (body) => {
      window.__draftBody = body;
      return new Promise((r) =>
        setTimeout(
          () =>
            r({
              run: {
                id: 9,
                kind: 'draft_idea',
                status: 'succeeded',
                outputText: 'a boxy wool coat with a dropped shoulder',
              },
            }),
          300,
        ),
      );
    };
  });
  await page.click(W);
  const pend = await page.evaluate((W) => document.querySelector(W)?.textContent?.trim(), W);
  ck(pend === 'writing…', 'pending state while the run is out', String(pend));
  await page
    .waitForFunction((ta) => document.querySelector(ta)?.value, ta, { timeout: 8000 })
    .catch(() => {});
  const after = await page.evaluate(
    ([W, ta]) => ({
      v: document.querySelector(ta)?.value,
      w: !!document.querySelector(W),
      body: window.__draftBody,
    }),
    [W, ta],
  );
  ck(
    after.v === 'a boxy wool coat with a dropped shoulder',
    'the reply fills the empty field',
    JSON.stringify(after.v),
  );
  ck(
    after.body?.construction === false &&
      after.body?.techCardId === 7 &&
      /^[0-9a-f-]{32,36}$/.test(after.body?.clientRequestId ?? ''),
    'request: construction:false, fresh uuid',
    JSON.stringify(after.body),
  );
  ck(!after.w, 'hidden once the description has text');
  // типед текст не перетирается: поле очищено, ответ «опаздывает», человек успевает написать
  await page.fill(ta, '');
  await page.waitForSelector(W, { timeout: 4000 }).catch(() => {});
  ck(!!(await page.$(W)), 'shown again when the field is emptied');
  await page.click(W);
  await page.fill(ta, 'typed by hand');
  await new Promise((r) => setTimeout(r, 700));
  const kept = await page.evaluate((ta) => document.querySelector(ta)?.value, ta);
  ck(kept === 'typed by hand', 'a late reply never overwrites typed text', JSON.stringify(kept));
  ck(errors.length === 0, 'no page errors', errors.join(' | ').slice(0, 300));
} finally {
  await browser.close();
}

console.log(`\n${total - bad} / ${total}, failures ${bad}`);
process.exit(bad ? 1 : 0);
