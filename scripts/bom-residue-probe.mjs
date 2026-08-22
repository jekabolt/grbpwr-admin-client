#!/usr/bin/env node
// ЛИЧНОСТЬ СТРОКИ BOM ПЕРЕЖИВАЕТ ОТКРЫТИЕ КАРТОЧКИ — ЖИВОЙ РЕДАКТОР, А НЕ РАССУЖДЕНИЕ О НЁМ.
//
// Дыра Д2 гэп-анализа: четыре mount-эффекта в `SlotIdentityFields` стирали назначение, вид и оба
// их примечания у строки, «неконсистентной» клиентской карте разделов. Два писали с
// `shouldDirty: true`, ДВА — с `shouldDirty: false`, и вот эти два были худшим видом потери из
// возможных: форма не пачкалась, «unsaved changes» не загоралось, а пустота уезжала со следующим
// сохранением по любому другому поводу — UPDATE'ом поверх сохранённого примечания, потому что BOM
// пишется upsert'ом по `line_key`.
//
// Проба закрывает ровно то, что стало вместо них:
//   1. заполненное-но-чужое СТОИТ СТРОКОЙ полосы, а не исчезает и не молчит;
//   2. [clear] действительно стирает — стирание переехало к человеку, а не пропало;
//   3. открытие строки НЕ ПАЧКАЕТ форму (единственная проверка, ловящая возвращённый эффект по
//      ПОВЕДЕНИЮ, а не по разметке);
//   4. чужой вид на законной секции назван вслух самим селектом, а не пустым триггером;
//   5. маппер везёт заполненное примечание, а не зануляет его по чужому владельцу.
//
// ОРГАНЫ ИЩУТСЯ ПО `data-field`: тот же атрибут стоит и на настоящих контролах (его штампует
// `FormItem`), и на строках полосы, поэтому «контрол» здесь — это ВСЕ узлы пути МИНУС те, что
// внутри `[data-residue-strip]`. Текст селекта читается С САМОГО ТРИГГЕРА: Radix кладёт рядом с
// ним скрытый нативный `<select>` со всеми пунктами, и textContent коробки поля склеивает весь
// словарь секции — проверка «триггер называет значение» зеленела бы на любом значении вообще.
// Ловушка поймана прямо здесь (первая редакция читала коробку) и закрыта отрицательной
// проверкой «в тексте триггера нет слова из списка пунктов».
//
//   node scripts/bom-residue-probe.mjs                   прогон
//   node scripts/bom-residue-probe.mjs --mutate=effect-purpose
//   node scripts/bom-residue-probe.mjs --mutate=effect-note
//   node scripts/bom-residue-probe.mjs --mutate=effect-kind
//   node scripts/bom-residue-probe.mjs --mutate=effect-kind-note
//   node scripts/bom-residue-probe.mjs --mutate=mapper-note
//
// МУТАЦИЯ ЖИВЁТ В ПАМЯТИ СБОРЩИКА, А НЕ В ФАЙЛЕ: правка исходника ради проверки — это правка,
// которую однажды забудут откатить. Каждая ВОЗВРАЩАЕТ одно из снятых стираний.
//
// РЕЗУЛЬТАТЫ ПРОГОНОВ МУТАЦИЙ (2026-08-22, ветка feat/operation-kinds-ui):
//   effect-purpose   — 9 провалов. Откатано.
//   effect-note      — 3 провала.  Откатано.
//   effect-kind      — 7 провалов. Откатано.
//   effect-kind-note — 3 провала.  Откатано.
//   mapper-note      — 1 провал.   Откатано.
//
// СЕКЦИЯ 3-БИС ДОБАВЛЕНА САМОЙ МУТАЦИЕЙ, И ЭТО ГЛАВНЫЙ УРОК ПРОБЫ. Первый прогон
// `--mutate=effect-note` — возврат самого тихого из четырёх стираний, того, что писало с
// `shouldDirty: false`, — остался ЗЕЛЁНЫМ: во всех тогдашних секциях назначение было «другим»,
// а на «другом» этот эффект не срабатывает вовсе. То есть сторож не видел ровно того дефекта,
// ради которого писался. Клетка добавлена, мутация теперь даёт 3 провала — и ни один из них не
// про грязную форму: `isDirty` под этой мутацией остаётся false, потому что в том и был весь
// ужас. Проверять такое можно ТОЛЬКО по наличию значения и строки, не по пометке «изменено».
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден:
// гейт, который нельзя выполнить, не красит сборку в красный.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const MUTATE = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').slice('--mutate='.length);

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {}
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

const entryPw = resolvePlaywright();
if (!entryPw) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const mod = await import(entryPw);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `bom-residue-${process.pid}.js`);

// Якорь вставки — первая строка ПОСЛЕ снятых эффектов. Мутация вписывает эффект обратно ровно
// туда, где он стоял.
const ANCHOR = '  const purposeSet = !!rowPurpose && rowPurpose !== UNSET_PURPOSE;';
const EFFECT_PURPOSE =
  '  useEffect(() => {\n' +
  '    if (!rollGoods && rowPurpose && rowPurpose !== UNSET_PURPOSE) {\n' +
  "      setValue('bomItems.' + index + '.purpose', UNSET_PURPOSE, { shouldDirty: true });\n" +
  '    }\n' +
  '  }, [rollGoods, rowPurpose, index, setValue]);\n';
const EFFECT_NOTE =
  '  useEffect(() => {\n' +
  '    if (!isOtherPurpose(rowPurpose)) {\n' +
  "      setValue('bomItems.' + index + '.purposeNote', '', { shouldDirty: false });\n" +
  '    }\n' +
  '  }, [rowPurpose, index, setValue]);\n';
const EFFECT_KIND =
  '  useEffect(() => {\n' +
  '    if (!rowKind || rowKind === UNSET_KIND) return;\n' +
  '    const homeBack = KIND_HOME_SECTION[rowKind];\n' +
  '    if (!kindEligible || (homeBack && homeBack !== rowSection)) {\n' +
  "      setValue('bomItems.' + index + '.kind', UNSET_KIND, { shouldDirty: true });\n" +
  '    }\n' +
  '  }, [kindEligible, rowKind, rowSection, index, setValue]);\n';
const EFFECT_KIND_NOTE =
  '  useEffect(() => {\n' +
  "    if (rowKind !== 'TECH_CARD_BOM_KIND_OTHER') {\n" +
  "      setValue('bomItems.' + index + '.kindNote', '', { shouldDirty: false });\n" +
  '    }\n' +
  '  }, [rowKind, index, setValue]);\n';
const INJECTIONS = {
  'effect-purpose': EFFECT_PURPOSE,
  'effect-note': EFFECT_NOTE,
  'effect-kind': EFFECT_KIND,
  'effect-kind-note': EFFECT_KIND_NOTE,
};
const MAPPER_FIX = "      purposeNote: b.purposeNote?.trim() ?? '',";
const MAPPER_BROKEN = "      purposeNote: isOtherPurpose(b.purpose) ? b.purposeNote?.trim() ?? '' : '',";

function mutationPlugin(kind) {
  const inField = !!INJECTIONS[kind];
  if (!inField && kind !== 'mapper-note') throw new Error(`неизвестная мутация: ${kind}`);
  const file = inField ? /bom-field\.tsx$/ : /schema\.ts$/;
  return {
    name: `bom-residue-mutation-${kind}`,
    setup(b) {
      b.onLoad({ filter: file }, async (args) => {
        const src = await readFile(args.path, 'utf8');
        if (inField) {
          if (!src.includes(ANCHOR)) throw new Error(`мутация не нашла якорь в ${args.path}`);
          return { contents: src.replace(ANCHOR, INJECTIONS[kind] + ANCHOR), loader: 'tsx' };
        }
        if (!src.includes(MAPPER_FIX)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
        return { contents: src.replace(MAPPER_FIX, MAPPER_BROKEN), loader: 'ts' };
      });
    },
  };
}

await esbuild({
  entryPoints: [resolve(HERE, 'bom-residue-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  plugins: MUTATE ? [mutationPlugin(MUTATE)] : [],
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

const S = {
  FABRIC: 'TECH_CARD_BOM_SECTION_FABRIC',
  INTERLINING: 'TECH_CARD_BOM_SECTION_INTERLINING',
  THREAD: 'TECH_CARD_BOM_SECTION_THREAD',
  TRIM: 'TECH_CARD_BOM_SECTION_TRIM',
  HARDWARE: 'TECH_CARD_BOM_SECTION_HARDWARE',
};
const P = {
  MAIN: 'TECH_CARD_BOM_PURPOSE_MAIN',
  OTHER: 'TECH_CARD_BOM_PURPOSE_OTHER',
  UNSET: 'TECH_CARD_BOM_PURPOSE_UNSET',
};
const K = {
  ZIPPER: 'TECH_CARD_BOM_KIND_ZIPPER',
  OTHER: 'TECH_CARD_BOM_KIND_OTHER',
  UNSET: 'TECH_CARD_BOM_KIND_UNSET',
};

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 2000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

let mounted = false;
async function boot() {
  if (mounted) return;
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  mounted = true;
}
async function mount(line) {
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.evaluate((l) => window.__bom.mount(l), line);
  await page.waitForSelector('[data-slot-identity] [data-field="bomItems.0.section"]', {
    timeout: 15000,
  });
}

const RES = (name) => `[data-residue-strip] [data-field="bomItems.0.${name}"]`;
const has = async (sel) => (await page.locator(sel).count()) > 0;
const textOf = async (sel) =>
  (await has(sel)) ? ((await page.locator(sel).first().textContent()) ?? '').trim() : '';
// Контрол — это узел пути ВНЕ полосы. Считаем разностью, а не `:not(a b)`: результат не зависит
// от того, какие сложные селекторы понимает движок.
const nodes = (name) => page.locator(`[data-field="bomItems.0.${name}"]`).count();
const resNodes = (name) => page.locator(RES(name)).count();
const hasCtrl = async (name) => (await nodes(name)) - (await resNodes(name)) > 0;
// ТЕКСТ ЧИТАЕТСЯ С САМОГО ТРИГГЕРА, А НЕ С КОРОБКИ ПОЛЯ. Radix кладёт рядом с триггером скрытый
// нативный `<select>` со ВСЕМИ пунктами, и textContent обёртки склеивает весь словарь секции —
// проверка «триггер называет значение» позеленела бы на любом значении вообще (та самая ложная
// зелень по textContent, которую этот репозиторий уже ловил).
const triggerText = async (name) =>
  (
    (await page
      .locator(`[data-field="bomItems.0.${name}"] button[role="combobox"]`)
      .first()
      .textContent()) ?? ''
  ).trim();
const values = () => page.evaluate(() => window.__bom.values());
const dirty = () => page.evaluate(() => window.__bom.dirty());

// ── 1. ЦИТАТА: НЕЛЕГАЛЬНОЕ ПО КЛИЕНТСКОЙ КАРТЕ ПЕРЕЖИВАЕТ ОТКРЫТИЕ И ВИДНО ЧЕЛОВЕКУ ───────────
// Форма прод-строки, переехавшей в чужую секцию: назначение «другое» + примечание к нему на
// НИТОЧНОЙ строке. Ровно та пара, которую снятые эффекты стирали — вторую из них молча.
head('1. ниточная строка с назначением и примечанием: две строки полосы вместо тишины');
await mount({
  name: 'main thread',
  section: S.THREAD,
  purpose: P.OTHER,
  purposeNote: 'подкладочная бязь на подзоры',
});
ck(pageErrors.length === 0, 'блок личности смонтировался без исключений', pageErrors[0] ?? '');
ck(await has('[data-residue-strip]'), 'полоса остатков нарисована');
ck(await has(RES('purpose')), 'назначение стоит строкой остатка');
ck(
  (await textOf(RES('purpose'))).toLowerCase().includes('purpose'),
  'строка называет ПОЛЕ теми же словами, что контрол',
  await textOf(RES('purpose')),
);
ck(await has(RES('purposeNote')), 'примечание к назначению стоит строкой остатка');
ck(
  (await textOf(RES('purposeNote'))).includes('подзоры'),
  'строка называет значение примечания',
  await textOf(RES('purposeNote')),
);
ck(!(await hasCtrl('purpose')), 'контрола назначения на ниточной строке нет — оно и есть остаток');

head('1-бис. значения целы, форма чистая');
{
  const v = await values();
  ck(v.purpose === P.OTHER, 'назначение на месте, его никто не стёр', String(v.purpose));
  ck(
    typeof v.purposeNote === 'string' && v.purposeNote.includes('подзоры'),
    'примечание на месте — ЭТО ОНО ИСЧЕЗАЛО МОЛЧА',
    JSON.stringify(v.purposeNote),
  );
  const d = await dirty();
  ck(d.isDirty === false, 'открытие строки не сделало форму грязной', JSON.stringify(d));
  ck(d.fields.length === 0, 'ни одно поле строки не помечено правленым', d.fields.join(', '));
}

// ── 2. ЖЕСТ СНЯТИЯ РАБОТАЕТ ───────────────────────────────────────────────────────────────────
head('2. [clear] снимает значение, убирает строку и пачкает форму — потому что правил человек');
{
  const clearable = await has(`${RES('purposeNote')} button`);
  ck(clearable, 'у строки примечания есть [clear]');
  if (clearable) {
    await page.locator(`${RES('purposeNote')} button`).first().click();
    await page.waitForTimeout(150);
    const v = await values();
    ck(v.purposeNote === '', 'после [clear] примечание пусто', JSON.stringify(v.purposeNote));
    ck(!(await has(RES('purposeNote'))), 'строка ушла вместе со значением');
    ck(await has(RES('purpose')), 'соседний остаток [clear] не тронул — одна правка на нажатие');
    ck(v.purpose === P.OTHER, 'и значение соседа цело', String(v.purpose));
    ck((await dirty()).isDirty === true, 'ТЕПЕРЬ форма грязная');
  }
  const clearable2 = await has(`${RES('purpose')} button`);
  ck(clearable2, 'у строки назначения есть [clear]');
  if (clearable2) {
    await page.locator(`${RES('purpose')} button`).first().click();
    await page.waitForTimeout(150);
    ck((await values()).purpose === P.UNSET, 'после [clear] назначение снято в UNSET');
    ck(!(await has('[data-residue-strip]')), 'полосы больше нет — остатков не осталось');
  }
}

// ── 3. КОНСИСТЕНТНАЯ СТРОКА ПОЛОСЫ НЕ ПОКАЗЫВАЕТ ──────────────────────────────────────────────
head('3. рулонная строка со своим назначением: полосы нет вовсе');
await mount({ name: 'main fabric', section: S.FABRIC, purpose: P.MAIN });
ck(!(await has('[data-residue-strip]')), 'полосы нет');
ck(await hasCtrl('purpose'), 'назначение стоит своим контролом');
ck((await dirty()).isDirty === false, 'и здесь открытие не пачкает форму');

// ── 3-БИС. ПРИМЕЧАНИЕ К НАЗНАЧЕНИЮ, ОСИРОТЕВШЕЕ ПРИ ЗАКОННОМ НАЗНАЧЕНИИ ───────────────────────
// ЭТУ КЛЕТКУ ПРОБА СНАЧАЛА НЕ ЗАКРЫВАЛА, И МУТАЦИЯ ЭТО ПОКАЗАЛА. Первый прогон
// `--mutate=effect-note` (возврат стирания примечания с `shouldDirty: false`) остался ЗЕЛЁНЫМ:
// секция 1 монтирует строку с назначением «другое», а возвращённый эффект на «другом» не
// срабатывает вовсе. То есть ровно тот эффект, который гэп-анализ назвал самым тихим видом
// потери, был невидим и для сторожа. Здесь стоит строка, на которой он срабатывает: секция
// рулонная (назначение живёт своим контролом), назначение — НЕ «другое», а примечание от него
// осталось.
head('3-бис. примечание к назначению при назначении ≠ «другое» (клетка тихого эффекта)');
await mount({ name: 'shell', section: S.FABRIC, purpose: P.MAIN, purposeNote: 'подзоры' });
ck(await hasCtrl('purpose'), 'само назначение стоит контролом — секция рулонная');
ck(!(await hasCtrl('purposeNote')), 'контрола примечания нет: оно принадлежит только «другому»');
ck(await has(RES('purposeNote')), 'примечание стоит строкой остатка');
ck(
  (await textOf(RES('purposeNote'))).includes('подзоры'),
  'строка называет значение',
  await textOf(RES('purposeNote')),
);
ck(
  typeof (await values()).purposeNote === 'string' &&
    (await values()).purposeNote.includes('подзоры'),
  'значение цело — ЭТО ОНО ИСЧЕЗАЛО БЕЗ ПОМЕТКИ «ИЗМЕНЕНО»',
  JSON.stringify((await values()).purposeNote),
);
ck((await dirty()).isDirty === false, 'и форма от открытия не запачкалась');

// ── 4. ЧУЖОЙ ВИД НА ЗАКОННОЙ СЕКЦИИ — СЕЛЕКТ НАЗЫВАЕТ ЕГО ВСЛУХ ────────────────────────────────
// Клетка, которой полоса НЕ ловит: секция принимает виды, контрол на экране есть, а значения в
// его списке нет. Пустой триггер над непустым значением — это экран, который врёт.
head('4. вид из чужого дома на секции trim: контрол есть, значение названо');
await mount({ name: 'zip tape', section: S.TRIM, kind: K.ZIPPER });
ck(await hasCtrl('kind'), 'контрол вида на экране');
ck(!(await has(RES('kind'))), 'в полосу такая строка НЕ попадает — иначе значение стояло бы дважды');
ck((await values()).kind === K.ZIPPER, 'значение цело', String((await values()).kind));
{
  const t = await triggerText('kind');
  ck(t.toLowerCase().includes('zipper'), 'триггер называет само значение, а не пустоту', t);
  ck(t.toLowerCase().includes('hardware'), 'и называет секцию, которой оно принадлежит', t);
  // Контрольный отрицательный: если бы текст читался с коробки поля, сюда приехал бы весь словарь
  // секции из скрытого нативного select'а — и обе проверки выше были бы ложной зеленью.
  ck(!t.toLowerCase().includes('elastic'), 'и это ТРИГГЕР, а не склеенный список пунктов', t);
}

head('4-бис. чужой пункт нельзя выбрать заново');
{
  await page.locator('[data-field="bomItems.0.kind"] button[role="combobox"]').first().click();
  await page.waitForTimeout(200);
  const opt = page.locator('[role="option"]').filter({ hasText: 'belongs to hardware' });
  ck((await opt.count()) === 1, 'пункт стоит в списке ровно один раз', String(await opt.count()));
  if ((await opt.count()) > 0) {
    ck(
      (await opt.first().getAttribute('data-disabled')) !== null,
      'и он отключён — значение названо, но не предлагается снова',
    );
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

head('4-тер. вид, живущий в СВОЕЙ секции, никакой пометки не получает');
await mount({ name: 'main zip', section: S.HARDWARE, kind: K.ZIPPER });
{
  const t = await triggerText('kind');
  ck(t.toLowerCase().includes('zipper'), 'триггер называет значение', t);
  ck(!t.toLowerCase().includes('belongs to'), 'и НЕ обещает чужого дома там, где дом свой', t);
}

// ── 5. ВИД НА СЕКЦИИ, КОТОРАЯ ВИДОВ НЕ ПРИНИМАЕТ ──────────────────────────────────────────────
head('5. вид на рулонной строке: контрола нет вовсе, значение — строкой полосы');
await mount({ name: 'shell', section: S.FABRIC, kind: K.ZIPPER });
ck(!(await hasCtrl('kind')), 'контрола вида на рулонной строке нет');
ck(await has(RES('kind')), 'вид стоит строкой остатка');
ck(
  (await textOf(RES('kind'))).toLowerCase().includes('zipper'),
  'строка называет значение подписью словаря, а не токеном',
  await textOf(RES('kind')),
);
ck((await values()).kind === K.ZIPPER, 'и значение цело');

// ── 6. ПРИМЕЧАНИЕ К ВИДУ, ОСИРОТЕВШЕЕ ПРИ ЖИВОМ ВИДЕ ──────────────────────────────────────────
// Второй из двух «тихих» эффектов: секция законна, вид законен и стоит контролом, а примечание
// принадлежало виду «другое» и осталось от него. Стиралось БЕЗ пометки «изменено».
head('6. примечание к виду при виде ≠ «другое»');
await mount({ name: 'main zip', section: S.HARDWARE, kind: K.ZIPPER, kindNote: 'спираль №5' });
ck(await hasCtrl('kind'), 'сам вид стоит контролом — секция ему родная');
ck(!(await hasCtrl('kindNote')), 'контрола примечания нет: примечание принадлежит только «другому»');
ck(await has(RES('kindNote')), 'примечание к виду стоит строкой остатка');
ck(
  (await textOf(RES('kindNote'))).includes('спираль'),
  'строка называет значение',
  await textOf(RES('kindNote')),
);
ck(
  typeof (await values()).kindNote === 'string' && (await values()).kindNote.includes('спираль'),
  'значение цело — ЭТО ОНО ИСЧЕЗАЛО БЕЗ ПОМЕТКИ «ИЗМЕНЕНО»',
);
ck((await dirty()).isDirty === false, 'и форма от открытия не запачкалась');

// ── 7. ОТКАЗ ЛОЖИТСЯ НА СТРОКУ ПОЛОСЫ, А НЕ В НИКУДА ──────────────────────────────────────────
head('7. zod отвергает остаток по имени, и отказ виден в той же строке');
await mount({ name: 'main thread', section: S.THREAD, purpose: P.MAIN });
await page.evaluate(() => window.__bom.trigger());
await page.waitForTimeout(200);
ck(
  (await page.locator(RES('purpose')).count()) === 1,
  'строка одна: остаток и его отказ не раздваиваются',
);
ck(
  (await textOf(RES('purpose'))).toLowerCase().includes('only a fabric line'),
  'строка цитирует текст отказа',
  await textOf(RES('purpose')),
);

head('7-бис. catch-строка: отказ на пустом поле без контрола');
await mount({ name: 'main thread', section: S.THREAD });
ck(!(await has('[data-residue-strip]')), 'до отказа полосы нет');
await page.evaluate(() =>
  window.__bom.setError('bomItems.0.purpose', 'the server wants this line sorted'),
);
await page.waitForTimeout(150);
ck(await has(RES('purpose')), 'отказ на ПУСТОМ поле без контрола стоит catch-строкой полосы');
ck(
  (await textOf(RES('purpose'))).includes('wants this line sorted'),
  'строка цитирует серверный текст',
  await textOf(RES('purpose')),
);

head('7-тер. отказ на видимом контроле в полосу не попадает');
await mount({ name: 'shell', section: S.FABRIC, purpose: P.MAIN });
await page.evaluate(() => window.__bom.setError('bomItems.0.purpose', 'pick a purpose'));
await page.waitForTimeout(150);
ck(
  !(await has('[data-residue-strip]')),
  'отказ поля, чей контрол на экране, живёт на контроле, а не строкой полосы',
);

// ── 8. МАППЕР ВЕЗЁТ ЗАПОЛНЕННОЕ, А НЕ ЗАНУЛЯЕТ ЕГО ────────────────────────────────────────────
// Полоса без этого куска была бы обещанием, которого маппер не держит: строка говорит «уезжает на
// сохранение как есть», а на проводе примечание превращалось в пустую строку — то есть в UPDATE,
// затирающий сохранённое.
head('8. форма → провод: примечание чужого владельца доезжает целым');
await boot();
{
  const out = await page.evaluate(() =>
    window.__bom.mapOut({
      name: 'main thread',
      section: 'TECH_CARD_BOM_SECTION_THREAD',
      purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
      purposeNote: 'подзоры',
      kind: 'TECH_CARD_BOM_KIND_ZIPPER',
      kindNote: 'спираль №5',
    }),
  );
  ck(out.purposeNote === 'подзоры', 'примечание к назначению на проводе', JSON.stringify(out));
  ck(out.kindNote === 'спираль №5', 'примечание к виду на проводе', JSON.stringify(out.kindNote));
  ck(out.purpose === 'TECH_CARD_BOM_PURPOSE_MAIN', 'само назначение едет как есть');
  ck(out.kind === 'TECH_CARD_BOM_KIND_ZIPPER', 'сам вид едет как есть');
}

head('8-бис. законная пара не портится тем же законом');
{
  const out = await page.evaluate(() =>
    window.__bom.mapOut({
      name: 'shell',
      section: 'TECH_CARD_BOM_SECTION_FABRIC',
      purpose: 'TECH_CARD_BOM_PURPOSE_OTHER',
      purposeNote: 'подзоры',
    }),
  );
  ck(out.purposeNote === 'подзоры', 'примечание при «другом» доезжает');
  ck(out.kindNote === '', 'пустое примечание к виду остаётся пустым', JSON.stringify(out.kindNote));
}

await browser.close();
console.log(`\n${bad === 0 ? 'проба зелёная' : `провалов: ${bad}`}`);
process.exit(bad === 0 ? 0 : 1);
