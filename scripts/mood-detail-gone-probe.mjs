#!/usr/bin/env node
// 07.10 D3 · Q3: ДЕТАЛЬ МОДЕЛИ УХОДИТ С ПОСЛЕДНИМ ФОТО — И КОГДА ФОТО СНЯЛИ С ДОСКИ. НАСТОЯЩИЙ
// `MoodBoard` (`scripts/mood-detail-gone-entry.tsx`) в chromium над заглушенной сетью и собранным CSS
// (`dist/assets/*.css`, нужен `yarn build`). Проверки:
//   · ярлык ЧЕЛОВЕКА на детали модели: снятие с доски пишет пустой ярлык человека, деталь уходит,
//     кэш полосы без неё (FLAT SLOTS и селектор прогона — без перезагрузки);
//   · ярлык МОДЕЛИ: записи нет; фоновый синк сервера сносит деталь — полоса перечитывается сама;
//   · деталь, названная человеком, остаётся, записи нет.
//
//   node scripts/mood-detail-gone-probe.mjs               → зелёный
//   · (Codex 07.10) сохранение снятия не прошло — ничего не пишется, деталь стоит; запись идёт ПОСЛЕ
//     flush; деталь из двух фото: снятие первого — ничего, снятие второго чистит ярлыки обоих.
//
//   node scripts/mood-detail-gone-probe.mjs --mutate=noq3        → снятие не трогает деталь: КРАСНЫЙ
//   node scripts/mood-detail-gone-probe.mjs --mutate=noflushgate → чистка до сохранения: КРАСНЫЙ
//   node scripts/mood-detail-gone-probe.mjs --mutate=allrefs     → «остальные фото» по всем ярлыкам: КРАСНЫЙ
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUTATE = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(HERE, '..');

const MUTATIONS = {
  noq3: [
    {
      file: /design\/mood-board\.tsx$/,
      from: '    if (slotOfRemoved > 0) void dropModelDetailAfterRemoval(mediaId, slotOfRemoved);\n',
      to: '',
    },
  ],
  // Codex 07.10 #3: the cleanup does not wait for the board save.
  noflushgate: [
    {
      file: /design\/mood-board\.tsx$/,
      from: "    if (saved !== 'ok' && saved !== 'nothing') return;\n",
      to: '',
    },
  ],
  // Codex 07.10 #4: «remaining photos» read from every reference, not the board.
  allrefs: [
    {
      file: /design\/mood-board\.tsx$/,
      from: 'if (pointing.some((r) => board.has(r.mediaId ?? 0) && !isHeldLabel(r))) return;',
      to: 'if (pointing.some((r) => (r.mediaId ?? 0) !== mediaId && !isHeldLabel(r))) return;',
    },
  ],
};
const edits = MUTATE ? MUTATIONS[MUTATE] : [];
if (MUTATE && !edits) {
  console.log(`unknown mutation ${MUTATE}`);
  process.exit(2);
}
const plugins = edits.length
  ? [
      {
        name: 'mutate',
        setup(b) {
          const files = [...new Set(edits.map((e) => e.file.source))];
          for (const file of files)
            b.onLoad({ filter: new RegExp(file) }, async (args) => {
              let src = await readFile(args.path, 'utf8');
              for (const e of edits.filter((x) => x.file.source === file)) {
                if (!src.includes(e.from)) {
                  console.log(`mutation ${MUTATE}: anchor not found in ${args.path}`);
                  process.exit(2);
                }
                src = src.replace(e.from, e.to);
              }
              return { contents: src, loader: args.path.endsWith('.ts') ? 'ts' : 'tsx' };
            });
        },
      },
    ]
  : [];

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
          window.__calls.push(String(name)); (window.__bodies = window.__bodies || []).push({ name: String(name), body });
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
const out = resolve(tmpdir(), `mood-detail-gone-${process.pid}.js`);
await build({
  entryPoints: [resolve(root, 'scripts/mood-detail-gone-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile: out,
  logLevel: 'error',
  absWorkingDir: root,
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  plugins: [stubNetwork, ...plugins],
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
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://probe.local/**', (r) => {
    const m = /\/img\/(\d+)\.svg$/.exec(r.request().url());
    if (m) {
      const c =
        {
          201: '#c9c2b8',
          202: '#8a8f96',
          203: '#4b4a48',
          204: '#b0a89c',
          205: '#6f6a64',
          206: '#9a9590',
        }[m[1]] ?? '#999';
      return r.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="${c}"/><rect x="170" y="140" width="260" height="480" fill="#f4f2ee" opacity=".55"/></svg>`,
      });
    }
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
  });
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[data-rail-view="203"]', { timeout: 15000 }).catch(async (e) => {
    console.log('DID NOT RUN: the board did not mount', errors.join(' | ').slice(0, 600));
    throw e;
  });
  await page.waitForFunction(() => Array.isArray(window.__cachedBench()), null, { timeout: 5000 });

  const roleWrites = () =>
    page.evaluate(() =>
      (window.__bodies ?? []).filter((c) => c.name === 'SetDesignReferenceRole').map((c) => c.body),
    );
  const takeOff = async (id) => {
    await page.hover(`[data-rail-view="${id}"]`);
    await page.click(`[data-rail-view="${id}"] [aria-label^="take moodboard picture"]`);
    await page.click('button:has-text("take it off")');
    await page.mouse.move(5, 5);
  };
  const benchWithin = async (ms, pred) => {
    const until = Date.now() + ms;
    let b = await page.evaluate(() => window.__cachedBench());
    while (!pred(b) && Date.now() < until) {
      await page.waitForTimeout(200);
      b = await page.evaluate(() => window.__cachedBench());
    }
    return b;
  };

  const log = () => page.evaluate(() => (window.__bodies ?? []).map((c) => c.name));
  const writesSince = async (k) => (await roleWrites()).slice(k);

  console.log('\nCodex #3 · the removal did not save: nothing is touched');
  ck(
    JSON.stringify(await page.evaluate(() => window.__cachedBench())) === '[77,78,79,80,81]',
    'five details to begin with',
  );
  await page.evaluate(() => (window.__flushAnswer = 'error'));
  await takeOff(206);
  await page.waitForTimeout(2500);
  ck(
    (await roleWrites()).length === 0 &&
      (await page.evaluate(() => window.__cachedBench()))?.includes(81),
    'save failed: no label is cleared, «pocket» stays',
    JSON.stringify({ w: await roleWrites(), b: await page.evaluate(() => window.__cachedBench()) }),
  );
  await page.evaluate(() => (window.__flushAnswer = 'ok'));

  console.log('\nQ3 · a person’s label on a model’s detail');
  const k1 = (await roleWrites()).length;
  await takeOff(201);
  await page.waitForTimeout(600);
  const w1 = await writesSince(k1);
  const order1 = await log();
  ck(
    w1.length === 1 &&
      w1[0].mediaId === 201 &&
      w1[0].role === '' &&
      order1.lastIndexOf('flush') < order1.lastIndexOf('SetDesignReferenceRole'),
    'its last photo off the board: saved first, then the person’s empty label',
    JSON.stringify({ w1, order: order1.slice(-6) }),
  );
  const b1 = await benchWithin(4000, (b) => !b?.includes(77));
  ck(!b1?.includes(77), '«back hem» is gone from the band, no reload', JSON.stringify(b1));

  console.log('\nCodex #4 · a two-photo detail, both with a person’s label');
  const k2 = (await roleWrites()).length;
  await takeOff(204);
  await page.waitForTimeout(1500);
  ck(
    (await writesSince(k2)).length === 0 &&
      (await page.evaluate(() => window.__cachedBench()))?.includes(80),
    'the first photo off: 205 is still on the board — nothing is cleared',
    JSON.stringify(await writesSince(k2)),
  );
  await takeOff(205);
  await page.waitForTimeout(800);
  const w2 = (await writesSince(k2)).map((w) => `${w.mediaId}:${w.role}`).sort();
  ck(
    JSON.stringify(w2) === '["204:","205:"]',
    'the last photo off: both off-board person labels are cleared',
    JSON.stringify(w2),
  );
  const b2a = await benchWithin(4000, (b) => !b?.includes(80));
  ck(!b2a?.includes(80), '«strap» is gone', JSON.stringify(b2a));

  console.log('\nQ3 · a model’s label on a model’s detail');
  const k3 = (await roleWrites()).length;
  await takeOff(202);
  await page.waitForTimeout(600);
  ck((await writesSince(k3)).length === 0, 'no write: the server’s sync drops a model’s row');
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__sync([203]));
  const b2 = await benchWithin(5000, (b) => !b?.includes(78));
  ck(
    !b2?.includes(78),
    '«cuff» is gone once the sync lands: the band is re-read',
    JSON.stringify(b2),
  );

  console.log('\nQ3 · a person’s detail stays');
  const k4 = (await roleWrites()).length;
  await takeOff(203);
  await page.waitForTimeout(2500);
  ck(
    (await writesSince(k4)).length === 0 &&
      (await page.evaluate(() => window.__cachedBench()))?.includes(79),
    '«collar» (named by a person) stays; nothing is written',
    JSON.stringify(await page.evaluate(() => window.__cachedBench())),
  );
  ck(errors.length === 0, 'no page errors', errors.join(' | ').slice(0, 300));
} finally {
  await browser.close();
}

console.log(`\n${total - bad} / ${total}, failures ${bad}${MUTATE ? ` (mutation ${MUTATE})` : ''}`);
process.exit(bad ? 1 : 0);
