#!/usr/bin/env node
// ЧЕРНОВИК CONSTRUCTION: ПРИНЯТОЕ ДОХОДИТ ДО ПОЛЯ, А НЕ ПРИНЯТОЕ НЕ ИСЧЕЗАЕТ.
//
// ЗАЧЕМ ПРОБА ВООБЩЕ. Фича 9 приносит на карточку ОТВЕТ МОДЕЛИ, а тех-карта сохраняется ПОЛНОЙ
// ПЕРЕЗАПИСЬЮ: объект, у которого поля нет, доезжает до сервера zod-дефолтом — то есть командой
// «очисти это» (`techcard-draft-restore-wipes-absent-fields`). Обе половины опасности невидимы
// глазом: и «принял, а в поле не попало», и «принял одно, а соседнее молча опустело» выглядят на
// экране одинаково правильно ровно до сохранения.
//
// ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ (пара «цитата + мутация», `quote-plus-mutation-is-the-pair`):
//   цитата A — ПРИНЯТЫЙ СИЛУЭТ ДОХОДИТ ДО `[data-c19-detail=silhouette]`, то есть до textarea,
//              которую рисует ДРУГОЙ орган (`ConstructionGeneralInfo`), а не до нашего состояния;
//   цитата B — СТИРАНИЕ НЕВОЗМОЖНО: соседние поля, аспекты, списки и концепт переживают ЛЮБУЮ
//              последовательность принятий; строки, о которой модель молчала, на экране нет вовсе,
//              и кнопки «принять всё» не существует;
//   цитата C — `replace` ТРЕБУЕТ СВОЕГО КЛИКА: пока по строке ткани не нажали, на карточке стоит
//              старое значение, и оно же напечатано на строке как `was: …`;
//   цитата D — СПИСКИ ТОЛЬКО ДОПОЛНЯЮТСЯ: совпавшая строка приходит `same` и БЕЗ чипа, принятая
//              рождается конструктором (`number:0`, свежий `client_ref`, `mediaId:0`, `parts[0]`),
//              существующая не трогается;
//   цитата E — КОНЦЕПТ НЕ СПОРИТ С ДИЗАЙНЕРОМ: модель его предложила, карточка непуста ⇒ строки нет;
//   контроль — счётчик и снекбар: «ничего не произошло» обязано отличаться от «отказали словами».
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ, А НЕ В ФАЙЛЕ (приём step-roundtrip / bom-pantone): правка исходника ради
// проверки — это правка, которую однажды забудут откатить. Мутация, чей якорь не найден, ОСТАНАВЛИВАЕТ
// прогон: зелень под неналоженной мутацией не доказывает ничего, а красный от сломанной сборки —
// ложная краснота (`probe-exit-code-is-not-verdict`).
//   node scripts/construction-draft-probe.mjs                          прогон
//   node scripts/construction-draft-probe.mjs --mutate-drop-detail-write
//        снимает СТРОКУ ЗАПИСИ из `accept()` — принятие перестаёт доходить до поля; A и C краснеют,
//        B обязана остаться зелёной (пропажа записи ничего не стирает).
//   node scripts/construction-draft-probe.mjs --mutate-detail-replaces-array
//        upsert аспекта начинает ЗАМЕНЯТЬ массив `details` одной строкой — ровно тот дефект, ради
//        которого написана вся фаза; краснеет B, A обязана остаться зелёной.
//   node scripts/construction-draft-probe.mjs --mutate-diff-blind
//        `scalarState` перестаёт смотреть на карточку и всегда отвечает `add`; краснеет C.
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИЙ (2026-09-04, ветка feat/design-band-ui):
//   чистый прогон              → 51 / 51, провалов 0;
//   --mutate-drop-detail-write → 5 провалов (A целиком + «свой клик меняет ткань»), а ВСЯ ЦИТАТА B
//                                осталась ЗЕЛЁНОЙ — и это честно: пропавшая запись ничего не стирает;
//   --mutate-detail-replaces-array → 4 провала, и это ЗЕРКАЛЬНЫЙ набор: «значение в поле равно
//                                предложенному» осталось ЗЕЛЁНЫМ (принятое доехало), покраснело
//                                ровно то, что сторожит соседей — то есть проба B смотрит на живой
//                                код, а не на счастливый путь;
//   --mutate-diff-blind        → 4 провала (различие `add` / `replace` / `same` и печать `was: …`).
//   Неизвестный `--mutate…` останавливает прогон (проверено `--mutate-nonsense`).
//   Все мутации жили только в бандле; ни один файл на диске не тронут.
//
// ЧЕГО ЭТА ПРОБА НЕ ДЕЛАЕТ. Она не мерит НИ ОДНОЙ ГЕОМЕТРИИ и поэтому НАРОЧНО не грузит собранный
// CSS: все её вопросы — про значения, атрибуты и число строк, и они одинаковы с тайлвиндом и без
// него. Она также ничего не утверждает про провод: сеть заглушена, и что `DraftDesignIdea` правда
// отвечает этой формой — знание серверных тестов, а не этого стенда.

const dieNotRun = (why) => {
  console.log(`\nDID NOT RUN: ${why}`);
  console.log('зелёный ИЛИ красный прогон в этом состоянии не доказал бы ничего.');
  process.exit(2);
};
process.on('uncaughtException', (e) => dieNotRun(e?.stack ?? e?.message ?? String(e)));
process.on('unhandledRejection', (e) => dieNotRun(e?.stack ?? e?.message ?? String(e)));

import { build as esbuild } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

// ─── ФЛАГИ МУТАЦИЙ ─────────────────────────────────────────────────────────────────────────────
// НЕИЗВЕСТНЫЙ `--mutate…` ЗНАЧИТ, ЧТО МУТАЦИЯ НЕ НАЛОЖЕНА ВОВСЕ, и прогон напечатал бы совершенно
// честное «ЗЕЛЕНО», не сказав ничего про мутацию, которую звавший думал, что запустил.
const KNOWN = new Set([
  '--mutate-drop-detail-write',
  '--mutate-detail-replaces-array',
  '--mutate-diff-blind',
]);
const stray = process.argv.slice(2).find((a) => a.startsWith('--mutate') && !KNOWN.has(a));
if (stray) dieNotRun(`неизвестный флаг мутации ${stray}; известные: ${[...KNOWN].join(', ')}`);
const on = (f) => process.argv.includes(f);
const MUTATIONS = [...KNOWN].filter(on);

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ─── ПРАВКИ ИСХОДНИКА В ПАМЯТИ ─────────────────────────────────────────────────────────────────
const ORGAN = /design\/head\/construction-draft\.tsx$/;
const MODEL = /design\/head\/construction-draft-model\.ts$/;
const WRITERS = /components\/form-writers\.ts$/;

const patch = (name, filter, needle, replacement) => ({
  name,
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(needle))
        dieNotRun(`мутация «${name}» не нашла свой якорь в ${args.path}`);
      return { contents: src.replace(needle, replacement), loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
    });
  },
});

const ACCEPT_LINE = '      upsertDetailText(getValues, setValue, w.key, w.text);';
const UPSERT_TAIL = `  const next = empty
    ? cur.filter((d) => d.key !== key)
    : k >= 0
      ? [...cur.slice(0, k), merged, ...cur.slice(k + 1)]
      : [...cur, merged];`;
const SCALAR_BODY = `  if (!current) return 'add';
  return foldToken(proposed) === foldToken(current) ? 'same' : 'replace';`;

const plugins = [];
if (on('--mutate-drop-detail-write'))
  plugins.push(patch('drop-detail-write', ORGAN, ACCEPT_LINE, '      /* мутация: строки записи нет */'));
if (on('--mutate-detail-replaces-array'))
  plugins.push(
    patch(
      'detail-replaces-array',
      WRITERS,
      UPSERT_TAIL,
      '  const next = empty ? [] : [merged]; /* мутация: замена массива целиком */',
    ),
  );
if (on('--mutate-diff-blind'))
  plugins.push(patch('diff-blind', MODEL, SCALAR_BODY, "  void current;\n  return 'add';"));

// ─── ЗАГЛУШЕННАЯ СЕТЬ ──────────────────────────────────────────────────────────────────────────
// ПО СУФФИКСУ ПУТИ: `api/api` достижим и алиасом, и относительным импортом из генерённого кода, а
// относительный импорт не алиасится. Маркер ниже — то, по чему потом ГРЕПАЕТСЯ СОБРАННЫЙ БАНДЛ:
// без этой сверки забытый `plugins:` оставил бы в сборке настоящий клиент, и весь стенд мерил бы
// экран ошибки (`component-harness-esbuild-playwright`, ловушка №2).
//
// `DraftDesignIdea` ВООРУЖАЕТСЯ ПОКЕЙСНО и без снаряжения ОТКАЗЫВАЕТ ГРОМКО: неотвеченный вызов
// оставил бы кнопку в «starting…» навсегда, и это читалось бы как «ещё думает». Всё остальное
// (словарь, список моделей) — декорации соседних органов: им отдаётся пустой объект.
const STUB_MARKER = 'PROBE_STUB_C19_CONSTRUCTION_DRAFT_NETWORK';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const STUB_SOURCE = `
// ${STUB_MARKER}
const call = (method) => (req) => {
  (globalThis.__c19Calls || (globalThis.__c19Calls = [])).push(method);
  if (method === 'DraftDesignIdea') {
    const cfg = (globalThis.__c19Stub || {}).draft;
    if (!cfg) return Promise.reject(new Error('${STUB_MARKER}: no stub armed for DraftDesignIdea'));
    if (cfg.mode === 'error') return Promise.reject(new Error(cfg.text || '${STUB_MARKER}: refused'));
    return Promise.resolve(cfg.response || {});
  }
  return Promise.resolve({});
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
const pwPath = resolvePlaywright();
if (!pwPath) dieNotRun('playwright не найден — живого стенда нет, и доказывать нечем');
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) dieNotRun('playwright есть, а chromium в нём нет');

// ─── СБОРКА ────────────────────────────────────────────────────────────────────────────────────
const outfile = resolve(tmpdir(), `c19-construction-draft-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'construction-draft-probe-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  // БЕЗ ЭТОГО НЕ РЕЗОЛВЯТСЯ НИ `ui/…`/`components/…`, НИ САМ REACT.
  nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')],
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  alias: { '@': resolve(REPO, 'src') },
  // ЗАГЛУШКА ПРАВДА ПЕРЕДАНА. Объявить её и забыть эту строку — задокументированная ловушка.
  plugins: [stub, ...plugins],
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
});
const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });
if (!bundle.includes(STUB_MARKER))
  dieNotRun(`в собранном бандле нет «${STUB_MARKER}» — сеть НЕ заглушена`);
if (bundle.includes(REAL_API_MARKER))
  dieNotRun(`в собранном бандле остался «${REAL_API_MARKER}» — настоящий api-слой внутри`);

// ─── ФИКСТУРА ──────────────────────────────────────────────────────────────────────────────────
// СОХРАНЁННАЯ карточка, которая УЖЕ говорит часть того, что скажет модель: без этого «replace» и
// «same» были бы недостижимыми состояниями и проба измеряла бы один только «add».
const EXISTING_CALLOUT_REF = 'ref-existing-side-seam';
const FIXTURE = {
  moodboardMedia: [{ mediaId: 11, kind: '', caption: '' }],
  concept: 'a lean tank, cut close through the body',
  fit: '',
  details: [{ key: 'fabric', text: 'cotton jersey', mediaIds: [] }],
  callouts: [
    {
      number: 4,
      part: 'side seam',
      parts: ['side seam'],
      description: 'overlocked',
      dimensions: '',
      mediaId: 0,
      posX: '',
      posY: '',
      kind: 'pin',
      points: [],
      color: '',
      dashed: false,
      filled: false,
      clientRef: EXISTING_CALLOUT_REF,
    },
  ],
  bomItems: [],
};

const SILHOUETTE = 'Sleeveless V-neck tank top';
const FABRIC = 'Stretch knit jersey';
const DRAFT = {
  silhouette: SILHOUETTE,
  fabric: FABRIC,
  fit: 'regular',
  // Предложен НАРОЧНО: у карточки концепт есть, и строки быть не должно (цитата E).
  concept: 'A lean tank in stretch jersey, cut close through the body.',
  aspects: [
    // Ключ написан ПОДПИСЬЮ, как аспект называется на экране — свёртка обязана узнать в нём
    // стандартный `collar`, иначе на карточке заведётся ВТОРАЯ карточка того же аспекта.
    { key: 'Collar / Neckline', text: 'V-neck, self-fabric binding 1 cm' },
    // А это — законный САМОДЕЛЬНЫЙ ключ: редактор аспектов их принимает, и выбрасывать ответ
    // модели там, где человеку то же самое разрешено, было бы ложным «модель промолчала».
    { key: 'vent', text: 'no vent' },
    // Тот же ключ второй раз: одно предложение, сказанное дважды, обязано остаться одним.
    { key: 'Collar', text: 'crew neck' },
  ],
  callouts: [
    { feature: 'neck binding', details: 'self-fabric, folded', dimensions: '1 cm' },
    // Уже есть на карточке ⇒ `same`, без чипа (цитата D).
    { feature: 'side seam', details: 'overlocked, 4-thread', dimensions: '' },
  ],
  bom: [
    {
      section: 'TECH_CARD_BOM_SECTION_FABRIC',
      purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
      kind: 'TECH_CARD_BOM_KIND_UNSET',
      name: 'main fabric',
      composition: '95% cotton 5% elastane',
      colour: 'black',
      pantone: '19-4005 TCX',
      materialId: 0,
    },
  ],
  missing: ['picture 2 — the strap join at the shoulder'],
};
const RESPONSE = {
  run: {
    id: 91,
    kind: 'DESIGN_RUN_KIND_DRAFT_IDEA',
    status: 'DESIGN_RUN_STATUS_DONE',
    currency: 'USD',
    priceActual: { value: '0.07' },
    outputText: JSON.stringify(DRAFT),
  },
  budget: {},
  construction: DRAFT,
};

// ─── СТЕНД ─────────────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage();
// ВСЁ ОСТАЛЬНОЕ ОТРЕЗАНО: если заглушка когда-нибудь не встанет, запрос не уйдёт тихо в 404, а
// прогон умрёт со словами.
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('http://probe.local/')) return route.continue();
  return route.abort();
});
await page.route('http://probe.local/', (route) =>
  route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><meta charset="utf-8"><body><div id="root"></div>`,
  }),
);
await page.goto('http://probe.local/');
await page.addScriptTag({ content: bundle });

const mount = async () => {
  await page.evaluate(
    ([fixture, response]) => {
      window.__c19Stub = { draft: { mode: 'ok', response } };
      window.__c19.mount(fixture);
    },
    [FIXTURE, RESPONSE],
  );
  await page.waitForSelector('[data-c19-draft]');
  await page.waitForSelector('[data-c19-detail=silhouette]');
};

const val = (sel) => page.$eval(sel, (el) => el.value ?? '');
const formState = () => page.evaluate(() => window.__c19.form());
const rowIds = () =>
  page.$$eval('[data-c19-draft-row]', (els) => els.map((e) => e.getAttribute('data-c19-draft-row')));
const rowState = (id) =>
  page.$eval(`[data-c19-draft-row="${id}"]`, (e) => e.getAttribute('data-state'));
const rowText = (id) => page.$eval(`[data-c19-draft-row="${id}"]`, (e) => e.innerText);
const has = async (sel) => (await page.$(sel)) !== null;

await mount();

// ─── ПРЕДПОСЫЛКА: СТЕНД — ЭТО СТЕНД ────────────────────────────────────────────────────────────
head('предпосылка — оба органа смонтированы и фикстура правда легла');
{
  ck(await has('[data-c19-general]'), 'блок общих сведений на экране (он рисует поле-адресат)');
  ck((await val('[data-c19-detail=silhouette]')) === '', 'силуэт на карточке ПУСТ до всего');
  ck(
    (await val('[data-c19-detail=fabric]')) === 'cotton jersey',
    'ткань на карточке уже стоит — состояние `replace` достижимо',
    await val('[data-c19-detail=fabric]'),
  );
  const before = await formState();
  ck((before.callouts ?? []).length === 1, 'на карточке одно указание', String((before.callouts ?? []).length));
  ck(!(await has('[data-c19-draft-row]')), 'до нажатия НЕТ НИ ОДНОЙ строки предложения');
}

// нажать дверь: она рисуется `GenerateRow`, у неё нет своего якоря — берём кнопку внутри органа.
const press = async () => {
  const pressed = await page.evaluate(() => {
    const root = document.querySelector('[data-c19-draft]');
    const btn = [...root.querySelectorAll('button')].find((b) =>
      (b.textContent || '').toLowerCase().includes('draft the construction'),
    );
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
  if (!pressed) dieNotRun('дверь «draft the construction» не найдена или инертна — нажимать нечего');
  await page.waitForSelector('[data-c19-draft-row]', { timeout: 5000 });
};
await press();

// ─── ЦИТАТА A ──────────────────────────────────────────────────────────────────────────────────
head('цитата A — принятый силуэт доходит до textarea, которую рисует ДРУГОЙ орган');
{
  ck(
    (await page.evaluate(() => window.__c19Calls)).includes('DraftDesignIdea'),
    'платный прогон правда уходил (иначе строки нарисованы из воздуха)',
  );
  ck(await has('[data-c19-draft-row="general:silhouette"]'), 'строка силуэта предложена');
  ck((await rowState('general:silhouette')) === 'add', 'её состояние — `add` (поле пусто)');
  await page.click('[data-c19-draft-accept="general:silhouette"]');
  const got = await val('[data-c19-detail=silhouette]');
  ck(got === SILHOUETTE, 'ЗНАЧЕНИЕ В ПОЛЕ РАВНО ПРЕДЛОЖЕННОМУ', JSON.stringify(got));
  const f = await formState();
  const keys = (f.details ?? []).map((d) => d.key).sort();
  ck(
    JSON.stringify(keys) === JSON.stringify(['fabric', 'silhouette']),
    'в `details` теперь ОБЕ строки — принятие дописало, а не заменило',
    JSON.stringify(keys),
  );
  ck((await rowState('general:silhouette')) === 'same', 'строка сама стала `same` — предложить второй раз нечем');
}

// ─── ЦИТАТА B ──────────────────────────────────────────────────────────────────────────────────
head('цитата B — стирание невозможно: молчание модели не выразимо как запись');
{
  ck(
    (await val('[data-c19-detail=fabric]')) === 'cotton jersey',
    'СОСЕДНЕЕ ПОЛЕ НЕ ТРОНУТО принятием силуэта',
    await val('[data-c19-detail=fabric]'),
  );
  const ids = await rowIds();
  ck(
    !ids.some((i) => i.startsWith('aspect:topstitching') || i.startsWith('aspect:pockets')),
    'о чём модель молчала — строки НЕТ ВОВСЕ (нет строки ⇒ нет чипа ⇒ нет записи)',
    ids.join(', '),
  );
  const accepts = await page.$$eval('[data-c19-draft-accept]', (els) => els.length);
  const offered = (
    await Promise.all(ids.map(async (i) => ({ i, s: await rowState(i) })))
  ).filter((r) => r.s !== 'same').length;
  ck(
    accepts === offered,
    'чипов приёма РОВНО столько же, сколько предложенных строк — «принять всё» не существует',
    `${accepts} чипов на ${offered} строк`,
  );
  // Принять ВСЁ, что предложено, по одной строке — и убедиться, что ничего не пропало.
  const beforeAll = await formState();
  for (const id of await rowIds()) {
    const sel = `[data-c19-draft-accept="${id}"]`;
    if (await has(sel)) await page.click(sel);
  }
  const afterAll = await formState();
  ck(
    afterAll.concept === beforeAll.concept && afterAll.concept === FIXTURE.concept,
    'концепт побайтово тот же после ВСЕХ принятий',
    JSON.stringify(afterAll.concept),
  );
  ck(
    (afterAll.details ?? []).some((d) => d.key === 'fabric'),
    'строка `fabric` жива в `details` после всех принятий',
  );
  ck(
    (afterAll.callouts ?? []).some((c) => c.clientRef === EXISTING_CALLOUT_REF && c.number === 4),
    'существующее указание не тронуто: тот же client_ref, тот же номер',
  );
  ck(
    (afterAll.callouts ?? []).length >= (beforeAll.callouts ?? []).length,
    'список указаний только рос',
    `${(beforeAll.callouts ?? []).length} → ${(afterAll.callouts ?? []).length}`,
  );
}

// ─── ЦИТАТА C ──────────────────────────────────────────────────────────────────────────────────
// Пере-монтаж: цитата B принимала всё подряд, а C спрашивает про состояние ДО клика по ткани.
head('цитата C — `replace` требует своего клика и печатает старое значение на строке');
await mount();
await press();
{
  ck((await rowState('general:fabric')) === 'replace', 'строка ткани — `replace`', await rowState('general:fabric'));
  ck(
    (await rowText('general:fabric')).includes('was: cotton jersey'),
    'на строке напечатано старое значение — это и есть весь дифф',
    (await rowText('general:fabric')).replace(/\s+/g, ' '),
  );
  await page.click('[data-c19-draft-accept="general:silhouette"]');
  ck(
    (await val('[data-c19-detail=fabric]')) === 'cotton jersey',
    'клик по СОСЕДНЕЙ строке ткань не поменял',
    await val('[data-c19-detail=fabric]'),
  );
  await page.click('[data-c19-draft-accept="general:fabric"]');
  ck(
    (await val('[data-c19-detail=fabric]')) === FABRIC,
    'свой клик — и только он — меняет ткань',
    await val('[data-c19-detail=fabric]'),
  );
}

// ─── ЦИТАТА D ──────────────────────────────────────────────────────────────────────────────────
head('цитата D — списки только дополняются, строка рождается конструктором');
await mount();
await press();
{
  const dupId = (await rowIds()).find((i) => i.startsWith('callout:') && i.includes('sideseam'));
  ck(!!dupId, 'совпавшее указание вообще есть на экране', String(dupId));
  ck((await rowState(dupId)) === 'same', 'и оно `same` — дедуп по имени сработал');
  ck(!(await has(`[data-c19-draft-accept="${dupId}"]`)), 'у `same` НЕТ чипа приёма');

  const newId = (await rowIds()).find((i) => i.startsWith('callout:') && i.includes('neckbinding'));
  ck(!!newId, 'новое указание предложено', String(newId));
  await page.click(`[data-c19-draft-accept="${newId}"]`);
  const f = await formState();
  ck((f.callouts ?? []).length === 2, 'указание ДОПИСАНО в конец', String((f.callouts ?? []).length));
  const born = (f.callouts ?? [])[1] ?? {};
  ck(born.number === 0, 'у рождённой строки номер 0 — сервер сминтит', String(born.number));
  ck(
    typeof born.clientRef === 'string' && born.clientRef.length > 0 && born.clientRef !== EXISTING_CALLOUT_REF,
    'у неё СВЕЖИЙ client_ref (гейт минта на сервере)',
    String(born.clientRef),
  );
  ck(born.mediaId === 0, 'она НЕПРИКОЛОТА — пин ставит рука, не модель', String(born.mediaId));
  ck(born.part === 'neck binding', 'имя из предложения легло в `part`', String(born.part));
  ck(
    Array.isArray(born.parts) && born.parts[0] === 'neck binding',
    '`parts[0]` рождено В ПАРЕ с `part` — связь «деталь ↔ указание» идёт по имени',
    JSON.stringify(born.parts),
  );

  const ids = await rowIds();
  ck(
    ids.includes('aspect:collar'),
    'ПОДПИСЬ аспекта («Collar / Neckline») свёрнута в стандартный ключ `collar`',
    ids.join(', '),
  );
  ck(ids.includes('aspect:vent'), 'самодельный ключ принят как есть, а не выброшен', ids.join(', '));
  ck(
    ids.filter((i) => i === 'aspect:collar').length === 1,
    'один ключ — одна строка: второе предложение того же аспекта отброшено',
  );

  const bomId = (await rowIds()).find((i) => i.startsWith('bom:'));
  ck(!!bomId, 'строка спецификации предложена', String(bomId));
  await page.click(`[data-c19-draft-accept="${bomId}"]`);
  const g = await formState();
  const line = (g.bomItems ?? [])[0] ?? {};
  ck((g.bomItems ?? []).length === 1, 'строка BOM дописана', String((g.bomItems ?? []).length));
  ck(
    typeof line.lineKey === 'string' && line.lineKey.length === 26,
    'у неё свежий ULID `line_key` — личность строки под upsert',
    String(line.lineKey),
  );
  ck(line.materialId === 0, 'артикул НЕ привязан: id — заявка про нашу базу', String(line.materialId));
  ck(line.name === 'main fabric', 'роль строки — из предложения', String(line.name));
  ck(line.pantone === '19-4005 TCX', 'пантон строки доехал (он же теряется молча)', String(line.pantone));
}

// ─── ЦИТАТА E + КОНТРОЛЬ ───────────────────────────────────────────────────────────────────────
head('цитата E — концепт не спорит с дизайнером; контроль — счётчик и отказ словами');
{
  const ids = await rowIds();
  ck(!ids.includes('general:concept'), 'модель предложила концепт, карточка непуста ⇒ строки НЕТ', ids.join(', '));
  const count = await page.$eval('[data-c19-draft-count]', (e) => e.innerText);
  ck(/\d+ proposed · \d+ taken · \d+ dismissed/.test(count.replace(/\s+/g, ' ')), 'счётчик на месте', count);
  // ЧИСЛО ПРЕДЛОЖЕННОГО НЕ УМЕНЬШАЕТСЯ ОТ ТОГО, ЧТО ПРЕДЛОЖЕННОЕ ПРИНЯЛИ.
  await mount();
  await press();
  const first = (await page.$eval('[data-c19-draft-count]', (e) => e.innerText)).match(/(\d+)\s*proposed/)[1];
  await page.click('[data-c19-draft-accept="general:silhouette"]');
  const second = await page.$eval('[data-c19-draft-count]', (e) => e.innerText);
  ck(
    second.replace(/\s+/g, ' ').startsWith(`${first} proposed · 1 taken`),
    'после принятия «proposed» то же число, «taken» выросло',
    `${first} → ${second.replace(/\s+/g, ' ')}`,
  );
  await page.click('[data-c19-draft-dismiss="general:fit"]');
  const third = await page.$eval('[data-c19-draft-count]', (e) => e.innerText);
  ck(
    third.replace(/\s+/g, ' ') === `${first} proposed · 1 taken · 1 dismissed`,
    'отказ по строке — тоже квитанция, и он считается отдельно',
    third.replace(/\s+/g, ' '),
  );
  ck(await has('[data-c19-draft-missing]'), '«what deserves a pin» напечатан — совет без чипов');

  // Отказ сервера обязан прозвучать СЛОВАМИ, а не «ничего не произошло».
  await mount();
  await page.evaluate(() => {
    window.__c19Stub = { draft: { mode: 'error', text: 'the answer was cut off — fewer pictures' } };
  });
  await page.evaluate(() => {
    const root = document.querySelector('[data-c19-draft]');
    const btn = [...root.querySelectorAll('button')].find((b) =>
      (b.textContent || '').toLowerCase().includes('draft the construction'),
    );
    btn?.click();
  });
  await page.waitForFunction(() => window.__c19.alerts().length > 0, { timeout: 5000 }).catch(() => {});
  const alerts = await page.evaluate(() => window.__c19.alerts());
  ck(
    alerts.some((a) => a.includes('cut off')),
    'серверная проза напечатана ДОСЛОВНО, а не пересказана',
    JSON.stringify(alerts),
  );
  ck(!(await has('[data-c19-draft-row]')), 'и ни одной строки предложения после отказа');
}

// ─── ОТКАЗЫ §4 ─────────────────────────────────────────────────────────────────────────────────
// ГЕЙТ, КОТОРЫЙ НИКОГДА НЕ СРАБАТЫВАЕТ, НЕВОЗМОЖНО ОТЛИЧИТЬ ОТ ОТСУТСТВУЮЩЕГО. Обе двери здесь
// проверяются на ЖИВОМ отказе: инертная дверь несёт повод в `data-inert`, а не просто гаснет.
head('отказы — дверь называет повод, а не молча гаснет');
{
  await mount();
  await page.evaluate(() => window.__c19.dirtyBoard());
  const dirtyReason = await page
    .$eval('[data-c19-draft] [data-inert]', (e) => e.getAttribute('data-inert'))
    .catch(() => null);
  ck(
    (dirtyReason ?? '').includes('save the card first'),
    'несохранённая доска — «save the card first»: прогон читает СОХРАНЁННУЮ карточку',
    String(dirtyReason),
  );

  await page.evaluate(
    ([response]) => {
      window.__c19Stub = { draft: { mode: 'ok', response } };
      // Карточка без единой картинки, без описания и без записок — читать нечего.
      window.__c19.mount({ moodboardMedia: [], concept: '', callouts: [], details: [], bomItems: [] });
    },
    [RESPONSE],
  );
  await page.waitForSelector('[data-c19-draft]');
  const emptyReason = await page
    .$eval('[data-c19-draft] [data-inert]', (e) => e.getAttribute('data-inert'))
    .catch(() => null);
  ck(
    (emptyReason ?? '').includes('there is nothing to read'),
    'пустая доска — «there is nothing to read», теми же словами, что у сервера',
    String(emptyReason),
  );
  // ⚠ СЧИТАЕТСЯ ИМЕННО ПЛАТНЫЙ ВЫЗОВ, А НЕ «сеть молчала». Соседний орган общих сведений тянет
  // свой список моделей на каждом монтаже, и проверка «список вызовов пуст» краснела бы от
  // ДЕКОРАЦИИ — то есть сторожила бы не тот орган (`probe-textcontent-false-green`, та же порода).
  const calls = await page.evaluate(() => window.__c19Calls);
  ck(
    calls.filter((m) => m === 'DraftDesignIdea').length === 0,
    'КОНТРОЛЬ: за инертной дверью НИ ОДНОГО платного вызова не ушло',
    calls.join(', ') || '(сеть молчала совсем)',
  );
}

await browser.close();

console.log(
  `\n${bad === 0 ? 'ЗЕЛЕНО' : 'КРАСНО'}: ${total - bad} / ${total} проверок прошло, провалов ${bad}` +
    (MUTATIONS.length ? ` (прогон С МУТАЦИЕЙ ${MUTATIONS.join(' ')} — провалы ожидаются)` : ''),
);
process.exit(bad === 0 ? 0 : 1);
