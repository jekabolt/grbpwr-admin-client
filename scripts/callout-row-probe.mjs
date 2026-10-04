#!/usr/bin/env node
// РАСКРЫТАЯ СТРОКА УКАЗАНИЯ (T21). Владелец, дословно по пунктам: «… не должны его тип менять в
// эдиторе», «кнопка делит не нужна», «цвет оставь только черный и рядом кнопка …», «dashed и hatched
// по дефолту … скрыть», «настройки стрелочек тоже как-то скрыть», «в стиче … два пикера стича
// зачем?», «при выбранном стиче показывает только исо но без пиктограмки».
//
//   node scripts/callout-row-probe.mjs [--mutate=open|stitch]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MUTATE = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').split('=')[1] ?? '';
const MUTATIONS = {
  // Ряд оформления снова раскрыт с рождения.
  open: { file: /annotation\/style-row\.tsx$/, from: 'useState(false)', to: 'useState(true)' },
  // Подпись стежка снова берётся из пункта списка: номер не из списка — голые цифры.
  stitch: {
    file: /callout-purpose-fields\.tsx$/,
    from: 'v ? <StitchValue iso={String(v)} /> : undefined',
    to: 'v ? <Compact>{item?.label ?? v}</Compact> : undefined',
  },
};
const mutation = MUTATE && {
  name: 'mutation',
  setup(b) {
    const m = MUTATIONS[MUTATE];
    b.onLoad({ filter: m.file }, async (a) => {
      let src = await readFile(a.path, 'utf8');
      if (!src.includes(m.from)) throw new Error(`мутация «${MUTATE}» не нашла строку`);
      src = src.replace(m.from, m.to);
      if (MUTATE === 'stitch')
        src = src.replace('renderValue={(v: string | number) =>\n                v ? <Compact>{item', 'renderValue={(v: string | number, item?: { label: React.ReactNode }) =>\n                v ? <Compact>{item');
      return { contents: src, loader: 'tsx' };
    });
  },
};
const stub = {
  name: 'stub',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub:api', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'const nope=()=>Promise.resolve({});export const adminService=new Proxy({},{get:()=>nope});export const authService=adminService;export const frontendService=adminService;export default {adminService};',
      loader: 'js',
      resolveDir: REPO,
    }));
  },
};
const r = (p) => resolve(REPO, 'src', p);
const outfile = resolve(tmpdir(), `callout-row-${process.pid}.js`);
await build({
  entryPoints: [resolve(HERE, 'callout-row-entry.tsx')],
  bundle: true, platform: 'browser', format: 'iife', target: 'es2020', outfile, jsx: 'automatic', logLevel: 'warning', absWorkingDir: REPO,
  plugins: mutation ? [stub, mutation] : [stub],
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
  banner: { js: 'var __STUB_ENV__ = {};' },
  alias: { components: r('components'), lib: r('lib'), api: r('api'), utils: r('utils'), ui: r('ui'), constants: r('constants'), store: r('store'), hooks: r('hooks') },
});

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try { return require.resolve('playwright'); } catch { /* кэш npx */ }
  const root = `${homedir()}/.npm/_npx`;
  if (!existsSync(root)) return null;
  const found = execFileSync('find', [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  return found[0] ? `${found[0]}/index.js` : null;
}
const pwPath = resolvePlaywright();
if (!pwPath) { console.log('playwright не найден — проба пропущена'); process.exit(0); }
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
const cssDir = resolve(REPO, 'dist/assets');
const CSS = existsSync(cssDir)
  ? execFileSync('find', [cssDir, '-maxdepth', '1', '-name', 'index-*.css'], { encoding: 'utf8' }).split('\n').filter(Boolean).map((f) => readFileSync(f, 'utf8')).join('\n')
  : '';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 560, height: 1600 } })).newPage();
page.on('pageerror', (e) => check('page error', false, e.message));
await page.route('http://probe.local/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }));
await page.goto('http://probe.local/');
if (CSS) await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: readFileSync(outfile, 'utf8') });
await page.waitForSelector('[data-bench="zone"]');

const B = (t) => `[data-bench="${t}"]`;
// R23, R24: ни чипов типа, ни кнопки delete в раскрытой строке.
check('R23 в строке нет чипов типа', (await page.$$('[data-callout-purpose-type], [data-purpose="plain"]')).length === 0);
const del = await page.$$eval('button', (bs) => bs.filter((b) => b.textContent.trim().toLowerCase() === 'delete').length);
check('R24 в строке нет кнопки delete', del === 0, `${del}`);
check('R24 ✕ по наведению на месте', (await page.$$(`${B('zone')} [aria-label^="delete callout"]`)).length > 0);

// R25–R27: свёрнутый ряд — свотч текущего цвета и дверь; больше ничего.
const closed = await page.$eval(`${B('zone')} [data-style-door]`, (d) => ({
  n: d.parentElement.children.length,
  exp: d.getAttribute('aria-expanded'),
  text: d.parentElement.innerText.replace(/\s+/g, ' ').trim(),
}));
check('R25 свёрнут по умолчанию: свотч + дверь', closed.n === 2 && closed.exp === 'false', JSON.stringify(closed));
check('R26 dashed/hatching скрыты', !/dashed|hatching/i.test(closed.text), closed.text);
check('R27 наконечники скрыты', (await page.$$(`${B('line')} [data-caps]`)).length === 0);
await page.click(`${B('line')} [data-style-door]`);
const open = await page.$eval(`${B('line')} [data-style-door]`, (d) => ({
  caps: d.parentElement.querySelectorAll('[data-caps]').length,
  colors: d.parentElement.querySelectorAll('[data-color]').length,
  dashed: /dashed/i.test(d.parentElement.innerText),
  h: Math.round(d.parentElement.getBoundingClientRect().height),
  doorH: Math.round(d.getBoundingClientRect().height),
}));
check('дверь раскрывает цвета, наконечники и пунктир', open.colors === 6 && open.caps > 1 && open.dashed, JSON.stringify(open));
check('раскрытый ряд — одна строка', open.h <= open.doorH + 2, JSON.stringify(open));
check('объяснений в ряду нет', !/one style only/i.test(await page.evaluate(() => document.body.innerText)));

// R28, R29.
const stitch = await page.$eval(`${B('stitch602')} [data-callout-purpose="stitch"]`, (el) => {
  const [a, b] = el.querySelectorAll('button[role="combobox"], button');
  return { a: a?.innerText.trim(), pict: !!a?.querySelector('[data-stitch-pictogram]'), b: b?.innerText.trim() };
});
check('R29 выбранный стежок — пиктограмма + номер + имя (602 не из списка)', stitch.pict && stitch.a === '602 coverstitch', JSON.stringify(stitch));
check('R28 второй выбор читается швом', stitch.b === 'seam', JSON.stringify(stitch));
const seamSet = await page.$eval(`${B('stitch')} [data-callout-purpose="stitch"]`, (el) => [...el.querySelectorAll('button')].map((b) => b.innerText.trim()));
check('R28 выбранный шов — «seam · …»', seamSet.some((t) => /^seam · \S/.test(t)), JSON.stringify(seamSet));

await browser.close();
console.log(`${pass} из ${pass + fail} проверок прошло`);
process.exit(fail ? 1 : 0);
