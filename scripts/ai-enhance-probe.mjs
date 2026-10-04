#!/usr/bin/env node
// item 41 · `ai ✦` НА КАЖДОМ СВОБОДНОМ ТЕКСТЕ ТЕХКАРТЫ, ПОДЧЁРКНУТЫМ СЛОВОМ. Владелец 04.10:
// «в CONSTRUCTION в тексбоксе на актив нет ai кнопки и сделай ai кнопку без обводки просто с
// подчеркиванием», затем «везде не только в CONSTRUCTION».
//
// НАСТОЯЩИЕ `DetailsEditor` (аспекты CONSTRUCTION) и `TextareaField enhance` (заметки) в chromium
// над собранным CSS (`dist/assets/*.css`, нужен `yarn build`). Проверки: в покое кнопки нет; фокус в
// поле с текстом — `ai ✦` стоит в углу ЭТОГО поля; вычисленный стиль — подчёркивание, рамки нет.
//
//   node scripts/ai-enhance-probe.mjs                  → зелёный
//   node scripts/ai-enhance-probe.mjs --mutate=aspect  → у аспекта снова нет `ai ✦`: КРАСНЫЙ
//   node scripts/ai-enhance-probe.mjs --mutate=boxed   → `ai ✦` снова в рамке: КРАСНЫЙ
//   node scripts/ai-enhance-probe.mjs --mutate=field   → `TextareaField` забыл `enhance`: КРАСНЫЙ
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

/* Каждая мутация возвращает ОДНУ половину прежнего вида; не найденный якорь — выход 2. */
const MUTATIONS = {
  aspect: [
    {
      file: /components\/details-editor\.tsx$/,
      from: "        <AiEnhance\n          field='description'\n          value={text}",
      to: "        <AiEnhance\n          key='off'\n          disabled\n          field='description'\n          value={''}",
    },
  ],
  boxed: [
    {
      file: /ui\/components\/ai-enhance\.tsx$/,
      from: "              variant='underline'\n              size='xs'\n              disabled={busy}",
      to: "              variant='secondary'\n              size='xs'\n              disabled={busy}",
    },
  ],
  field: [
    {
      file: /ui\/form\/fields\/textarea-field\.tsx$/,
      from: '              {enhance && (\n                <AiEnhance',
      to: '              {false && enhance && (\n                <AiEnhance',
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
          // ОДИН обработчик на файл: esbuild берёт первый ответивший `onLoad`, и второй
          // обработчик того же файла молча не применился бы.
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
              return { contents: src, loader: 'tsx' };
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
const out = resolve(tmpdir(), `ai-enhance-${process.pid}.js`);
await build({
  entryPoints: [resolve(root, 'scripts/ai-enhance-entry.tsx')],
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://probe.local/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });
  await page
    .waitForSelector('textarea#detail-collar', { timeout: 15000 })
    .catch(async (e) => {
      console.log('DID NOT RUN: the fields did not mount', errors.join(' | ').slice(0, 600));
      throw e;
    });

  /** Кнопка `ai ✦` в поле, где стоит textarea `sel`, и её вычисленный стиль. */
  const trigger = (sel) =>
    page.evaluate((sel) => {
      const ta = document.querySelector(sel);
      let host = ta?.parentElement;
      while (host && !host.querySelector('[data-ai-enhance]')) host = host.parentElement;
      const btn = host?.querySelector('[data-ai-enhance] button[aria-label="ai enhance"]');
      if (!btn) return null;
      const face = btn.querySelector('span') ?? btn;
      const s = getComputedStyle(face);
      const b = getComputedStyle(btn);
      return {
        text: btn.textContent?.trim() ?? '',
        u: s.textDecorationLine,
        border: [s.borderTopWidth, b.borderTopWidth],
      };
    }, sel);

  for (const [what, sel] of [
    ['CONSTRUCTION aspect', 'textarea#detail-collar'],
    ['CONSTRUCTION notes (TextareaField enhance)', '[data-probe-notes] textarea'],
  ]) {
    console.log(`\nitem 41 · ${what}`);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.mouse.click(5, 5);
    const rest = await trigger(sel);
    ck(rest === null, `${what}: no ai ✦ while the field is not active`, JSON.stringify(rest));
    await page.focus(sel);
    await page.waitForTimeout(150);
    const on = await trigger(sel);
    ck(on?.text === 'ai ✦', `${what}: ai ✦ stands in the active field`, JSON.stringify(on));
    ck(
      !!on && on.u.includes('underline') && on.border.every((w) => w === '0px'),
      `${what}: ai ✦ is an underlined word with no frame`,
      JSON.stringify(on),
    );
  }
  ck(errors.length === 0, 'no page errors', errors.join(' | ').slice(0, 300));
  if (process.env.SHOT) {
    await page.focus('textarea#detail-collar');
    await page.waitForTimeout(150);
    await page.screenshot({ path: process.env.SHOT });
  }
} finally {
  await browser.close();
}

console.log(`\n${total - bad} / ${total}, failures ${bad}${MUTATE ? ` (mutation ${MUTATE})` : ''}`);
process.exit(bad ? 1 : 0);
