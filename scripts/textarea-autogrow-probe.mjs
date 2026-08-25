#!/usr/bin/env node
// АВТОВЫСОТА МНОГОСТРОЧНОГО ПОЛЯ: «высота = текст + 3 строки, потолок 480, дальше прокрутка».
//
// Правка живёт в ПРИМИТИВЕ `ui/components/text-area`, то есть её увидят 15 мест <TextareaField> и
// 9 голых <Textarea> по всей админке. Проверять её типами бессмысленно: `tsc` зелен и на поле,
// которое не растёт вовсе. Поэтому здесь настоящий браузер, настоящая СБОРКА CSS админки
// (без неё ни один tailwind-класс не существует и все замеры — замеры голого html) и настоящие
// жесты.
//
// ЧТО ИМЕННО ЛОВИТСЯ ЖЕСТАМИ, А НЕ РАЗМЕТКОЙ:
//   · рост при ЖИВОЙ ПЕЧАТИ в ГОЛОМ неконтролируемом поле — props.value там не меняется никогда,
//     так что зелёный ответ доказывает работу onInput, а не эффекта на value;
//   · «+3 строки», а не «+3 к трём»: поле с rows={3} и ОДНОЙ строкой текста обязано быть высотой
//     в 4 строки. Наивный замер (height:'auto') вернул бы здесь три строки атрибута rows и вырастил
//     бы поле до шести — молча и правдоподобно;
//   · спрятанная ветка (`hidden`, как вкладки тех-карты) меряется в НОЛЬ. Поле, смонтированное
//     невидимым, обязано получить высоту в момент показа.
//
// Запуск:  node scripts/textarea-autogrow-probe.mjs [--mutate-…]
// Мутации: --mutate-oninput --mutate-ref --mutate-measure --mutate-cap --mutate-spare
//          --mutate-observer
//
// playwright берётся из кэша npx (его нет в зависимостях проекта); не нашёлся — проба
// ПРОПУСКАЕТСЯ, а не падает: отсутствие пробы не является утверждением о коде.

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUT = {
  oninput: process.argv.includes('--mutate-oninput'),
  ref: process.argv.includes('--mutate-ref'),
  measure: process.argv.includes('--mutate-measure'),
  cap: process.argv.includes('--mutate-cap'),
  spare: process.argv.includes('--mutate-spare'),
  observer: process.argv.includes('--mutate-observer'),
};

function resolvePlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req.resolve('playwright');
  } catch {
    /* дальше — кэш npx */
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

const pwEntry = resolvePlaywright();
if (!pwEntry) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const pw = await import(pwEntry);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const dieNotRun = (why) => {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: ${why}`);
  process.exit(2);
};

// ── МУТАЦИИ (ломают починку обратно) ─────────────────────────────────────────────────────────────
const ONINPUT_FIX = `          resize();
          onInput?.(e);`;
const ONINPUT_BROKEN = `          onInput?.(e);`;
const REF_FIX = `      const outer = forwardedRef.current;
      if (typeof outer === 'function') outer(el);
      else if (outer) (outer as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;`;
const REF_BROKEN = `      void forwardedRef;`;
const MEASURE_FIX = `      el.style.height = '0px';`;
const MEASURE_BROKEN = `      el.style.height = 'auto';`;
const CAP_FIX = `      el.style.height = \`\${Math.min(content + SPARE_LINES * lh, MAX_AUTO_HEIGHT)}px\`;`;
const CAP_BROKEN = `      el.style.height = \`\${content + SPARE_LINES * lh}px\`;`;
const SPARE_FIX = `const SPARE_LINES = 3;`;
const SPARE_BROKEN = `const SPARE_LINES = 0;`;
const OBSERVER_FIX = `      if (!el || !autoGrow || typeof ResizeObserver === 'undefined') return;`;
const OBSERVER_BROKEN = `      if (el || !autoGrow || typeof ResizeObserver === 'undefined') return;`;

const patcher = (filter, pairs, loader) => ({
  name: 'textarea-mutation',
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [fixed, broken] of pairs) {
        // Мутация, не нашедшая свою строку, — это НЕ мутация: молча собранный целый код дал бы
        // «зелёную мутацию», то есть ровно ту ложь, ради которой мутации и существуют.
        if (!src.includes(fixed)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
        src = src.replace(fixed, broken);
      }
      return { contents: src, loader };
    });
  },
});

const pairs = [];
if (MUT.oninput) pairs.push([ONINPUT_FIX, ONINPUT_BROKEN]);
if (MUT.ref) pairs.push([REF_FIX, REF_BROKEN]);
if (MUT.measure) pairs.push([MEASURE_FIX, MEASURE_BROKEN]);
if (MUT.cap) pairs.push([CAP_FIX, CAP_BROKEN]);
if (MUT.spare) pairs.push([SPARE_FIX, SPARE_BROKEN]);
if (MUT.observer) pairs.push([OBSERVER_FIX, OBSERVER_BROKEN]);
const plugins = pairs.length ? [patcher(/text-area\.tsx$/, pairs, 'tsx')] : [];

const outfile = resolve(tmpdir(), `textarea-autogrow-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'textarea-autogrow-entry.tsx')],
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
rmSync(outfile, { force: true });
// ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ СБОРКИ: в бандле обязан быть код примитива. Пустой/обрезанный бандл дал бы
// «поле не растёт» вместо «стенд не собрался».
// Якорь НАРОЧНО взят из разметки примитива, а не из механики автовысоты: первый вариант сторожил
// `MAX_AUTO_HEIGHT`, мутация --mutate-cap оставляла константу неиспользованной, esbuild её выбрасывал
// — и сторож объявлял «проба не выполнена» там, где мутация как раз сработала. Ложная краснота
// сторожа читается как «мутация ничего не доказала», то есть ровно наоборот.
if (!bundle.includes('min-h-[44px]'))
  dieNotRun('в бандле нет разметки примитива — собралось не то');

// СБОРКА CSS АДМИНКИ. Без неё нет ни одного tailwind-класса, и все замеры ниже — замеры голого html.
let cssDir = [];
try {
  cssDir = readdirSync(resolve(REPO, 'dist/assets'));
} catch {
  dieNotRun('dist/assets нет — проба меряет НАСТОЯЩИЙ css админки; сначала `yarn build`');
}
const cssName = cssDir.find((f) => /^index-.*\.css$/.test(f));
if (!cssName) dieNotRun('dist/assets/index-*.css нет — сначала `yarn build`');
const CSS = readFileSync(resolve(REPO, 'dist/assets', cssName), 'utf8');

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

const LONG_LINES = 6;
const hiddenText = Array.from({ length: LONG_LINES }, (_, i) => `hidden line ${i + 1}`).join('\n');

await page.goto('http://probe.local/');
await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: bundle });
await page.evaluate((h) => window.__ta.mount('', h), hiddenText);
await page.waitForSelector('#concept', { timeout: 15000 });
await page.waitForTimeout(200);

// Геометрия ОДНОГО поля, как её видит браузер. `checkVisibility` отдельно: спрятанное поле меряется
// в ноль, и «высота 0» не должна читаться как «поле не выросло».
const geom = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || 1.5 * parseFloat(cs.fontSize);
    return {
      h: el.getBoundingClientRect().height,
      clientH: el.clientHeight,
      scrollH: el.scrollHeight,
      lh,
      pad: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
      border: parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth),
      resize: cs.resize,
      minH: cs.minHeight,
      overflowY: cs.overflowY,
      visible: el.checkVisibility ? el.checkVisibility() : el.offsetHeight > 0,
      inlineH: el.style.height,
      len: el.value.length,
      lines: (el.value.match(/\n/g) || []).length + 1,
    };
  }, sel);

/** Ожидаемая border-box высота поля с `textLines` строками текста: текст + 3 запасные. */
const expected = (g, textLines) =>
  Math.min((textLines + 3) * g.lh + g.pad + g.border, 480);
const near = (a, b, eps = 2.5) => Math.abs(a - b) <= eps;

async function typeLines(sel, n, prefix) {
  await page.click(sel);
  for (let i = 0; i < n; i++) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.type(`${prefix} ${i + 1}`);
  }
  await page.waitForTimeout(60);
}

head('ЦИТАТА А — пустое поле: 1 строка каретки + 3 запасные');
{
  const g = await geom('#concept');
  ck(g.visible, 'поле видно');
  ck(
    near(g.h, expected(g, 1)),
    `пустое = 4 строки (${expected(g, 1).toFixed(1)}px)`,
    `замер ${g.h.toFixed(1)}px, строка ${g.lh}px`,
  );
  ck(g.h > 44, 'решает автовысота, а не min-h-[44px]', `${g.h.toFixed(1)} > 44`);
  ck(g.resize === 'none', 'ручной драг за уголок снят (он дерётся с автовысотой)', g.resize);
}

head('ЦИТАТА Б — ОДНА строка текста в поле с rows={3}: всё ещё 4 строки, а не 6');
{
  await page.click('#concept');
  await page.keyboard.type('one single line');
  await page.waitForTimeout(60);
  const g = await geom('#concept');
  ck(
    near(g.h, expected(g, 1)),
    `текст+3 = 4 строки (${expected(g, 1).toFixed(1)}px)`,
    `замер ${g.h.toFixed(1)}px`,
  );
}

head('ЦИТАТА В — рост при живой печати, 10 строк');
{
  await page.fill('#concept', '');
  await typeLines('#concept', 10, 'line');
  const g = await geom('#concept');
  ck(g.lines === 10, 'в поле действительно 10 строк', String(g.lines));
  ck(
    near(g.h, expected(g, g.lines)),
    `${g.lines} строк текста + 3 (${expected(g, g.lines).toFixed(1)}px)`,
    `замер ${g.h.toFixed(1)}px`,
  );
}

head('ЦИТАТА Г — потолок 480px и внутренняя прокрутка');
{
  await page.fill(
    '#concept',
    Array.from({ length: 60 }, (_, i) => `paragraph line ${i + 1}`).join('\n'),
  );
  await page.waitForTimeout(80);
  const g = await geom('#concept');
  ck(near(g.h, 480, 1), 'высота упёрлась в 480px', `${g.h.toFixed(1)}px`);
  ck(g.scrollH > g.clientH, 'содержимое прокручивается внутри поля', `${g.scrollH} > ${g.clientH}`);
  ck(g.overflowY === 'auto' || g.overflowY === 'scroll', 'overflow-y даёт полосу', g.overflowY);
}

head('ЦИТАТА Д — стирание сжимает поле обратно');
{
  await page.fill('#concept', '');
  await page.waitForTimeout(80);
  const g = await geom('#concept');
  ck(near(g.h, expected(g, 1)), 'снова 4 строки', `${g.h.toFixed(1)}px`);
}

head('ЦИТАТА Е — ГОЛОЕ неконтролируемое поле растёт от ЖИВОЙ ПЕЧАТИ (это про onInput)');
{
  const before = await geom('#bare');
  await typeLines('#bare', 5, 'bare');
  const g = await geom('#bare');
  ck(g.h > before.h, 'поле выросло от набора', `${before.h.toFixed(1)} → ${g.h.toFixed(1)}`);
  ck(
    near(g.h, expected(g, g.lines)) && g.lines === 5,
    `5 строк + 3 (${expected(g, 5).toFixed(1)}px)`,
    `${g.h.toFixed(1)}px, строк ${g.lines}`,
  );
}

head('ЦИТАТА Ж — autoGrow={false} остаётся опт-аутом');
{
  const before = await geom('#nogrow');
  await typeLines('#nogrow', 5, 'no');
  const g = await geom('#nogrow');
  ck(near(g.h, before.h, 0.5), 'высота не изменилась', `${before.h.toFixed(1)} → ${g.h.toFixed(1)}`);
  ck(g.resize === 'vertical', 'уголок ручного драга остался', g.resize);
  ck(g.inlineH === '', 'инлайновой высоты примитив не писал', `«${g.inlineH}»`);
}

head('ЦИТАТА З — переопределение соседа min-h-24 выжило (так живёт AI-описание операций)');
{
  const g0 = await geom('#minh');
  ck(g0.minH === '96px', 'min-height остался 96px', g0.minH);
  ck(near(g0.h, 96, 0.5), 'пустое поле = ровно пол в 96px (пол выше «текст+3»)', `${g0.h.toFixed(1)}px`);
  await typeLines('#minh', 10, 'm');
  const g = await geom('#minh');
  ck(g.h > 96, 'пол не мешает росту выше себя', `${g.h.toFixed(1)}px`);
  ck(
    near(g.h, expected(g, g.lines)) && g.lines === 10,
    `10 строк + 3 (${expected(g, 10).toFixed(1)}px)`,
    `${g.h.toFixed(1)}px, строк ${g.lines}`,
  );
}

head('ЦИТАТА И — поле, смонтированное в СПРЯТАННОЙ ветке, получает высоту при показе');
{
  const hiddenBefore = await geom('#hidden');
  ck(!hiddenBefore.visible, 'до показа поле действительно спрятано (checkVisibility)');
  await page.evaluate(() => window.__ta.reveal());
  await page.waitForTimeout(200);
  const g = await geom('#hidden');
  ck(g.visible, 'после показа поле видно');
  ck(
    near(g.h, expected(g, LONG_LINES)),
    `${LONG_LINES} строк + 3 (${expected(g, LONG_LINES).toFixed(1)}px)`,
    `замер ${g.h.toFixed(1)}px`,
  );
}

head('ЦИТАТА К — слияние рефов: RHF ведёт фокус на ошибку В ЭТО поле');
{
  await page.fill('#concept', '');
  await page.click('body');
  await page.evaluate(() => window.__ta.submit());
  await page.waitForTimeout(300);
  const focused = await page.evaluate(() => window.__ta.focused());
  ck(focused === 'concept', 'фокус на пустом обязательном textarea', `активен «${focused}»`);
}

ck(pageErrors.length === 0, 'страница без исключений', pageErrors.join(' | '));

await browser.close();
const mutated = Object.entries(MUT)
  .filter(([, on]) => on)
  .map(([k]) => k);
console.log(
  `\n${bad === 0 ? 'ВСЁ ЗЕЛЁНОЕ' : `ПРОВАЛОВ: ${bad}`}${mutated.length ? ` (мутации: ${mutated.join(', ')})` : ''}`,
);
process.exit(bad === 0 ? 0 : 1);
