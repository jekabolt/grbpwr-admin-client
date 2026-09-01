#!/usr/bin/env node
// «У AUX В ТЕХКАРТАХ НЕ ВСЕ ПОЛЯ НУЖНЫ» (п.13 волны ux-0825) — и главный вопрос здесь НЕ «спрятано
// ли поле».
//
// Спрятать секцию можно двумя способами, и они отличаются не разметкой, а ПОСЛЕДСТВИЯМИ:
//   `{!isAux && <StyleFactsField/>}`  снимает панель с монтажа — вместе с ней умирает staged
//                                     UpdateStyle, ЕДИНСТВЕННЫЙ писатель brand / collection /
//                                     season / targetGender (UpdateTechCard их намеренно не пишет);
//   `<StyleFactsField hideFitCare/>`  прячет только разметку, оставляя запись живой.
// Первый вариант молча возвращает дефект, описанный в комментарии самой панели: оператор меняет
// бренд у aux-карты, видит «saved», перезагружает — и получает старое значение. Ни `tsc`, ни
// проверка «поля fit на экране нет» этого не видят: обе зелены в обоих вариантах.
//
// Поэтому проба смотрит на ДВЕ вещи сразу: чего на экране нет и что при этом всё ещё пишется.
//
// Запуск:  node scripts/aux-header-fields-probe.mjs [--mutate-unmount] [--mutate-category]
//   --mutate-unmount  — монтаж по-плановому, `{!isAux && …}`: обязана покраснеть ЗАПИСЬ.
//   --mutate-category — снять гейт с браузера категорий: обязано покраснеть «категории нет».

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUT = {
  unmount: process.argv.includes('--mutate-unmount'),
  category: process.argv.includes('--mutate-category'),
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

// ── МУТАЦИИ ──────────────────────────────────────────────────────────────────────────────────────
// Ветка монтажа мутируется В САМОМ СТЕНДЕ: она и есть предмет спора (план предлагал именно
// `{!isAux && …}`), а живёт она на карточке, которую стенд воспроизводит один в один.
const UNMOUNT_FIX = `        {isAux ? (
          <StyleFactsField styleId={7} canEdit hideFitCare />
        ) : (
          <Section title='style facts — fit / care (shared by all colourways)'>
            <StyleFactsField styleId={7} canEdit />
          </Section>
        )}`;
const UNMOUNT_BROKEN = `        {!isAux && (
          <Section title='style facts — fit / care (shared by all colourways)'>
            <StyleFactsField styleId={7} canEdit />
          </Section>
        )}`;
const CATEGORY_FIX = `      {!hideCategory && <CategoryBrowser />}`;
const CATEGORY_BROKEN = `      <CategoryBrowser />`;

const patcher = (filter, pairs, loader) => ({
  name: 'aux-header-mutation',
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [fixed, broken] of pairs) {
        if (!src.includes(fixed)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
        src = src.replace(fixed, broken);
      }
      return { contents: src, loader };
    });
  },
});

const plugins = [];
if (MUT.unmount)
  plugins.push(patcher(/aux-header-fields-entry\.tsx$/, [[UNMOUNT_FIX, UNMOUNT_BROKEN]], 'tsx'));
if (MUT.category)
  plugins.push(patcher(/header-meta-fields\.tsx$/, [[CATEGORY_FIX, CATEGORY_BROKEN]], 'tsx'));

const outfile = resolve(tmpdir(), `aux-header-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'aux-header-fields-entry.tsx')],
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
// K-21 · раньше здесь искалась подпись раскрывашки «base model & sample size». Раскрывашки
// больше нет (владелец: «сделать обычным не колапс инпутом»), поэтому якорем стала подпись
// самого поля — она и была тем, ради чего разметку проверяли.
if (!bundle.includes('base sample size'))
  dieNotRun('в бандле нет разметки хедера — собралось не то');

let cssDir = [];
try {
  cssDir = readdirSync(resolve(REPO, 'dist/assets'));
} catch {
  dieNotRun('dist/assets нет — сначала `yarn build`');
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
const page = await browser.newPage({ viewport: { width: 1300, height: 1200 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);
// СЛОВАРЬ. Провайдер не пойдёт за ним без живого токена (он честно бережёт 401), поэтому в
// localStorage кладётся заведомо не истёкший JWT-подобный токен — ровно то, что читает
// isTokenExpired.
const DICT = {
  dictionary: {
    categories: [
      { id: 1, name: 'outerwear', level: 'top_category', parentId: 0 },
      { id: 2, name: 'jackets', level: 'sub_category', parentId: 1 },
      { id: 3, name: 'parka', level: 'type', parentId: 2 },
    ],
    sizes: [{ id: 11, name: 'M', skuSystem: 'SIZE_SKU_SYSTEM_ALPHA' }],
    collections: [],
  },
};
await page.route('http://stub.invalid/**', (route) => {
  const url = route.request().url();
  if (url.includes('api/admin/dictionary')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(DICT),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 3600;
const FAKE_JWT = `h.${Buffer.from(JSON.stringify({ exp: FAR_FUTURE })).toString('base64')}.s`;

async function mount(isAux) {
  await page.goto('http://probe.local/');
  await page.evaluate((t) => localStorage.setItem('authToken', t), FAKE_JWT);
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.evaluate((a) => window.__aux.mount(a), isAux);
  // `attached`, а не `visible`: узел-читалка пустой и имеет нулевую высоту — «невидим» по
  // playwright, хотя смонтирован. Ждать видимости здесь значило бы ждать вечно.
  await page.waitForSelector('[data-staged-count]', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(250);
}

// ВИДИМОСТЬ, А НЕ ПРИСУТСТВИЕ В РАЗМЕТКЕ: свёрнутый <details> и `hidden`-ветка меряются как
// невидимые только через checkVisibility, а геометрия их не ловит.
const visibleField = (name) =>
  page.evaluate((n) => {
    const el = document.querySelector(`[data-field="${n}"]`);
    if (!el) return { present: false, visible: false };
    return { present: true, visible: el.checkVisibility ? el.checkVisibility() : true };
  }, name);
const staged = () =>
  page.evaluate(() => ({
    text: document.querySelector('[data-staged]')?.getAttribute('data-staged') ?? '',
    count: Number(document.querySelector('[data-staged-count]')?.getAttribute('data-staged-count')),
  }));
const hasText = (t) =>
  page.evaluate((needle) => (document.body.innerText || '').toLowerCase().includes(needle), t);

head('ЦИТАТА 0 — ЯКОРЬ: карточка монтирует панель ИМЕННО ТАК, как это делает стенд');
{
  // ЗАЧЕМ ЯКОРЬ. Ветка монтажа воспроизведена в стенде, и стенд же её мутирует. Ничто, кроме
  // этой проверки, не привязывает пробу к тому, что `tech-card/components/index.tsx` смонтирован
  // так же: коммит, «упростивший» карточку до `{!isAux && …}`, оставил бы ВСЕ пробы зелёными и
  // вернул бы молчаливую потерю brand/collection/season/targetGender при зелёном гейте.
  const card = readFileSync(
    resolve(REPO, 'src/components/managers/tech-card/components/index.tsx'),
    'utf8',
  );
  ck(
    /\{isAux \? \(\s*<StyleFactsField[\s\S]{0,400}?hideFitCare/.test(card),
    'панель монтируется ВСЕГДА и прячется пропом hideFitCare',
  );
  ck(
    !/\{!isAux &&[\s\S]{0,200}?<StyleFactsField/.test(card),
    'ветки `{!isAux && <StyleFactsField…>}` (снятие с монтажа) в карточке нет',
  );
  ck(
    card.includes('<HeaderMetaFields hideCategory={isAux} />'),
    'браузер категорий гейтится тем же живым isAux',
  );
}

head('ЦИТАТА А — SELLABLE: категория и fit на месте (контроль «есть что прятать»)');
{
  await mount(false);
  const fit = await visibleField('fit');
  ck(fit.present && fit.visible, 'поле fit видно');
  ck(await hasText('category'), 'браузер категорий на экране');
  // K-21 · ВИДНЫ, А НЕ ПРОСТО СМОНТИРОВАНЫ. Проверка сменила предмет вместе с правкой: раньше
  // спрашивали «подпись раскрывашки на экране», и она была зелёной, пока оба поля лежали
  // СХЛОПНУТЫМИ внутри <details>. Теперь спрашивается ровно то, что просил владелец, — что поля
  // стоят обычными полями и их ВИДНО. `visibleField` меряет через checkVisibility, а он —
  // единственное, что ловит схлопнутый <details>: геометрия закрытого блока врёт «видим».
  // Поэтому эта пара проверок покраснела бы, верни кто-нибудь раскрывашку обратно.
  const bmSell = await visibleField('baseModelId');
  const ssSell = await visibleField('baseSampleSizeId');
  ck(bmSell.present && bmSell.visible, 'base model — обычное видимое поле, не под раскрывашкой');
  ck(ssSell.present && ssSell.visible, 'base sample size — обычное видимое поле');
}

head('ЦИТАТА Б — AUX: категории и fit нет, базовая модель осталась');
{
  await mount(true);
  const fit = await visibleField('fit');
  ck(!fit.present, 'поля fit в разметке нет вовсе', fit.present ? 'оно там' : '');
  ck(!(await hasText('care symbols')), 'пикера care нет');
  ck(!(await hasText('— category —')), 'браузера категорий нет');
  // K-21 · тот же вопрос, что и на sellable: путь к костингу у aux-карты не просто смонтирован,
  // а виден. Себестоимость считается по норме БАЗОВОГО РАЗМЕРА без фолбэка, так что поле,
  // спрятанное под словом «optional», решало деньги молча.
  const ssAux = await visibleField('baseSampleSizeId');
  ck(ssAux.present && ssAux.visible, 'путь к костингу виден (базовый размер), не спрятан');
}

head('ЦИТАТА В — AUX: спрятанная панель ВСЁ ЕЩЁ ПИШЕТ бренд (это и есть предмет проверки)');
{
  const before = await staged();
  ck(before.count === 0, 'до правки ничего не застейджено', String(before.count));
  await page.evaluate(() => window.__aux.dirtyBrand());
  await page.waitForTimeout(250);
  const after = await staged();
  ck(after.count === 1, 'появилась ровно одна staged-запись', `${after.count}: ${after.text}`);
  ck(
    after.text.includes('styleFacts') && after.text.includes('brand'),
    'это staged UpdateStyle стилевых фактов, и он назвал бренд',
    after.text,
  );
}

head('ЦИТАТА Г — SELLABLE: та же запись работает и с видимой панелью (контроль)');
{
  await mount(false);
  await page.evaluate(() => window.__aux.dirtyBrand());
  await page.waitForTimeout(250);
  const after = await staged();
  ck(after.text.includes('brand'), 'бренд застейджен и на sellable', after.text);
}

ck(pageErrors.length === 0, 'страница без исключений', pageErrors.slice(0, 2).join(' | '));

await browser.close();
const mutated = Object.entries(MUT)
  .filter(([, on]) => on)
  .map(([k]) => k);
console.log(
  `\n${bad === 0 ? 'ВСЁ ЗЕЛЁНОЕ' : `ПРОВАЛОВ: ${bad}`}${mutated.length ? ` (мутации: ${mutated.join(', ')})` : ''}`,
);
process.exit(bad === 0 ? 0 : 1);
