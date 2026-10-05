#!/usr/bin/env node
// E3 · РОЛИ КАРТИНОК ДОСКИ (64-DEFERRED). НАСТОЯЩИЙ `MoodBoard` в chromium над заглушенной сетью и
// собранным CSS (`dist/assets/*.css`, нужен `yarn build`). Проверки:
//   · у плитки нет новой кнопки: роль ставится из угла-меню `role ▾` (`data-menu="role:<id>"`);
//   · выбор пишет `role` в строку доски, ярлык показывает `N · <role>`; без роли ярлык — номер;
//   · `none` снимает роль; круг форма → proto → форма роль не теряет.
//
//   node scripts/mood-roles-probe.mjs                  → зелёный
//   node scripts/mood-roles-probe.mjs --mutate=nobadge → роль не в ярлыке: КРАСНЫЙ
//   node scripts/mood-roles-probe.mjs --mutate=noout   → маппер сохранения теряет роль: КРАСНЫЙ
//   SHOT=<path.png> — снимок доски с открытым меню; SHOT2=<path.png> — после выбора.
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
  nobadge: [
    {
      file: /design\/mood-board\.tsx$/,
      from: 'tileBadge={(view) => roleOf.get(view.mediaId) || null}',
      to: 'tileBadge={() => null}',
    },
  ],
  noout: [
    {
      file: /components\/schema\.ts$/,
      from: "    caption: m.caption?.trim() || '',\n    role: m.role || '',",
      to: "    caption: m.caption?.trim() || '',",
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
          window.__calls.push(String(name));
          const f = (window.__api || {})[String(name)];
          try { return Promise.resolve(f ? f(body) : {}); } catch (e) { return Promise.reject(e); }
        } });
        export const requestHandler = () => Promise.resolve({});
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: root,
    }));
  },
};
const out = resolve(tmpdir(), `mood-roles-${process.pid}.js`);
await build({
  entryPoints: [resolve(root, 'scripts/mood-roles-entry.tsx')],
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
      const c = { 101: '#c9c2b8', 102: '#8a8f96', 103: '#4b4a48' }[m[1]] ?? '#999';
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
  await page.waitForSelector('[data-menu="role:101"]', { timeout: 15000 }).catch(async (e) => {
    console.log('DID NOT RUN: the role menu did not mount', errors.join(' | ').slice(0, 600));
    console.log((await page.evaluate(() => document.body.innerText)).slice(0, 600));
    throw e;
  });

  const badges = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-rail-view]')].map((t) => ({
        id: t.getAttribute('data-rail-view'),
        badge: t.querySelector('[data-tile-badge]')?.textContent?.trim() ?? '',
        menu: t.querySelector('[data-menu^="role:"]')?.textContent?.trim() ?? '',
      })),
    );
  const roles = () =>
    page.evaluate(() => window.__form().moodboardMedia.map((i) => `${i.mediaId}:${i.role ?? ''}`));

  console.log('\nE3 · покой');
  const b0 = await badges();
  ck(b0.length === 3, 'three tiles on the board', JSON.stringify(b0));
  ck(
    b0[0]?.badge === '1' && b0[2]?.badge === '3',
    'unset role: the badge is the number alone',
    JSON.stringify(b0),
  );
  ck(b0[1]?.badge === '2 · detail', 'set role: the badge reads «2 · detail»', b0[1]?.badge);
  ck(
    b0[0]?.menu === 'role ▾' && b0[1]?.menu === 'detail ▾',
    'the menu corner word: role ▾ / detail ▾',
    JSON.stringify(b0.map((b) => b.menu)),
  );
  const extra = await page.evaluate(() =>
    [...document.querySelectorAll('[data-rail-view="101"] button')].map((b) =>
      b.textContent?.trim(),
    ),
  );
  ck(
    extra.every((t) => ['✕', 'crop', 'edit', 'role ▾'].includes(t ?? '')),
    'no new button on the tile besides the corner menu',
    JSON.stringify(extra),
  );
  const quiet = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-menu="role:101"]')).opacity,
  );
  ck(quiet === '0', 'the menu corner is quiet at rest (TILE_QUIET)', quiet);

  console.log('\nE3 · выбор');
  await page.hover('[data-rail-view="101"]');
  await page.click('[data-menu="role:101"]');
  await page.waitForSelector('[role="listbox"] [data-menu-item="target"]', { timeout: 5000 });
  const items = await page.evaluate(() =>
    [...document.querySelectorAll('[role="listbox"] [data-menu-item]')].map((n) =>
      n.textContent?.trim(),
    ),
  );
  ck(
    JSON.stringify(items) === JSON.stringify(['target', 'detail', 'material', 'mood']),
    'unset tile offers exactly target · detail · material · mood',
    JSON.stringify(items),
  );
  if (process.env.SHOT) {
    await page.screenshot({
      path: process.env.SHOT,
      clip: { x: 0, y: 0, width: 1200, height: 620 },
    });
    console.log(`shot: ${process.env.SHOT}`);
  }
  await page.click('[role="listbox"] [data-menu-item="target"]');
  await page.waitForTimeout(150);
  const b1 = await badges();
  ck(b1[0]?.badge === '1 · target', 'after the pick the badge reads «1 · target»', b1[0]?.badge);
  const r1 = await roles();
  ck(
    JSON.stringify(r1) === JSON.stringify(['101:target', '102:detail', '103:']),
    'the form row carries role=target',
    JSON.stringify(r1),
  );

  await page.hover('[data-rail-view="102"]');
  await page.click('[data-menu="role:102"]');
  await page.waitForSelector('[role="listbox"] [data-menu-item=""]', { timeout: 5000 });
  const cur = await page.evaluate(() =>
    document.querySelector('[role="listbox"] [data-current]')?.getAttribute('data-menu-item'),
  );
  ck(cur === 'detail', 'the set role is the current item', String(cur));
  await page.click('[role="listbox"] [data-menu-item=""]');
  await page.waitForTimeout(150);
  const b2 = await badges();
  ck(
    b2[1]?.badge === '2' && b2[1]?.menu === 'role ▾',
    '«none» clears it: the badge is the number again',
    JSON.stringify(b2[1]),
  );
  await page.hover('[data-rail-view="103"]');
  await page.click('[data-menu="role:103"]');
  await page.click('[role="listbox"] [data-menu-item="material"]');
  await page.waitForTimeout(150);
  await page.mouse.move(5, 5);

  console.log('\nE3 · маппер');
  const rt = await page.evaluate(() => window.__roundTrip());
  ck(
    JSON.stringify(rt.sent.map((i) => i.role)) === JSON.stringify(['target', '', 'material']),
    'save mapper sends role on every moodboard row',
    JSON.stringify(rt.sent),
  );
  ck(
    JSON.stringify(rt.back.map((i) => i.role)) === JSON.stringify(['target', '', 'material']),
    'load mapper reads it back (form → proto → form)',
    JSON.stringify(rt.back),
  );
  ck(errors.length === 0, 'no page errors', errors.join(' | ').slice(0, 300));
  if (process.env.SHOT2) {
    await page.screenshot({
      path: process.env.SHOT2,
      clip: { x: 0, y: 0, width: 1200, height: 620 },
    });
    console.log(`shot: ${process.env.SHOT2}`);
  }
} finally {
  await browser.close();
}

console.log(`\n${total - bad} / ${total}, failures ${bad}${MUTATE ? ` (mutation ${MUTATE})` : ''}`);
process.exit(bad ? 1 : 0);
