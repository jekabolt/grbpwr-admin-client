#!/usr/bin/env node
// РЕЕСТР PLAYGROUND: ТЕЛО, КОТОРОЕ УЕЗЖАЕТ, ОТКАЗЫ ДО ДЕНЕГ, СТАРЫЙ АДРЕС, ВОРОТА, РЕКОЛ (C-05).
//
// Зачем проба. `wire()` плитки — единственный писатель платного запроса (registry/types.ts), и
// ломается он молча: форма рисуется, кнопка жмётся, а на провод уезжает другое тело — не та
// обрезка слов, не тот список картинок, не тот пресет. Ни типы, ни сборка этого не видят.
//
// ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ (все утверждения — о РЕЗУЛЬТАТЕ настоящих модулей, ожидаемые тела написаны
// РУКАМИ, а не собраны из тех же функций):
//   A · wire(): тело на заполненный черновик у трёх плиток — change_color (recolor), remove_background
//       (cutout), create_edit (freeform/free) — равно ожидаемому ЦЕЛИКОМ, каждое поле
//       DesignRunParams;
//   B · validate(): отказы до денег — нет фото, больше 24 фото, нет Pantone, пустой промпт,
//       ноль референсов у create_edit; и заполненный черновик проходит (без этого «отказывает
//       всегда» было бы зелёным);
//   C · legacyStep('aside') → playground + change_color; прочие значения — не старые шаги;
//   D · возможности: freeformPresets отсутствует / без 'cutout' / без 'free' → эти плитки
//       приглушены В РАЗМЕТКЕ сетки (не кнопка, без data-workflow-live, со словами причины),
//       openWorkflow их не открывает, история не сужается; change_color открыт всегда;
//       сужение истории: матчер открытой плитки — та же ссылка при каждом вызове (стабильность),
//       и он отбирает свои прогоны;
//   E · рекол: recolor → change_color, cutout → remove_background, freeform free → create_edit,
//       freeform add_hardware → честные слова, без падения; прочие роды → null.
//   F · (C-08) ворота фазы 2: playgroundWorkflows ЕСТЬ → живы ровно перечисленные плитки, и
//       freeformPresets не читается вовсе; пустой список гасит всё; ключа нет → «not wired»;
//   G · (C-08) params.image: тело create_edit на новом сервере (модель, качество, формат, фон),
//       auto → '', фон только у модели, которая его перечисляет, текст → картинка без референсов;
//       старый сервер (imageModels нет / пуст) — image не уезжает вовсе и ≥1 референс; плитка без
//       пикера (D6, плитки 2/3) — модель по умолчанию, quality '', и ничего при auto;
//   H · (C-08) защёлкивание формата: смена модели сносит выбор к ближайшей пропорции новой модели,
//       начальный 4:5 у модели без 4:5 показывается, печатается и уезжает как 3:4, уровень
//       переносится, если он есть у новой модели, иначе medium; строка шапки «<label> · <tier>»;
//   I · (C-08) разметка формы create_edit: сворачиваемые секции AI model и Format есть только на
//       сервере с моделями, строка «needs at least one» — только на старом.
//   J · (C-07) wire(): тела плиток 2, 3, 5, 6, 7 целиком — fabric_extract / ghost_mannequin с
//       моделью по умолчанию и форматом плитки, swap_fabrics = recolor с fabrics[] И эхом
//       fabric_media_id (картинка не с полки и ткань полки), add_logo = subject + logo + logo_size,
//       variations = creativity + движок; старый сервер — без image;
//   K · (C-07) validate(): отказы до денег у пяти плиток; слова плиток 2/3 необязательны;
//   L · (C-07) ворота: пять плиток живы ровно по playgroundWorkflows;
//   M · (C-07) прогон → плитка по правилу сервера (пресет, recolor + ткань с картинкой), штамп
//       run_workflow у заглушки вне страницы, матчеры результатов не делят картинку на две плитки;
//   N · (C-07) разметка форм пяти плиток (заголовки, REQUIRED, плейсхолдеры владельца, Logo size,
//       Creative booster «Off», складки AI model / Format только где им место);
//   O · (C-07) рекол: тело → черновик → то же тело у всех пяти плиток.
//   P · (C-09) плитка 1 Virtual Try-On: тело freeform/tryon целиком (роли model → product → scene,
//       options словарём сервера, image), сцена уезжает только «with reference», отказы до денег в
//       порядке двери (модель, продукт, 1..4, сцена, повтор картинки, чужой рендер колорвея),
//       ворота по playground_workflows, пулы пикеров (фото профиля = thumbnail ∪ media; рендеры
//       колорвея = выходы kind=render этого колорвея + его рендер-верстак), рекол, разметка формы.
//   Q · (C-11) Retouch a Zone: тело из набора мазков — оболочка кисти (диски, выпуклая оболочка,
//       4 знака) в items[0].regions[0], слова в texts[0], ask '', без image/options; оболочка
//       больше 12 углов — описанный 12-угольник, покрывающий всю краску; слишком мелкая — null;
//   R · (C-11) отказы маски до денег: не нарисовано → «paint the zone», мелко → «too small», нет
//       слов, картинка меньше 64 px; не нарисовано — items пуст (такое тело не уходит);
//   S · (C-11) ворота: плитка 10 жива только в playgroundWorkflows; угол mask в итогах — только
//       там же; панель плитки — объяснение и честная строка, без GENERATE; итоги под плиткой 10 —
//       все картинки комнаты.
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ, А НЕ В ФАЙЛЕ (приём colour-plan-probe): одна строка настоящего модуля
// подменяется в бандле, исходник не трогается. Каждая обязана уронить СВОЮ группу:
//   node scripts/playground-registry-probe.mjs                     прогон
//   node scripts/playground-registry-probe.mjs --mutate-wire        change_color перестаёт обрезать
//                                                                   слова `ask` → краснеет A
//   node scripts/playground-registry-probe.mjs --mutate-validate    потолок фото change_color +1
//                                                                   → краснеет B (25 фото)
//   node scripts/playground-registry-probe.mjs --mutate-legacy      'aside' ведёт в create_edit
//                                                                   → краснеет C
//   node scripts/playground-registry-probe.mjs --mutate-capability  «нет freeformPresets» читается
//                                                                   как «всё можно» → краснеет D
//   node scripts/playground-registry-probe.mjs --mutate-recall      cutout теряет свою плитку
//                                                                   → краснеет E
//   node scripts/playground-registry-probe.mjs --mutate-preset-match create_edit снова сверяет
//                                                                   пресет (G-01 m-3) → краснеет D
//   node scripts/playground-registry-probe.mjs --mutate-gate-legacy плитки фазы 1 читают
//                                                                   freeformPresets и при новом
//                                                                   списке → краснеет F
//   node scripts/playground-registry-probe.mjs --mutate-image-absent «нет imageModels» читается как
//                                                                   «есть модель по умолчанию»
//                                                                   → краснеет G
//   node scripts/playground-registry-probe.mjs --mutate-quality     тир не уезжает (quality '')
//                                                                   → краснеет G
//   node scripts/playground-registry-probe.mjs --mutate-snap        смена модели не защёлкивает
//                                                                   формат → краснеет H
//   node scripts/playground-registry-probe.mjs --mutate-snap-read   формат читается без
//                                                                   защёлкивания → краснеет H
//   node scripts/playground-registry-probe.mjs --mutate-drawn      сетка рисует и то, чего не
//                                                                   делает ни одна модель → краснеет H
//   node scripts/playground-registry-probe.mjs --mutate-sections    секции модели/формата рисуются
//                                                                   всегда → краснеет I
//   node scripts/playground-registry-probe.mjs --mutate-swap-echo   swap_fabrics теряет эхо
//                                                                   fabric_media_id → краснеет J
//   node scripts/playground-registry-probe.mjs --mutate-logo-role   логотип уезжает role=subject
//                                                                   → краснеет J
//   node scripts/playground-registry-probe.mjs --mutate-creativity  шаг бустера не уезжает
//                                                                   → краснеет J
//   node scripts/playground-registry-probe.mjs --mutate-format-default формат плитки 2 по умолчанию
//                                                                   2:3 вместо 1:1 → краснеет J
//   node scripts/playground-registry-probe.mjs --mutate-c07-validate swap пускает одну картинку в
//                                                                   оба слота → краснеет K
//   node scripts/playground-registry-probe.mjs --mutate-c07-gate    add_logo открыт без списка
//                                                                   → краснеет L
//   node scripts/playground-registry-probe.mjs --mutate-run-workflow recolor с тканью читается как
//                                                                   change_color → краснеет M
//   node scripts/playground-registry-probe.mjs --mutate-stamp       штамп run_workflow у заглушки
//                                                                   не читается → краснеет M
//   node scripts/playground-registry-probe.mjs --mutate-tryon-role  продукт уезжает без роли
//                                                                   → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-tryon-scene картинка сцены уезжает и в
//                                                                   режиме edit → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-tryon-validate отказ «сцена без картинки»
//                                                                   снят → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-tryon-colourway рендеры любого колорвея
//                                                                   → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-tryon-photos фото профиля без thumbnail
//                                                                   → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-tryon-gate  плитка открыта и без списка
//                                                                   → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-tryon-vocab слово кадра не из словаря
//                                                                   сервера → краснеет P
//   node scripts/playground-registry-probe.mjs --mutate-mask-hull   точка мазка без диска кисти
//                                                                   → краснеет Q (тело)
//   node scripts/playground-registry-probe.mjs --mutate-mask-ring   оболочка >12 углов не
//                                                                   описывается → краснеет Q
//   node scripts/playground-registry-probe.mjs --mutate-mask-refusal «не нарисовано» не отказывает
//                                                                   само → краснеет R
//   node scripts/playground-registry-probe.mjs --mutate-mask-gate   ретушь «предложена» без
//                                                                   playgroundWorkflows → краснеет S
//
// C-10 (плитка 12 Image to 3D, STEP 5 уходит с рельса):
//   T · wire() / validate() / ворота / разметка / рекол плитки image_to_3d: тело режима референса
//       ЦЕЛИКОМ; опции уезжают только объявленные сервером (threed_options), иначе ''; pbr без
//       текстуры не уезжает никогда; follow — только если объявлен; колорвей — только у плиты
//       рендер-верстака; результаты — свой блок моделей, история — threed-прогоны, слово «3D runs»;
//   U · рельс: STEP 5 есть ровно у отвечающего сервера без playground_workflows (6 ячеек, «N of 6»),
//       у нового — 5 ячеек и «N of 5», пока сервер молчит — тоже 5; `?step=threed` переписывается
//       только у нового; defaultStep/nearestBlock на новом не называют threed.
//   node scripts/playground-registry-probe.mjs --mutate-threed-options  опции рисуются и уезжают без
//                                                                   слова сервера → краснеет T
//   node scripts/playground-registry-probe.mjs --mutate-threed-pbr  pbr уезжает и без текстуры
//                                                                   → краснеет T
//   node scripts/playground-registry-probe.mjs --mutate-threed-gate ворота не ждут threed_options
//                                                                   → краснеет T
//   node scripts/playground-registry-probe.mjs --mutate-threed-colorway колорвей плиты не
//                                                                   привязывается → краснеет T
//   node scripts/playground-registry-probe.mjs --mutate-rail-threed STEP 5 на рельсе всегда
//                                                                   → краснеет U
//   node scripts/playground-registry-probe.mjs --mutate-legacy-threed `?step=threed` переписывается
//                                                                   и у старого сервера → краснеет U
//   node scripts/playground-registry-probe.mjs --mutate-step-first  композитор спрашивает шаг раньше
//                                                                   старого адреса → краснеет U
//
// Проба СЧИТАЕТ ПРОВАЛЫ и печатает число исходов всегда: ноль провалов при упавшей сборке — это
// молчание, а не зелень.

import { build as esbuild } from 'esbuild';
import { rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const MUT = {
  wire: process.argv.includes('--mutate-wire'),
  validate: process.argv.includes('--mutate-validate'),
  legacy: process.argv.includes('--mutate-legacy'),
  capability: process.argv.includes('--mutate-capability'),
  recall: process.argv.includes('--mutate-recall'),
  presetMatch: process.argv.includes('--mutate-preset-match'),
  gateLegacy: process.argv.includes('--mutate-gate-legacy'),
  imageAbsent: process.argv.includes('--mutate-image-absent'),
  quality: process.argv.includes('--mutate-quality'),
  snap: process.argv.includes('--mutate-snap'),
  snapRead: process.argv.includes('--mutate-snap-read'),
  sections: process.argv.includes('--mutate-sections'),
  drawn: process.argv.includes('--mutate-drawn'),
  swapEcho: process.argv.includes('--mutate-swap-echo'),
  logoRole: process.argv.includes('--mutate-logo-role'),
  creativity: process.argv.includes('--mutate-creativity'),
  formatDefault: process.argv.includes('--mutate-format-default'),
  c07Validate: process.argv.includes('--mutate-c07-validate'),
  c07Gate: process.argv.includes('--mutate-c07-gate'),
  runWorkflow: process.argv.includes('--mutate-run-workflow'),
  stamp: process.argv.includes('--mutate-stamp'),
  tryonRole: process.argv.includes('--mutate-tryon-role'),
  tryonScene: process.argv.includes('--mutate-tryon-scene'),
  tryonValidate: process.argv.includes('--mutate-tryon-validate'),
  tryonColourway: process.argv.includes('--mutate-tryon-colourway'),
  tryonPhotos: process.argv.includes('--mutate-tryon-photos'),
  tryonGate: process.argv.includes('--mutate-tryon-gate'),
  tryonVocab: process.argv.includes('--mutate-tryon-vocab'),
  maskHull: process.argv.includes('--mutate-mask-hull'),
  maskRing: process.argv.includes('--mutate-mask-ring'),
  maskRefusal: process.argv.includes('--mutate-mask-refusal'),
  maskGate: process.argv.includes('--mutate-mask-gate'),
  threedOptions: process.argv.includes('--mutate-threed-options'),
  threedPbr: process.argv.includes('--mutate-threed-pbr'),
  threedGate: process.argv.includes('--mutate-threed-gate'),
  threedColorway: process.argv.includes('--mutate-threed-colorway'),
  railThreed: process.argv.includes('--mutate-rail-threed'),
  legacyThreed: process.argv.includes('--mutate-legacy-threed'),
  stepFirst: process.argv.includes('--mutate-step-first'),
};
const MUTATED = Object.values(MUT).some(Boolean);

let bad = 0;
let total = 0;
const failedIn = new Set();
let group = '';
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) {
    bad++;
    failedIn.add(group);
  }
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${!ok && detail ? `  — ${detail}` : ''}`);
};
const head = (id, s) => {
  group = id;
  console.log(`\n${id} · ${s}`);
};

// ─── мутации: одна строка НАСТОЯЩЕГО модуля подменяется в бандле ─────────────────────────────
const swap = (name, file, needle, replacement) => ({
  name,
  setup(b) {
    b.onLoad({ filter: file }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(needle))
        throw new Error(`мутация ${name} не нашла свою строку в ${args.path}`);
      return {
        contents: src.replace(needle, replacement),
        loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
      };
    });
  },
});
const plugins = [];
if (MUT.wire)
  plugins.push(
    swap(
      'ask-untrimmed',
      /tiles\/change-color\.tsx$/,
      'ask: textOf(draft, GARMENT).trim(),',
      'ask: textOf(draft, GARMENT),',
    ),
  );
if (MUT.validate)
  plugins.push(
    swap(
      'cap-plus-one',
      /tiles\/change-color\.tsx$/,
      'if (ids.length > RECOLOR_SOURCES_MAX) {',
      'if (ids.length > RECOLOR_SOURCES_MAX + 1) {',
    ),
  );
if (MUT.legacy)
  plugins.push(
    swap(
      'aside-to-create',
      /core\/chain\.ts$/,
      "['aside', { step: 'playground', wf: 'change_color' }]",
      "['aside', { step: 'playground', wf: 'create_edit' }]",
    ),
  );
if (MUT.capability)
  plugins.push(
    swap(
      'absent-means-all',
      /registry\/common\.ts$/,
      'if (offered === undefined) return notYet();',
      'if (offered === undefined) return { available: true };',
    ),
  );
if (MUT.recall)
  plugins.push(
    swap(
      'cutout-lost',
      /registry\/run-workflow\.ts$/,
      "if (kind === 'cutout') return 'remove_background';",
      '',
    ),
  );

if (MUT.presetMatch)
  plugins.push(
    swap(
      'match-on-preset',
      /tiles\/create-edit\.tsx$/,
      "match: matchesWorkflow('create_edit'),",
      "match: (run) => (run.kind ?? '').trim().toLowerCase() === 'freeform' && (run.params === undefined || (run.params.freeform?.preset ?? '').trim() === 'free'),",
    ),
  );

// ─── C-07: плитки 2, 3, 5, 6, 7 и правило «прогон → плитка» ────────────────────────────────────
if (MUT.swapEcho)
  plugins.push(
    swap('swap-no-echo', /tiles\/swap-fabrics\.tsx$/, 'fabricMediaId: id,', 'fabricMediaId: 0,'),
  );
if (MUT.logoRole)
  plugins.push(
    swap(
      'logo-as-subject',
      /tiles\/add-logo\.tsx$/,
      "[{ mediaId: logo, regions: [], texts: [], role: 'logo' }]",
      "[{ mediaId: logo, regions: [], texts: [], role: 'subject' }]",
    ),
  );
if (MUT.creativity)
  plugins.push(
    swap(
      'booster-dropped',
      /tiles\/design-variations\.tsx$/,
      'creativity: creativityOf(draft),',
      'creativity: 0,',
    ),
  );
if (MUT.formatDefault)
  plugins.push(
    swap(
      'fabric-format-2-3',
      /tiles\/fabric-to-image\.tsx$/,
      "formatSection({ initial: '1:1' })",
      "formatSection({ initial: '2:3' })",
    ),
  );
if (MUT.c07Validate)
  plugins.push(
    swap(
      'swap-same-picture',
      /tiles\/swap-fabrics\.tsx$/,
      'if (design === fabric) {',
      'if (false) {',
    ),
  );
if (MUT.c07Gate)
  plugins.push(
    swap(
      'logo-always-open',
      /tiles\/add-logo\.tsx$/,
      "gate: (band) => workflowOffered(band, 'add_logo'),",
      'gate: () => ({ available: true }),',
    ),
  );
if (MUT.runWorkflow)
  plugins.push(
    swap(
      'cloth-is-change-color',
      /registry\/run-workflow\.ts$/,
      "return cloth ? 'swap_fabrics' : 'change_color';",
      "return 'change_color';",
    ),
  );
if (MUT.stamp)
  plugins.push(
    swap(
      'stamp-dropped',
      /design\/bench-kinds\.ts$/,
      'if (!onPage && stamped) STAMPED_WORKFLOW.set(run, stamped);',
      '',
    ),
  );

// ─── C-08: мутации ворот фазы 2 и движка. Две правки одного файла — одним плагином (esbuild
// берёт первый onLoad, который ответил).
const COMMON = /registry\/common\.ts$/;
const commonSwaps = [];
if (MUT.gateLegacy)
  commonSwaps.push([
    'return band.playgroundWorkflows === undefined ? legacy() : workflowOffered(band, key);',
    'return legacy();',
  ]);
if (MUT.imageAbsent)
  commonSwaps.push([
    "const rows = (band.imageModels ?? []).filter((m) => (m.slug ?? '').trim() !== '');",
    "const rows = (band.imageModels ?? [{ slug: 'openai/gpt-image-2', label: 'GPT Image 2', isDefault: true, qualities: ['low', 'medium', 'high'], aspectRatios: ['auto', '2:3'] }]).filter((m) => (m.slug ?? '').trim() !== '');",
  ]);
if (MUT.quality)
  commonSwaps.push(['quality: qualityOf(model, draft, opts.engine),', "quality: '',"]);
if (MUT.snap)
  commonSwaps.push([
    `    choices[field.key] = snapRatio(
      draft.choices[field.key] ?? field.initial,
      allowedRatios(model, field),
    );`,
    '    choices[field.key] = draft.choices[field.key] ?? field.initial;',
  ]);
if (MUT.snapRead)
  commonSwaps.push(['return snapRatio(chosen, allowedRatios(model, field));', 'return chosen;']);
if (MUT.sections)
  commonSwaps.push([
    `export const enginesOffered = (band: GetDesignBandResponse): boolean =>
  imageModelsOf(band) !== null;`,
    'export const enginesOffered = (_band: GetDesignBandResponse): boolean => true;',
  ]);
if (MUT.drawn)
  commonSwaps.push(['return out.length ? out : [...field.ratios];', 'return [...field.ratios];']);
if (commonSwaps.length)
  plugins.unshift({
    name: 'c08-common',
    setup(b) {
      b.onLoad({ filter: COMMON }, async (args) => {
        let src = await readFile(args.path, 'utf8');
        for (const [needle, replacement] of commonSwaps) {
          if (!src.includes(needle))
            throw new Error(`мутация C-08 не нашла свою строку: ${needle.slice(0, 60)}`);
          src = src.replace(needle, replacement);
        }
        return { contents: src, loader: 'ts' };
      });
    },
  });

// ─── C-09: мутации плитки 1 и её пикеров — по плагину на файл, правки файла одним плагином.
const fileSwaps = (name, file, pairs) =>
  pairs.length
    ? plugins.unshift({
        name,
        setup(b) {
          b.onLoad({ filter: file }, async (args) => {
            let src = await readFile(args.path, 'utf8');
            for (const [needle, replacement] of pairs) {
              if (!src.includes(needle))
                throw new Error(`мутация ${name} не нашла свою строку: ${needle.slice(0, 60)}`);
              src = src.replace(needle, replacement);
            }
            return { contents: src, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
          });
        },
      })
    : 0;
const tryonSwaps = [];
if (MUT.tryonRole)
  tryonSwaps.push(["out.push(item(m.id ?? 0, 'product'));", "out.push(item(m.id ?? 0, ''));"]);
if (MUT.tryonScene)
  tryonSwaps.push([
    "if (sceneMode(draft) === 'reference' && scene) out.push(",
    'if (scene) out.push(',
  ]);
if (MUT.tryonValidate)
  tryonSwaps.push([
    "if (sceneMode(draft) === 'reference' && !scenePhoto(draft)) {",
    'if (false) {',
  ]);
if (MUT.tryonGate)
  tryonSwaps.push([
    "gate: (band) => workflowOffered(band, 'virtual_try_on'),",
    'gate: () => ({ available: true }),',
  ]);
if (MUT.tryonVocab)
  tryonSwaps.push(["{ value: 'portrait', label:", "{ value: 'portrait_face', label:"]);
fileSwaps('c09-tile', /tiles\/virtual-try-on\.tsx$/, tryonSwaps);
fileSwaps(
  'c09-renders',
  /fields\/colourway-render-picker\.tsx$/,
  MUT.tryonColourway
    ? [
        [
          'if (usable(picture) && isRender(picture) && colorwayOf(picture) === want) take(picture);',
          'if (usable(picture) && isRender(picture)) take(picture);',
        ],
        ["outputsOfKind(band, 'render', want)", "outputsOfKind(band, 'render')"],
      ]
    : [],
);
fileSwaps(
  'c09-photos',
  /fields\/model-photo-picker\.tsx$/,
  MUT.tryonPhotos
    ? [
        [
          'for (const m of [model.thumbnail, ...(model.media ?? [])]) {',
          'for (const m of model.media ?? []) {',
        ],
      ]
    : [],
);
// ─── C-11: мутации маски ──────────────────────────────────────────────────────────────────────
const GEOMETRY = /mask\/geometry\.ts$/;
const geometrySwaps = [];
if (MUT.maskHull)
  geometrySwaps.push([
    'const { rx, ry } = radiiOf(stroke.size, aspect);',
    'const { rx, ry } = { rx: 0 * stroke.size * aspect, ry: 0 };',
  ]);
if (MUT.maskRing)
  geometrySwaps.push(['if (hull.length > REGION_MAX_POINTS) hull = circumscribed(hull);', '']);
if (geometrySwaps.length)
  plugins.unshift({
    name: 'c11-geometry',
    setup(b) {
      b.onLoad({ filter: GEOMETRY }, async (args) => {
        let src = await readFile(args.path, 'utf8');
        for (const [needle, replacement] of geometrySwaps) {
          if (!src.includes(needle))
            throw new Error(`мутация C-11 не нашла свою строку: ${needle.slice(0, 60)}`);
          src = src.replace(needle, replacement);
        }
        return { contents: src, loader: 'ts' };
      });
    },
  });
const RETOUCH = /tiles\/retouch-zone\.tsx$/;
const retouchSwaps = [];
if (MUT.maskRefusal)
  retouchSwaps.push(["if (!input.painted) return { reason: 'paint the zone to change' };", '']);
if (MUT.maskGate)
  retouchSwaps.push([
    "workflowOffered(band, 'retouch_zone').available;",
    "workflowOffered(band, 'retouch_zone').available || true;",
  ]);
if (retouchSwaps.length)
  plugins.unshift({
    name: 'c11-retouch',
    setup(b) {
      b.onLoad({ filter: RETOUCH }, async (args) => {
        let src = await readFile(args.path, 'utf8');
        for (const [needle, replacement] of retouchSwaps) {
          if (!src.includes(needle))
            throw new Error(`мутация C-11 не нашла свою строку: ${needle.slice(0, 60)}`);
          src = src.replace(needle, replacement);
        }
        return { contents: src, loader: 'tsx' };
      });
    },
  });
// ─── C-10: мутации плитки 12 и рельса. Правки одного файла — одним плагином, как у C-08.
const multiSwap = (name, file, loader, pairs) => ({
  name,
  setup(b) {
    b.onLoad({ filter: file }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [needle, replacement] of pairs) {
        if (!src.includes(needle))
          throw new Error(`мутация ${name} не нашла свою строку: ${needle.slice(0, 60)}`);
        src = src.replace(needle, replacement);
      }
      return { contents: src, loader };
    });
  },
});
const tileSwaps = [];
if (MUT.threedOptions)
  tileSwaps.push([
    "return (band.threedOptions ?? []).some((raw) => (raw ?? '').trim() === name);",
    'return true;',
  ]);
if (MUT.threedPbr)
  tileSwaps.push([
    "pbr: offers(band, PBR) ? (textured && c.pbr ? 'on' : 'off') : '',",
    "pbr: offers(band, PBR) ? (c.pbr ? 'on' : 'off') : '',",
  ]);
if (MUT.threedGate)
  tileSwaps.push([
    'return band.threedOptions === undefined ? notYet() : { available: true };',
    'return { available: true };',
  ]);
if (MUT.threedColorway)
  tileSwaps.push(['if ((media?.id ?? 0) === mediaId) return colorwayOf(slot);', '']);
if (tileSwaps.length)
  plugins.unshift(multiSwap('c10-tile', /tiles\/image-to-3d\.tsx$/, 'tsx', tileSwaps));
const chainSwaps = [];
if (MUT.railThreed)
  chainSwaps.push([
    'return threedStepOnRail(ctx) ? STEPS_WITH_THREED : STEPS;',
    'return STEPS_WITH_THREED;',
  ]);
if (MUT.legacyThreed)
  chainSwaps.push(["if (value === 'threed' && !threedRetired) return null;", '']);
if (MUT.stepFirst)
  chainSwaps.push([
    `  const legacy = legacyStep(value, threedRetired);
  if (legacy) return legacy.step;
  return isStepId(value) ? value : null;`,
    `  if (isStepId(value)) return value;
  return legacyStep(value, threedRetired)?.step ?? null;`,
  ]);
if (chainSwaps.length)
  plugins.unshift(multiSwap('c10-chain', /core\/chain\.ts$/, 'ts', chainSwaps));

const outfile = resolve(tmpdir(), `playground-registry-probe-${process.pid}.mjs`);
try {
  await esbuild({
    entryPoints: [resolve(HERE, 'playground-registry-entry.tsx')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    // react-dom/server is CommonJS and requires node built-ins; an ESM bundle needs a real `require`.
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
    absWorkingDir: REPO,
    outfile,
    logLevel: 'silent',
    plugins,
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.css': 'empty' },
    define: { 'import.meta.env': '{"MODE":"probe","DEV":false,"PROD":true,"VITE_SERVER_URL":""}' },
    alias: {
      api: resolve(REPO, 'src/api'),
      components: resolve(REPO, 'src/components'),
      ui: resolve(REPO, 'src/ui'),
      lib: resolve(REPO, 'src/lib'),
      constants: resolve(REPO, 'src/constants'),
      hooks: resolve(REPO, 'src/hooks'),
      utils: resolve(REPO, 'src/utils'),
      types: resolve(REPO, 'src/types'),
      context: resolve(REPO, 'src/context'),
      '@': resolve(REPO, 'src'),
    },
  });
} catch (e) {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: сборка упала — ${e.message}`);
  process.exit(2);
}
const M = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

// ─── общие данные ─────────────────────────────────────────────────────────────────────────────
const media = (id) => ({ id, thumbnail: { mediaUrl: `https://x/${id}.jpg` } });
const band = (over = {}) => ({ freeformPresets: ['free', 'cutout'], runs: [], ...over });
const ctx = { band: band() };
const draft = (over = {}) => ({ ...M.EMPTY_DRAFT, ...over });
const def = (key) => M.workflowByKey(key);
const run = (key) => def(key).run;

/** Every field of DesignRunParams, written out by hand — not `emptyParams()`. */
const EMPTY_PARAMS = {
  views: [],
  layout: '',
  colour: undefined,
  threed: undefined,
  fixTarget: '',
  extraInputMediaIds: [],
  fixTargets: [],
  fixSlotIds: [],
  autoSplit: false,
  detailSlotIds: [],
  pattern: undefined,
  useFlatSlots: false,
  colorwayId: 0,
  flatSlotIds: [],
  freeform: undefined,
  // Phase-2 per-run engine (P-04): the playground tiles of phase 1 do not state it, so it never
  // reaches the wire — `same()` compares the JSON the request becomes.
  image: undefined,
};
const same = (got, want) =>
  isDeepStrictEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(want)));
const show = (x) => JSON.stringify(x);

// ─── A · wire() ───────────────────────────────────────────────────────────────────────────────
head('A', 'wire(): тело, которое уезжает, на заполненный черновик');
{
  const d = draft({
    images: { photos: [media(11), media(12), media(11), media(0)] },
    texts: { garment: '  The cropped denim jacket  ' },
    colours: { colour: { code: '19-4052 TCX', hex: '#0f4c81' } },
  });
  const got = run('change_color').wire(d, ctx);
  const want = {
    kind: 'recolor',
    ask: 'The cropped denim jacket',
    params: {
      ...EMPTY_PARAMS,
      extraInputMediaIds: [11, 12],
      colour: {
        colourMaps: [],
        source: 'dictionary',
        code: '19-4052 TCX',
        hex: '#0f4c81',
        words: '',
        fabricMediaId: 0,
        fabrics: [],
      },
    },
  };
  ck(
    same(got, want),
    'change_color → recolor: фото без повторов и нулей, слова обрезаны, Pantone со своим hex, colorwayId 0',
    show(got),
  );

  const half = run('change_color').wire(
    draft({
      images: { photos: [media(11)] },
      colours: { colour: { code: '19-4052 TCX', hex: '#0f4c8' } },
    }),
    ctx,
  );
  ck(
    half.params.colour?.hex === '' && half.params.colour?.code === '19-4052 TCX',
    'change_color: полунабранный hex не уезжает, код остаётся',
    show(half.params.colour),
  );
}
{
  const got = run('remove_background').wire(
    draft({ images: { image: [media(21)] }, texts: { stray: 'words' } }),
    ctx,
  );
  const want = { kind: 'cutout', ask: '', params: { ...EMPTY_PARAMS, extraInputMediaIds: [21] } };
  ck(
    same(got, want),
    'remove_background → cutout: одна картинка и ничего больше, без слов',
    show(got),
  );
}
{
  const got = run('create_edit').wire(
    draft({
      texts: { prompt: '  add sunglasses  ' },
      images: { refs: [media(31), media(32), media(31), media(33), media(34)] },
    }),
    ctx,
  );
  const item = (mediaId) => ({ mediaId, regions: [], texts: [], role: '' });
  const want = {
    kind: 'freeform',
    ask: 'add sunglasses',
    params: {
      ...EMPTY_PARAMS,
      freeform: { preset: 'free', items: [item(31), item(32), item(33)], options: undefined },
    },
  };
  ck(
    same(got, want),
    'create_edit → freeform/free: слова обрезаны, первые 3 референса без повторов, extraInputMediaIds пуст',
    show(got),
  );
  const long = run('create_edit').wire(
    draft({ texts: { prompt: 'x'.repeat(4100) }, images: { refs: [media(31)] } }),
    ctx,
  );
  ck(
    long.ask.length === 4000,
    'create_edit: ask срезан по потолку двери 4000',
    `длина ${long.ask.length}`,
  );
}

// ─── B · validate() ───────────────────────────────────────────────────────────────────────────
head('B', 'validate(): отказы до денег');
const PANTONE = { colour: { code: '19-4052 TCX', hex: '#0f4c81' } };
const photos = (n) => Array.from({ length: n }, (_, i) => media(100 + i));
{
  const v = (d) => run('change_color').validate(d, ctx);
  const none = v(draft({ colours: PANTONE }));
  ck(none?.section === 'photos', 'change_color: нет фото → отказ на секции photos', show(none));
  const over = v(draft({ images: { photos: photos(25) }, colours: PANTONE }));
  ck(
    over?.section === 'photos' && /24/.test(over.reason),
    'change_color: 25 фото → отказ, называет 24',
    show(over),
  );
  const cap = v(draft({ images: { photos: photos(24) }, colours: PANTONE }));
  ck(cap === null, 'change_color: ровно 24 фото проходят', show(cap));
  const noColour = v(draft({ images: { photos: photos(1) } }));
  ck(
    noColour?.section === 'colour',
    'change_color: нет Pantone → отказ на секции colour',
    show(noColour),
  );
  const ok = v(draft({ images: { photos: photos(2) }, colours: PANTONE }));
  ck(ok === null, 'change_color: заполненный черновик проходит', show(ok));
}
{
  const v = (d) => run('create_edit').validate(d, ctx);
  const empty = v(draft({ texts: { prompt: '   ' }, images: { refs: [media(31)] } }));
  ck(
    empty?.section === 'prompt',
    'create_edit: пустой (пробелы) промпт → отказ на секции prompt',
    show(empty),
  );
  const noRefs = v(draft({ texts: { prompt: 'add sunglasses' } }));
  ck(noRefs?.section === 'refs', 'create_edit: 0 референсов → отказ на секции refs', show(noRefs));
  const ok = v(draft({ texts: { prompt: 'add sunglasses' }, images: { refs: [media(31)] } }));
  ck(ok === null, 'create_edit: заполненный черновик проходит', show(ok));
}
{
  const v = (d) => run('remove_background').validate(d, ctx);
  ck(v(draft())?.section === 'image', 'remove_background: нет картинки → отказ на секции image');
  ck(
    v(draft({ images: { image: [media(21)] } })) === null,
    'remove_background: одна картинка проходит',
  );
}

// ─── C · legacyStep ───────────────────────────────────────────────────────────────────────────
head('C', "legacyStep('aside') — старый адрес ON MODEL");
{
  const got = M.legacyStep('aside');
  ck(
    same(got, { step: 'playground', wf: 'change_color' }),
    "'aside' → playground + change_color",
    show(got),
  );
  ck(M.legacyStep('playground') === null, "'playground' — не старый шаг");
  ck(M.legacyStep(null) === null && M.legacyStep('') === null, 'пустое значение — не старый шаг');
  ck(M.legacyStep('onmodel') === null, "'onmodel' никогда не был шагом адреса");
}

// ─── D · возможности → приглушённые плитки ────────────────────────────────────────────────────
head('D', 'возможности: чего сервер не перечислил, то приглушено и не открывается');
const liveKeys = (markup) =>
  new Set(
    [...markup.matchAll(/data-workflow-tile="([a-z_0-9]+)" data-workflow-live=""/g)].map(
      (m) => m[1],
    ),
  );
const buttons = (markup) => (markup.match(/<button/g) ?? []).length;
const shapes = [
  ['freeformPresets отсутствует', band({ freeformPresets: undefined }), ['change_color']],
  ["без 'cutout'", band({ freeformPresets: ['free'] }), ['change_color', 'create_edit']],
  ["без 'free'", band({ freeformPresets: ['cutout'] }), ['change_color', 'remove_background']],
  ['пустой список', band({ freeformPresets: [] }), ['change_color']],
  [
    'оба есть',
    band({ freeformPresets: [' free ', 'cutout'] }),
    ['change_color', 'remove_background', 'create_edit'],
  ],
];
for (const [name, b, open] of shapes) {
  const markup = M.gridMarkup(b);
  const live = liveKeys(markup);
  ck(
    same([...live].sort(), [...open].sort()),
    `${name}: живые плитки сетки = ${open.join(', ')}`,
    `живые: ${[...live].join(', ')}`,
  );
  ck(
    buttons(markup) === open.length,
    `${name}: кнопок в сетке ровно ${open.length} (приглушённая — не кнопка)`,
    `кнопок ${buttons(markup)}`,
  );
  for (const key of ['remove_background', 'create_edit']) {
    if (open.includes(key)) continue;
    ck(M.openWorkflow(key, b) === null, `${name}: адрес ?wf=${key} не открывает форму`);
    ck(M.playgroundHistoryMatch(key, b) === null, `${name}: история под ?wf=${key} не сужается`);
  }
}
{
  const markup = M.gridMarkup(band({ freeformPresets: undefined }));
  ck(/not on this server yet/.test(markup), 'приглушённая плитка говорит причину словами');
  const b = band();
  const m1 = M.playgroundHistoryMatch('create_edit', b);
  const m2 = M.playgroundHistoryMatch(' create_edit ', band());
  ck(
    typeof m1 === 'function' && m1 === m2,
    'матчер открытой плитки — одна и та же ссылка при каждом вызове',
  );
  ck(
    M.playgroundHistoryMatch(null, b) === null && M.playgroundHistoryMatch('', b) === null,
    'на сетке матчера нет (studio-tab берёт комнату)',
  );
  ck(
    M.playgroundHistoryMatch('virtual_try_on', b) === null,
    'приглушённая «not on this server yet» плитка не сужает историю',
  );
  const runs = [
    { kind: 'recolor', params: {} },
    { kind: 'cutout', params: {} },
    { kind: 'freeform', params: { freeform: { preset: 'free' } } },
    { kind: 'freeform', params: { freeform: { preset: 'add_hardware' } } },
    { kind: 'render', params: {} },
  ];
  const pick = (key) =>
    runs
      .filter(M.playgroundHistoryMatch(key, b))
      .map((r) => `${r.kind}/${r.params.freeform?.preset ?? ''}`);
  ck(
    same(pick('change_color'), ['recolor/']),
    'история change_color — только recolor',
    show(pick('change_color')),
  );
  ck(
    same(pick('remove_background'), ['cutout/']),
    'история remove_background — только cutout',
    show(pick('remove_background')),
  );
  ck(
    same(pick('create_edit'), ['freeform/free', 'freeform/add_hardware']),
    'история create_edit — каждый freeform, и свободный, и отставленного пресета (Q17)',
    show(pick('create_edit')),
  );
  // G-01 m-3: один и тот же прогон заглушкой (страница ещё не пришла) и целиком (пришла) —
  // одинаково свой, иначе оплаченная картинка уходит с плитки, пока лента листается.
  const stub = { id: 9, kind: 'freeform' };
  const loaded = { id: 9, kind: 'freeform', params: { freeform: { preset: 'add_hardware' } } };
  const m = M.playgroundHistoryMatch('create_edit', b);
  ck(
    m(stub) === true && m(loaded) === true,
    'create_edit: заглушка и загруженный прогон — оба свои',
  );
}

// ─── E · рекол ────────────────────────────────────────────────────────────────────────────────
head('E', 'рекол: прогон → плитка, и честные слова там, где плитки нет');
{
  ck(M.workflowOfRun({ kind: 'recolor' }) === 'change_color', 'recolor → change_color');
  ck(M.workflowOfRun({ kind: 'cutout' }) === 'remove_background', 'cutout → remove_background');
  ck(M.workflowOfRun({ kind: ' Freeform ' }) === 'create_edit', 'freeform → create_edit');
  ck(
    M.workflowOfRun({ kind: 'threed' }) === null && M.workflowOfRun({ kind: 'render' }) === null,
    'threed / render → не плитка комнаты',
  );

  const byId = new Map([
    [11, media(11)],
    [31, media(31)],
  ]);
  const rc = run('change_color').recall(
    {
      kind: 'recolor',
      ask: ' jacket ',
      params: { extraInputMediaIds: [11, 12], colour: { code: '19-4052 TCX', hex: '#0f4c81' } },
    },
    byId,
  );
  ck(
    same(
      rc.draft.images.photos.map((m) => m.id),
      [11],
    ) &&
      rc.lost === 1 &&
      rc.draft.texts.garment === 'jacket' &&
      rc.draft.colours.colour.code === '19-4052 TCX',
    'recolor → черновик change_color: фото, слова, Pantone; пропавшее фото посчитано',
    show({ ...rc, draft: { ...rc.draft, images: undefined } }),
  );

  const free = run('create_edit').recall(
    {
      kind: 'freeform',
      ask: 'add sunglasses',
      params: { freeform: { preset: 'free', items: [{ mediaId: 31, regions: [] }] } },
    },
    byId,
  );
  ck(
    free.said.length === 0 &&
      free.draft.texts.prompt === 'add sunglasses' &&
      free.draft.images.refs.length === 1,
    'freeform free → create_edit без оговорок',
    show(free.said),
  );

  let hw;
  let threw = '';
  try {
    hw = run(M.workflowOfRun({ kind: 'freeform' })).recall(
      {
        kind: 'freeform',
        ask: 'brass snaps',
        params: {
          freeform: { preset: 'add_hardware', items: [{ mediaId: 31, regions: [{ points: [] }] }] },
        },
      },
      byId,
    );
  } catch (e) {
    threw = e.message;
  }
  ck(!threw, 'freeform add_hardware: рекол не падает', threw);
  ck(
    !!hw && hw.said.some((s) => /add hardware/.test(s) && /not a workflow any more/.test(s)),
    'freeform add_hardware: говорит, что «add hardware» больше не плитка',
    show(hw?.said),
  );
  ck(
    !!hw && hw.said.some((s) => /marked areas/.test(s)),
    'freeform add_hardware: говорит, что размеченные области не приехали',
    show(hw?.said),
  );
  ck(
    !!hw && hw.draft.texts.prompt === 'brass snaps' && hw.draft.images.refs.length === 1,
    'freeform add_hardware: слова и картинка разложены в create_edit',
  );
}

// ─── F · ворота фазы 2 ────────────────────────────────────────────────────────────────────────
head('F', 'ворота фазы 2: playgroundWorkflows решает, freeformPresets не читается');
{
  const ALL = [
    'virtual_try_on',
    'fabric_to_image',
    'ghost_mannequin',
    'change_color',
    'swap_fabrics',
    'add_logo',
    'design_variations',
    'remove_background',
    'extend_image',
    'retouch_zone',
    'create_edit',
    'image_to_3d',
  ];
  const cases = [
    // freeformPresets говорит «free, cutout», новый список — только create_edit: решает список.
    [
      'список [create_edit] при freeformPresets free+cutout',
      band({ playgroundWorkflows: ['create_edit'] }),
      ['create_edit'],
    ],
    ['пустой список гасит все три плитки фазы 1', band({ playgroundWorkflows: [] }), []],
    // freeformPresets НЕТ (старый ключ сервер мог бы и не слать) — список всё равно открывает.
    [
      'список всех двенадцати, freeformPresets нет',
      band({
        playgroundWorkflows: ALL,
        freeformPresets: undefined,
        threedOptions: ['texture', 'pbr', 'quality'],
      }),
      // C-12: every tile built in phase 2 is live — written out by hand, so a tile that loses its
      // `run` turns this red; only Extend (phase 3) stays dimmed.
      [
        'virtual_try_on',
        'fabric_to_image',
        'ghost_mannequin',
        'change_color',
        'swap_fabrics',
        'add_logo',
        'design_variations',
        'remove_background',
        'retouch_zone',
        'create_edit',
        'image_to_3d',
      ],
    ],
    [
      // Tile 12 also waits for threed_options (C-10): listed without them, it alone stays dimmed.
      'список всех двенадцати без threed_options: 3D приглушён, остальные живы',
      band({ playgroundWorkflows: ALL, freeformPresets: undefined }),
      [
        'virtual_try_on',
        'fabric_to_image',
        'ghost_mannequin',
        'change_color',
        'swap_fabrics',
        'add_logo',
        'design_variations',
        'remove_background',
        'retouch_zone',
        'create_edit',
      ],
    ],
    [
      'список [change_color, remove_background]',
      band({ playgroundWorkflows: [' change_color ', 'remove_background'] }),
      ['change_color', 'remove_background'],
    ],
  ];
  for (const [name, b, open] of cases) {
    const live = liveKeys(M.gridMarkup(b));
    ck(
      same([...live].sort(), [...open].sort()),
      `${name}: живые = ${open.join(', ') || 'ни одной'}`,
      `живые: ${[...live].join(', ')}`,
    );
  }
  const off = band({ playgroundWorkflows: ['create_edit'] });
  ck(
    /not wired on this server/.test(M.gridMarkup(off)),
    'ключа нет в списке → плитка говорит «not wired on this server»',
  );
  ck(
    M.openWorkflow('remove_background', off) === null,
    'не перечисленная remove_background не открывается по адресу',
  );
  const w = (b, k) => M.workflowOffered(b, k);
  ck(
    same(w(band(), 'virtual_try_on'), { available: false, reason: 'not on this server yet' }),
    'workflowOffered: списка нет → «not on this server yet» (откат)',
    show(w(band(), 'virtual_try_on')),
  );
  ck(
    same(w(band({ playgroundWorkflows: ['create_edit'] }), 'add_logo'), {
      available: false,
      reason: 'not wired on this server',
    }),
    'workflowOffered: ключа нет → «not wired on this server»',
  );
  ck(
    w(band({ playgroundWorkflows: ['add_logo'], freeformPresets: [] }), 'add_logo').available ===
      true,
    'workflowOffered: ключ есть → доступно, пустой freeformPresets не мешает',
  );
}

// ─── G · params.image ─────────────────────────────────────────────────────────────────────────
head('G', 'params.image: тело движка, старый сервер, плитка без пикера');
const GPT2 = 'openai/gpt-image-2';
const GPT25 = 'openai/gpt-image-2.5-sunburst';
const RATIOS = ['auto', '9:16', '1:1', '3:4', '2:3', '16:9', '4:3', '3:2', '21:9'];
const MODELS = [
  {
    slug: GPT2,
    label: 'GPT Image 2',
    aspectRatios: RATIOS,
    qualities: ['low', 'medium', 'high'],
    isDefault: true,
    maxReferences: 16,
    backgrounds: [],
  },
  {
    slug: GPT25,
    label: 'GPT Image 2.5',
    aspectRatios: RATIOS,
    qualities: ['low', 'medium', 'high'],
    isDefault: false,
    maxReferences: 16,
    backgrounds: ['transparent'],
  },
];
const newBand = (over = {}) =>
  band({ playgroundWorkflows: ['create_edit'], imageModels: MODELS, ...over });
const ce = () => run('create_edit');
const fresh = () => ({
  ...M.initialDraft(ce()),
  texts: { prompt: ' a red coat on a white ground ' },
});
{
  const b = newBand();
  const got = ce().wire(
    {
      ...fresh(b),
      choices: { engine: GPT25, 'engine.quality': 'high', format: '16:9' },
      flags: { background: true },
    },
    { band: b },
  );
  const want = {
    kind: 'freeform',
    ask: 'a red coat on a white ground',
    params: {
      ...EMPTY_PARAMS,
      freeform: { preset: 'free', items: [], options: undefined },
      image: { model: GPT25, quality: 'high', aspectRatio: '16:9', background: 'transparent' },
    },
  };
  ck(
    same(got, want),
    'create_edit, новый сервер: 2.5 · high · 16:9 · transparent, без референсов — тело целиком',
    show(got),
  );

  const def0 = ce().wire(fresh(b), { band: b });
  ck(
    same(def0.params.image, { model: GPT2, quality: 'medium', aspectRatio: '2:3', background: '' }),
    'свежий черновик: модель по умолчанию (isDefault), medium, 2:3 — как в шапках',
    show(def0.params.image),
  );
  const auto = ce().wire({ ...fresh(b), choices: { format: 'auto' } }, { band: b });
  ck(auto.params.image?.aspectRatio === '', "формат auto уезжает как ''", show(auto.params.image));
  const noBg = ce().wire(
    { ...fresh(b), choices: { engine: GPT2 }, flags: { background: true } },
    { band: b },
  );
  ck(
    noBg.params.image?.background === '',
    'флаг фона у модели без transparent не уезжает',
    show(noBg.params.image),
  );
  const gone = ce().wire({ ...fresh(b), choices: { engine: 'openai/retired' } }, { band: b });
  ck(
    gone.params.image?.model === GPT2,
    'снятая с сервера модель читается как модель по умолчанию',
    show(gone.params.image),
  );

  ck(
    ce().validate(fresh(b), { band: b }) === null,
    'новый сервер: промпт без референсов проходит (текст → картинка)',
  );
}
{
  const choices = { engine: GPT25, 'engine.quality': 'high', format: '16:9' };
  for (const [name, b] of [
    ['imageModels нет', band({ playgroundWorkflows: ['create_edit'] })],
    ['imageModels пуст', band({ playgroundWorkflows: ['create_edit'], imageModels: [] })],
    ['старый сервер целиком', band()],
  ]) {
    const got = ce().wire({ ...fresh(b), choices, images: { refs: [media(31)] } }, { band: b });
    ck(got.params.image === undefined, `${name}: params.image не уезжает`, show(got.params.image));
  }
  const old = band();
  const v = ce().validate(fresh(old), { band: old });
  ck(
    v?.section === 'refs',
    'старый сервер: 0 референсов → отказ на секции refs (дверь фазы 1)',
    show(v),
  );
}
{
  // Плитка без пикера (D6: 2, 3) — через тот же imageOptionsOf.
  const b = newBand();
  const F11 = M.formatSection({ initial: '1:1' }).field;
  const one = M.imageOptionsOf(
    b,
    { ...M.EMPTY_DRAFT, choices: { format: '1:1' } },
    { format: F11 },
  );
  ck(
    same(one, { model: GPT2, quality: '', aspectRatio: '1:1', background: '' }),
    "без пикера, 1:1: модель по умолчанию, quality '' (тир развёртывания), 1:1",
    show(one),
  );
  const none = M.imageOptionsOf(
    b,
    { ...M.EMPTY_DRAFT, choices: { format: 'auto' } },
    { format: F11 },
  );
  ck(none === undefined, 'без пикера, auto: блок не уезжает вовсе (сказать нечего)', show(none));
  ck(
    M.imageOptionsOf(band(), { ...M.EMPTY_DRAFT, choices: { format: '1:1' } }, { format: F11 }) ===
      undefined,
    'без пикера, старый сервер: блок не уезжает',
  );
}

// ─── H · защёлкивание ─────────────────────────────────────────────────────────────────────────
head('H', 'формат защёлкивается к модели; уровень переносится; строка шапки');
{
  const NARROW = {
    slug: 'x/narrow',
    label: 'Narrow',
    aspectRatios: ['auto', '1:1', '9:16', '16:9'],
    qualities: ['low', 'medium'],
    isDefault: false,
  };
  const b = newBand({ imageModels: [...MODELS, NARROW] });
  const sections = ce().sections;
  const start = { ...fresh(b), choices: { format: '2:3', engine: GPT2, 'engine.quality': 'high' } };
  const next = M.chooseEngine(start, b, sections, 'engine', 'x/narrow');
  ck(
    next.choices.format === '9:16',
    'смена на модель без 2:3 → формат 9:16 (ближайшая форма)',
    show(next.choices),
  );
  ck(
    next.choices['engine.quality'] === 'medium',
    'high нет у новой модели → medium',
    show(next.choices),
  );
  const wire = ce().wire(next, { band: b });
  ck(
    same(wire.params.image, {
      model: 'x/narrow',
      quality: 'medium',
      aspectRatio: '9:16',
      background: '',
    }),
    'после смены тело говорит то же, что форма',
    show(wire.params.image),
  );
  const back = M.chooseEngine(
    { ...start, choices: { ...start.choices, engine: GPT25 } },
    b,
    sections,
    'engine',
    GPT2,
  );
  ck(
    back.choices['engine.quality'] === 'high' && back.choices.format === '2:3',
    'уровень и формат, которые есть у новой модели, остаются',
    show(back.choices),
  );
  const autoKeep = M.chooseEngine(
    { ...start, choices: { format: 'auto' } },
    b,
    sections,
    'engine',
    'x/narrow',
  );
  ck(
    autoKeep.choices.format === 'auto',
    'auto остаётся auto, если модель его делает',
    show(autoKeep.choices),
  );

  // Начальный 4:5 у модели без 4:5: сетка, шапка и провод — одно значение.
  const F45 = M.formatSection({ initial: '4:5' }).field;
  const d45 = { ...M.EMPTY_DRAFT };
  ck(
    M.formatOf(b, d45, F45) === '3:4',
    'начальный 4:5 у GPT Image 2 читается как 3:4',
    M.formatOf(b, d45, F45),
  );
  const img = M.imageOptionsOf(b, d45, { engine: 'engine', format: F45 });
  ck(img?.aspectRatio === '3:4', '…и уезжает как 3:4', show(img));
  ck(
    M.formatOf(band(), d45, F45) === '4:5',
    'без моделей формат не трогается (не к чему защёлкивать)',
  );

  ck(
    M.engineSummary(b, fresh(b), 'engine') === 'GPT Image 2 · medium',
    'шапка свежего черновика: «GPT Image 2 · medium»',
    M.engineSummary(b, fresh(b), 'engine'),
  );
  ck(
    M.engineSummary(
      b,
      { ...M.EMPTY_DRAFT, choices: { engine: GPT25, 'engine.quality': 'high' } },
      'engine',
    ) === 'GPT Image 2.5 · high',
    'шапка после выбора: «GPT Image 2.5 · high»',
  );
  ck(M.engineSummary(band(), fresh(b), 'engine') === '—', 'без моделей шапка — прочерк');
  // Сетка рисует то, что делает ХОТЬ ОДНА модель сервера: 4:5 и 5:4 не делает ни одна GPT Image.
  const drawn = M.drawnRatios(newBand(), F45);
  ck(
    !drawn.includes('4:5') &&
      !drawn.includes('5:4') &&
      drawn.includes('21:9') &&
      drawn[0] === 'auto',
    'сетка на сервере с GPT Image: без 4:5 и 5:4, порядок владельца',
    show(drawn),
  );
  const withNarrow = M.drawnRatios(b, F45);
  ck(
    same(withNarrow, drawn),
    'сетка не зависит от выбранной модели (объединение по серверу)',
    show(withNarrow),
  );
  ck(
    M.drawnRatios(band(), F45).length === 11,
    'без моделей — полный список поля',
    show(M.drawnRatios(band(), F45)),
  );
}

// ─── I · разметка формы ───────────────────────────────────────────────────────────────────────
head('I', 'форма create_edit: секции AI model и Format только на сервере с моделями');
{
  const neu = M.panelMarkup(newBand(), 'create_edit');
  ck(
    /data-fold-section="create_edit\.engine-section"/.test(neu),
    'новый сервер: секция AI model есть',
  );
  ck(/GPT Image 2 · medium/.test(neu), 'новый сервер: её шапка «GPT Image 2 · medium»');
  ck(
    /data-fold-section="create_edit\.format-section"/.test(neu),
    'новый сервер: секция Format есть',
  );
  const values = [...neu.matchAll(/data-fold-value="">([^<]*)</g)].map((m) => m[1]);
  ck(
    values.includes('GPT Image 2 · medium') && values.includes('2:3'),
    'новый сервер: шапки свёрнутых секций — «GPT Image 2 · medium» и «2:3»',
    show(values),
  );
  ck(!/needs at least one/.test(neu), 'новый сервер: строки «needs at least one» нет');
  const old = M.panelMarkup(band(), 'create_edit');
  ck(old.length > 0, 'старый сервер: форма нарисована', `${old.length} символов`);
  ck(!/engine-section|format-section/.test(old), 'старый сервер: ни AI model, ни Format');
  ck(/needs at least one/.test(old), 'старый сервер: строка «needs at least one» есть');
  const noModels = M.panelMarkup(band({ playgroundWorkflows: ['create_edit'] }), 'create_edit');
  ck(
    !/engine-section|format-section/.test(noModels) && !/needs at least one/.test(noModels),
    'список есть, моделей нет: без AI model/Format, но и без «needs at least one» (текст → картинка)',
  );
}

// ─── J · C-07: тела пяти плиток ───────────────────────────────────────────────────────────────
head('J', 'C-07 wire(): тела плиток 2, 3, 5, 6, 7 целиком');
const FIVE = [
  'fabric_to_image',
  'ghost_mannequin',
  'swap_fabrics',
  'add_logo',
  'design_variations',
];
const c07Band = (over = {}) =>
  band({ playgroundWorkflows: [...FIVE, 'create_edit'], imageModels: MODELS, ...over });
const fresh7 = (key, over = {}) => ({ ...M.initialDraft(run(key)), ...over });
const item0 = (mediaId, role = '') => ({ mediaId, regions: [], texts: [], role });
const OPTIONS0 = {
  framing: '',
  angle: '',
  sceneMode: '',
  sceneText: '',
  modelId: 0,
  productColorwayId: 0,
  logoSize: '',
  creativity: 0,
};
const SHELF = {
  id: 7,
  kind: 'pattern',
  name: 'Stripe 40',
  mediaId: 53,
  media: media(53),
  colourCode: '',
  colourHex: '',
  note: '',
  repeatMm: 40,
};
const cloth = (over) => ({
  mapHex: '',
  assetId: 0,
  name: 'fabric',
  mediaId: 0,
  colourCode: '',
  colourHex: '',
  words: '',
  parts: '',
  kind: '',
  repeatMm: 0,
  ...over,
});
const recolour = (fabric) => ({
  colourMaps: [],
  source: 'photo',
  code: '',
  hex: '',
  words: '',
  fabricMediaId: fabric.mediaId,
  fabrics: [fabric],
});
const W = {};
{
  const b = c07Band();
  const d = fresh7('fabric_to_image', {
    images: { image: [media(41), media(42)] },
    texts: { region: '  the pleated skirt ' },
  });
  W.fabric = { d, w: run('fabric_to_image').wire(d, { band: b }) };
  ck(
    same(W.fabric.w, {
      kind: 'freeform',
      ask: 'the pleated skirt',
      params: {
        ...EMPTY_PARAMS,
        freeform: { preset: 'fabric_extract', items: [item0(41)], options: undefined },
        image: { model: GPT2, quality: '', aspectRatio: '1:1', background: '' },
      },
    }),
    'fabric_to_image → freeform/fabric_extract: одна картинка, role "", модель по умолчанию, 1:1',
    show(W.fabric.w),
  );
  const old = run('fabric_to_image').wire(d, { band: band({ playgroundWorkflows: FIVE }) });
  ck(old.params.image === undefined, 'fabric_to_image без моделей: image не уезжает', show(old));
  const auto = run('fabric_to_image').wire({ ...d, choices: { format: 'auto' } }, { band: b });
  ck(auto.params.image === undefined, 'fabric_to_image, auto: блока image нет', show(auto));
}
{
  const b = c07Band();
  const d = fresh7('ghost_mannequin', {
    images: { image: [media(43)] },
    texts: { garment: ' the cropped denim jacket ' },
  });
  W.ghost = { d, w: run('ghost_mannequin').wire(d, { band: b }) };
  ck(
    same(W.ghost.w, {
      kind: 'freeform',
      ask: 'the cropped denim jacket',
      params: {
        ...EMPTY_PARAMS,
        freeform: { preset: 'ghost_mannequin', items: [item0(43)], options: undefined },
        image: { model: GPT2, quality: '', aspectRatio: '2:3', background: '' },
      },
    }),
    'ghost_mannequin → freeform/ghost_mannequin: одна картинка, модель по умолчанию, 2:3',
    show(W.ghost.w),
  );
}
{
  const b = c07Band();
  const d = fresh7('swap_fabrics', {
    slots: { images: { design: media(51), fabric: media(52) } },
    texts: { garment: ' the jacket body ' },
  });
  W.swap = { d, w: run('swap_fabrics').wire(d, { band: b }) };
  ck(
    same(W.swap.w, {
      kind: 'recolor',
      ask: 'the jacket body',
      params: {
        ...EMPTY_PARAMS,
        extraInputMediaIds: [51],
        colour: recolour(cloth({ mediaId: 52 })),
      },
    }),
    'swap_fabrics → recolor: дизайн в extraInputMediaIds, ткань в fabrics[] И эхом в fabricMediaId, цвета нет',
    show(W.swap.w),
  );
  const shelf = c07Band({ assets: [SHELF] });
  const ds = { ...d, slots: { images: { design: media(51), fabric: media(53) } } };
  W.swapShelf = { d: ds, w: run('swap_fabrics').wire(ds, { band: shelf }), band: shelf };
  ck(
    same(
      W.swapShelf.w.params.colour,
      recolour(
        cloth({ assetId: 7, name: 'Stripe 40', mediaId: 53, kind: 'pattern', repeatMm: 40 }),
      ),
    ),
    'swap_fabrics, ткань с полки: строка полки (asset 7, имя, род, раппорт) и эхо 53',
    show(W.swapShelf.w.params.colour),
  );
  ck(
    /re-clothed in Stripe 40/.test(run('swap_fabrics').shape(ds, W.swapShelf.w)),
    'swap_fabrics: строка у кнопки читается с тела — «re-clothed in Stripe 40»',
    run('swap_fabrics').shape(ds, W.swapShelf.w),
  );
}
{
  const b = c07Band();
  const d = fresh7('add_logo', {
    slots: { images: { garment: media(61), logo: media(62) } },
    texts: { placement: ' on the chest, left side ' },
    choices: { logo_size: 'large' },
  });
  W.logo = { d, w: run('add_logo').wire(d, { band: b }) };
  ck(
    same(W.logo.w, {
      kind: 'freeform',
      ask: 'on the chest, left side',
      params: {
        ...EMPTY_PARAMS,
        freeform: {
          preset: 'add_logo',
          items: [item0(61, 'subject'), item0(62, 'logo')],
          options: { ...OPTIONS0, logoSize: 'large' },
        },
      },
    }),
    'add_logo → freeform/add_logo: subject + logo по порядку, logo_size, без image',
    show(W.logo.w),
  );
  const def0 = run('add_logo').wire(fresh7('add_logo'), { band: b });
  ck(
    def0.params.freeform?.options?.logoSize === 'medium',
    'add_logo: размер по умолчанию — medium',
    show(def0.params.freeform?.options),
  );
}
{
  const b = c07Band();
  const d = fresh7('design_variations', {
    images: { image: [media(71)] },
    texts: { variation: ' longer length, relaxed fit ' },
  });
  const w0 = run('design_variations').wire(d, { band: b });
  ck(
    same(w0, {
      kind: 'freeform',
      ask: 'longer length, relaxed fit',
      params: {
        ...EMPTY_PARAMS,
        freeform: { preset: 'variations', items: [item0(71)], options: OPTIONS0 },
        image: { model: GPT2, quality: 'medium', aspectRatio: '2:3', background: '' },
      },
    }),
    'design_variations, свежий черновик: creativity 0 (Off), GPT Image 2 · medium · 2:3',
    show(w0),
  );
  const dh = {
    ...d,
    choices: { ...d.choices, booster: '2', engine: GPT25, 'engine.quality': 'high', format: '3:4' },
  };
  W.vary = { d: dh, w: run('design_variations').wire(dh, { band: b }) };
  ck(
    W.vary.w.params.freeform?.options?.creativity === 2 &&
      same(W.vary.w.params.image, {
        model: GPT25,
        quality: 'high',
        aspectRatio: '3:4',
        background: '',
      }),
    'design_variations: Medium → creativity 2, выбранные модель/качество/формат',
    show(W.vary.w.params),
  );
}

// ─── K · C-07: отказы до денег ────────────────────────────────────────────────────────────────
head('K', 'C-07 validate(): отказы пяти плиток');
{
  const b = c07Band();
  const v = (key, d) => run(key).validate({ ...fresh7(key), ...d }, { band: b });
  for (const key of ['fabric_to_image', 'ghost_mannequin']) {
    ck(v(key, {})?.section === 'image', `${key}: нет картинки → отказ на секции image`);
    ck(
      v(key, { images: { image: [media(41)] } }) === null,
      `${key}: картинка без слов проходит (слова необязательны, как у владельца и у ремесла)`,
    );
  }
  const sw = (slots, texts) => v('swap_fabrics', { slots: { images: slots }, texts });
  ck(sw({})?.section === 'images', 'swap_fabrics: пусто → отказ на секции images');
  ck(
    /new fabric/.test(sw({ design: media(51) })?.reason ?? ''),
    'swap_fabrics: без ткани → «add the new fabric»',
    show(sw({ design: media(51) })),
  );
  ck(
    /your design/.test(sw({ fabric: media(52) })?.reason ?? ''),
    'swap_fabrics: без дизайна → «add your design»',
  );
  ck(
    /same picture/.test(sw({ design: media(51), fabric: media(51) })?.reason ?? ''),
    'swap_fabrics: одна картинка в обоих слотах → отказ (cloth_is_also_a_photograph)',
    show(sw({ design: media(51), fabric: media(51) })),
  );
  ck(
    sw({ design: media(51), fabric: media(52) }) === null,
    'swap_fabrics: дизайн + ткань без слов проходят',
  );
  const lg = (slots, placement) =>
    v('add_logo', { slots: { images: slots }, texts: placement ? { placement } : {} });
  ck(/garment/.test(lg({}, 'chest')?.reason ?? ''), 'add_logo: без вещи → отказ');
  ck(
    /logo/.test(lg({ garment: media(61) }, 'chest')?.reason ?? ''),
    'add_logo: без логотипа → отказ',
  );
  ck(
    /same picture/.test(lg({ garment: media(61), logo: media(61) }, 'chest')?.reason ?? ''),
    'add_logo: одна картинка в обоих слотах → отказ',
  );
  ck(
    lg({ garment: media(61), logo: media(62) }, '  ')?.section === 'placement',
    'add_logo: без места → отказ на секции placement',
  );
  ck(
    lg({ garment: media(61), logo: media(62) }, 'chest') === null,
    'add_logo: заполнено → проходит',
  );
  ck(
    v('design_variations', { texts: { variation: 'x' } })?.section === 'image',
    'design_variations: нет картинки → отказ на секции image',
  );
  ck(
    v('design_variations', { images: { image: [media(71)] } })?.section === 'variation',
    'design_variations: нет слов → отказ на секции variation',
  );
  ck(
    v('design_variations', { images: { image: [media(71)] }, texts: { variation: 'x' } }) === null,
    'design_variations: заполнено → проходит',
  );
}

// ─── L · C-07: ворота ─────────────────────────────────────────────────────────────────────────
head('L', 'C-07 ворота: пять плиток живы ровно по playgroundWorkflows');
{
  const absent = band();
  const live0 = liveKeys(M.gridMarkup(absent));
  ck(
    FIVE.every((k) => !live0.has(k)),
    'списка нет → все пять приглушены',
    [...live0].join(', '),
  );
  for (const k of FIVE) {
    ck(
      same(M.workflowOffered(absent, k), { available: false, reason: 'not on this server yet' }) &&
        M.openWorkflow(k, absent) === null,
      `${k}: списка нет → «not on this server yet», адрес не открывает`,
    );
  }
  const other = band({ playgroundWorkflows: ['create_edit'] });
  const liveO = liveKeys(M.gridMarkup(other));
  ck(
    FIVE.every((k) => !liveO.has(k)),
    'ключей нет в списке → все пять приглушены',
  );
  ck(M.openWorkflow('add_logo', other) === null, 'add_logo не в списке → адрес не открывает');
  const on = band({ playgroundWorkflows: FIVE });
  const liveOn = liveKeys(M.gridMarkup(on));
  ck(
    FIVE.every((k) => liveOn.has(k)) && !liveOn.has('create_edit'),
    'список пяти → живы ровно они (create_edit не в списке — приглушён)',
    [...liveOn].join(', '),
  );
  ck(
    FIVE.every((k) => M.openWorkflow(k, on)?.key === k),
    'список пяти → каждая открывается',
  );
  const half = band({ playgroundWorkflows: ['swap_fabrics'] });
  const liveH = liveKeys(M.gridMarkup(half));
  ck(
    liveH.has('swap_fabrics') && !liveH.has('add_logo'),
    'список [swap_fabrics] → жив только он',
    [...liveH].join(', '),
  );
}

// ─── M · C-07: прогон → плитка ────────────────────────────────────────────────────────────────
head('M', 'C-07 прогон → плитка: правило сервера, штамп заглушки, матчеры');
{
  const ff = (preset) => ({ kind: 'freeform', params: { freeform: { preset } } });
  const rows = [
    [ff('fabric_extract'), 'fabric_to_image'],
    [ff('ghost_mannequin'), 'ghost_mannequin'],
    [ff('add_logo'), 'add_logo'],
    [ff('variations'), 'design_variations'],
    [ff('tryon'), 'virtual_try_on'],
    [ff('retouch'), 'retouch_zone'],
    [ff('free'), 'create_edit'],
    [ff('add_hardware'), 'create_edit'],
    [{ kind: 'recolor', params: { colour: { fabrics: [{ mediaId: 52 }] } } }, 'swap_fabrics'],
    [
      { kind: 'recolor', params: { colour: { fabrics: [{ mediaId: 0 }], code: 'x' } } },
      'change_color',
    ],
    [{ kind: 'recolor', params: {} }, 'change_color'],
  ];
  for (const [r, want] of rows) {
    const got = M.workflowOfRun(r);
    ck(
      got === want,
      `${r.kind}/${r.params.freeform?.preset ?? (r.params.colour ? 'colour' : '')} → ${want}`,
      got,
    );
  }

  const stubBand = band({
    runs: [],
    outputs: [
      {
        picture: { id: 901, runId: 555 },
        runId: 555,
        runKind: 'freeform',
        runWorkflow: 'fabric_to_image',
      },
      { picture: { id: 903, runId: 557 }, runId: 557, runKind: 'freeform', runWorkflow: '' },
      {
        picture: { id: 902, runId: 556 },
        runId: 556,
        runKind: 'recolor',
        runWorkflow: 'swap_fabrics',
      },
      {
        picture: { id: 904, runId: 558 },
        runId: 558,
        runKind: 'recolor',
        runWorkflow: 'change_color',
      },
    ],
  });
  const pg = M.cardOutputRows(stubBand, 'playground') ?? [];
  const om = M.cardOutputRows(stubBand, 'onmodel') ?? [];
  const byRun = (list, id) => list.find((r) => r.run.id === id)?.run;
  const s555 = byRun(pg, 555);
  const s557 = byRun(pg, 557);
  const s556 = byRun(om, 556);
  const s558 = byRun(om, 558);
  ck(
    !!s555 && s555.params === undefined && M.workflowOfRun(s555) === 'fabric_to_image',
    'заглушка вне страницы со штампом fabric_to_image → fabric_to_image',
    show(s555 && M.workflowOfRun(s555)),
  );
  ck(
    !!s557 && M.workflowOfRun(s557) === 'create_edit',
    'заглушка без штампа → create_edit (как в фазе 1)',
  );
  ck(
    !!s556 && M.workflowOfRun(s556) === 'swap_fabrics',
    'заглушка recolor со штампом swap_fabrics → swap_fabrics',
  );
  ck(
    !!s558 && M.workflowOfRun(s558) === 'change_color',
    'заглушка recolor со штампом change_color → change_color',
  );
  ck(
    !!s555 && M.runWorkflowWord(s555) === 'fabric to image',
    'подпись результата на сетке: «fabric to image»',
    s555 && M.runWorkflowWord(s555),
  );

  const loaded555 = {
    id: 555,
    kind: 'freeform',
    params: { freeform: { preset: 'fabric_extract' } },
  };
  const m = (key) => run(key).results.match;
  ck(
    !!s555 && m('fabric_to_image')(s555) && m('fabric_to_image')(loaded555),
    'fabric_to_image: заглушка и загруженный прогон — оба свои (картинка не прыгает при листании)',
  );
  ck(
    !!s555 && !m('create_edit')(s555) && !m('create_edit')(loaded555),
    'create_edit больше не забирает картинки fabric_extract',
  );
  const swapRun = { id: 556, kind: 'recolor', params: { colour: { fabrics: [{ mediaId: 52 }] } } };
  ck(
    m('swap_fabrics')(swapRun) && !m('change_color')(swapRun) && !!s556 && m('swap_fabrics')(s556),
    'swap_fabrics забирает recolor с тканью, change_color — нет',
  );
  const plain = { id: 558, kind: 'recolor', params: { colour: { code: '19-4052 TCX' } } };
  ck(m('change_color')(plain) && !m('swap_fabrics')(plain), 'recolor с Pantone — change_color');
  for (const [key, preset] of [
    ['ghost_mannequin', 'ghost_mannequin'],
    ['add_logo', 'add_logo'],
    ['design_variations', 'variations'],
  ]) {
    const r = ff(preset);
    const owners = FIVE.concat(['create_edit', 'change_color']).filter((k) => m(k)(r));
    ck(same(owners, [key]), `freeform/${preset} — ровно одна плитка: ${key}`, show(owners));
  }
  ck(
    same(run('swap_fabrics').results.reps, ['onmodel']) && run('swap_fabrics').results.selectable,
    'swap_fabrics: результаты — представление onmodel, с отметкой select',
  );
}

// ─── N · C-07: разметка форм ──────────────────────────────────────────────────────────────────
head('N', 'C-07 разметка форм пяти плиток');
{
  const b = c07Band();
  const noModels = band({ playgroundWorkflows: FIVE });
  const values = (markup) => [...markup.matchAll(/data-fold-value="">([^<]*)</g)].map((x) => x[1]);
  const has = (markup, re) => re.test(markup);

  const f = M.panelMarkup(b, 'fabric_to_image');
  ck(
    has(f, /Reference image/) && has(f, />required</i) && has(f, /Fabric pattern to extract from/),
    'fabric_to_image: Reference image (REQUIRED) и «Fabric pattern to extract from»',
  );
  ck(has(f, /placeholder="The pleated skirt"/), 'fabric_to_image: плейсхолдер владельца');
  ck(
    has(f, /fabric_to_image\.format-section/) &&
      values(f).includes('1:1') &&
      !has(f, /engine-section/),
    'fabric_to_image: Format 1:1 в шапке, без пикера модели (D6)',
    show(values(f)),
  );
  const g = M.panelMarkup(b, 'ghost_mannequin');
  ck(
    has(g, /Image with your garment/) &&
      has(g, /Garment to recreate/) &&
      has(g, /placeholder="The cropped denim jacket"/) &&
      values(g).includes('2:3') &&
      !has(g, /engine-section/),
    'ghost_mannequin: «Image with your garment», «Garment to recreate», Format 2:3, без пикера',
    show(values(g)),
  );
  for (const key of ['fabric_to_image', 'ghost_mannequin', 'design_variations']) {
    const mk = M.panelMarkup(noModels, key);
    ck(
      mk.length > 0 && !has(mk, /format-section|engine-section/),
      `${key}: сервер без моделей — ни Format, ни AI model`,
    );
  }
  const s5 = M.panelMarkup(b, 'swap_fabrics');
  ck(
    has(s5, /data-image-slot="design"/) &&
      has(s5, /Your design/) &&
      has(s5, /data-image-slot="fabric"/) &&
      has(s5, /New fabric/) &&
      has(s5, /Garment to swap fabric on/) &&
      !has(s5, /format-section|engine-section/),
    'swap_fabrics: два слота «Your design» / «New fabric», промпт, без Format и модели',
  );
  const l = M.panelMarkup(b, 'add_logo');
  ck(
    has(l, /Your garment/) &&
      has(l, /Your logo \(PNG\)/) &&
      has(l, /data-option-row="Logo size"/) &&
      has(l, /Logo placement/) &&
      has(l, /placeholder="On the chest, left sleeve, back, hip pocket…"/),
    'add_logo: слоты, строка «Logo size», «Logo placement» с плейсхолдером владельца',
  );
  ck(
    l.indexOf('data-option-row="Logo size"') < l.indexOf('Logo placement'),
    'add_logo: «Logo size» стоит между картинками и местом, как на 9.png',
  );
  const v = M.panelMarkup(b, 'design_variations');
  ck(
    has(v, /Describe the variation/) &&
      has(v, /placeholder="Same jacket, cropped shorter, wider sleeves"/) &&
      has(v, /data-slider="Creative booster"/),
    'design_variations: «Describe the variation» и слайдер Creative booster',
  );
  ck(
    same(values(v), ['Off', 'GPT Image 2 · medium', '2:3']),
    'design_variations: шапки — «Off», «GPT Image 2 · medium», «2:3»',
    show(values(v)),
  );
  const v2 = M.panelMarkup(b, 'design_variations', {
    ...fresh7('design_variations'),
    choices: { ...fresh7('design_variations').choices, booster: '3' },
  });
  ck(values(v2)[0] === 'High', 'design_variations: шаг 3 → «High» в шапке', show(values(v2)));
}

// ─── O · C-07: рекол ──────────────────────────────────────────────────────────────────────────
head('O', 'C-07 рекол: тело → черновик → то же тело');
{
  const b = c07Band();
  const all = new Map([41, 43, 51, 52, 53, 61, 62, 71].map((id) => [id, media(id)]));
  const trip = (key, entry, bb = b) => {
    const past = { kind: entry.w.kind, ask: entry.w.ask, params: entry.w.params };
    const back = run(key).recall(past, all);
    const again = run(key).wire(back.draft, { band: bb });
    ck(
      same(again, entry.w) && back.said.length === 0 && back.lost === 0,
      `${key}: рекол собирает то же тело`,
      show({ again, said: back.said }),
    );
  };
  trip('fabric_to_image', W.fabric);
  trip('ghost_mannequin', W.ghost);
  trip('swap_fabrics', W.swap);
  trip('swap_fabrics', W.swapShelf, W.swapShelf.band);
  trip('add_logo', W.logo);
  trip('design_variations', W.vary);

  const bare = run('fabric_to_image').recall(
    {
      kind: 'freeform',
      ask: '',
      params: { freeform: { preset: 'fabric_extract', items: [{ mediaId: 41 }] } },
    },
    all,
  );
  ck(
    bare.draft.choices.format === 'auto',
    'fabric_to_image: прогон без image → формат auto',
    show(bare.draft.choices),
  );
  const multi = run('swap_fabrics').recall(
    {
      kind: 'recolor',
      ask: '',
      params: {
        extraInputMediaIds: [51, 54],
        colour: { code: '19-4052 TCX', fabrics: [{ mediaId: 52 }], fabricMediaId: 52 },
      },
    },
    all,
  );
  ck(
    multi.said.some((x) => /1 more photograph/.test(x)) && multi.said.some((x) => /colour/.test(x)),
    'swap_fabrics: лишние фото и цвет прошлого прогона названы словами',
    show(multi.said),
  );
  ck(
    M.workflowOfRun({ kind: 'recolor', params: { colour: { fabrics: [{ mediaId: 52 }] } } }) ===
      'swap_fabrics',
    'рекол recolor с тканью открывает swap_fabrics',
  );
}

// ─── P · плитка 1 Virtual Try-On (C-09) ──────────────────────────────────────────────────────
head('P', 'virtual_try_on: тело tryon, отказы до денег, ворота, пулы пикеров, рекол, форма');
{
  // Картинка с адресом, как её рисует mediaThumb (media.media.thumbnail).
  const pic = (id) => ({ id, media: { thumbnail: { mediaUrl: `https://x/${id}.jpg` } } });
  const GPT = 'openai/gpt-image-2';
  const tryBand = (over = {}) =>
    band({
      playgroundWorkflows: ['virtual_try_on', 'create_edit'],
      imageModels: [
        {
          slug: GPT,
          label: 'GPT Image 2',
          isDefault: true,
          qualities: ['low', 'medium', 'high'],
          aspectRatios: ['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'],
          maxReferences: 16,
          backgrounds: [],
        },
      ],
      // Выходы карточки: рендеры ROSSO (7) и OLIVE (8), рендер без колорвея, скрытый и
      // display-only рендер ROSSO, кроп рендера ROSSO — и вывод freeform (не рендер).
      outputs: [
        {
          runId: 3,
          runKind: 'render',
          picture: { id: 301, kind: 'render', colorwayId: 7, media: pic(31) },
        },
        {
          runId: 3,
          runKind: 'render',
          picture: { id: 302, kind: 'render', colorwayId: 7, media: pic(32) },
        },
        {
          runId: 4,
          runKind: 'render',
          picture: { id: 401, kind: 'render', colorwayId: 8, media: pic(41) },
        },
        {
          runId: 5,
          runKind: 'render',
          picture: { id: 501, kind: 'render', colorwayId: 0, media: pic(51) },
        },
        {
          runId: 3,
          runKind: 'render',
          picture: {
            id: 303,
            kind: 'render',
            colorwayId: 7,
            media: pic(33),
            hiddenAt: { seconds: 1 },
          },
        },
        {
          runId: 3,
          runKind: 'render',
          picture: { id: 304, kind: 'render', colorwayId: 7, media: pic(34), displayOnly: true },
        },
        {
          runId: 6,
          runKind: 'freeform',
          picture: { id: 601, kind: 'freeform', colorwayId: 0, media: pic(61) },
        },
      ],
      // Рендер-верстак ROSSO держит плиту 35 (своя картинка без колорвея — её колорвей скажет слот).
      bench: [
        {
          id: 1,
          kind: 'render',
          colorwayId: 7,
          viewKey: 'front',
          picture: { id: 351, kind: 'render', colorwayId: 0, media: pic(35) },
        },
        {
          id: 2,
          kind: 'flat',
          colorwayId: 0,
          viewKey: 'front',
          picture: { id: 361, kind: 'flat', colorwayId: 0, media: pic(36) },
        },
      ],
      ...over,
    });
  const B = tryBand();
  const tctx = { band: B };
  const r = run('virtual_try_on');
  const filled = (over = {}) =>
    draft({
      ...M.initialDraft(r),
      ...over,
      texts: {
        pose: '  one hand on hip  ',
        scene: '  concrete wall, late sun ',
        ...(over.texts ?? {}),
      },
      images: {
        model_photo: [pic(90)],
        product: [pic(31), pic(35)],
        scene_photo: [pic(77)],
        ...(over.images ?? {}),
      },
      choices: {
        ...M.initialDraft(r).choices,
        model: '12',
        product_colorway: '7',
        framing: 'upper_body',
        angle: 'low_angle',
        ...(over.choices ?? {}),
      },
    });

  // ── wire: тело целиком, написанное руками ──
  const edit = r.wire(filled(), tctx);
  const wantEdit = {
    kind: 'freeform',
    ask: 'one hand on hip',
    params: {
      ...EMPTY_PARAMS,
      freeform: {
        preset: 'tryon',
        items: [
          { mediaId: 90, regions: [], texts: [], role: 'model' },
          { mediaId: 31, regions: [], texts: [], role: 'product' },
          { mediaId: 35, regions: [], texts: [], role: 'product' },
        ],
        options: {
          framing: 'upper_body',
          angle: 'low_angle',
          sceneMode: 'edit',
          sceneText: 'concrete wall, late sun',
          modelId: 12,
          productColorwayId: 7,
          logoSize: '',
          creativity: 0,
        },
      },
      image: { model: GPT, quality: 'medium', aspectRatio: '9:16', background: '' },
    },
  };
  ck(
    same(edit, wantEdit),
    'edit scene: тело tryon целиком (картинка сцены НЕ уезжает)',
    show(edit),
  );
  const ref = r.wire(filled({ choices: { scene_mode: 'reference' } }), tctx);
  ck(
    same(
      ref.params.freeform.items.map((i) => [i.mediaId, i.role]),
      [
        [90, 'model'],
        [31, 'product'],
        [35, 'product'],
        [77, 'scene'],
      ],
    ) && ref.params.freeform.options.sceneMode === 'reference',
    'with reference: сцена последней, role=scene, scene_mode=reference',
    show(ref.params.freeform),
  );
  ck(
    ref.params.extraInputMediaIds.length === 0 && ref.params.colorwayId === 0,
    'extra_input_media_ids пуст (one_list_per_fact), colorway_id 0',
  );
  const old = r.wire(filled(), { band: tryBand({ imageModels: undefined }) });
  ck(
    old.params.image === undefined,
    'без imageModels params.image не уезжает',
    show(old.params.image),
  );
  ck(same(r.shape(filled(), edit), '1 picture'), 'форма покупки: «1 picture»');

  // ── словарь сервера (design_freeform.go: IsDesignFraming / IsDesignAngle) ──
  const FRAMING = [
    'auto',
    'full_body',
    'upper_body',
    'portrait',
    'hands',
    'feet',
    'product_detail',
  ];
  const ANGLE = ['auto', 'eye_level', 'slightly_above', 'slightly_below', 'low_angle'];
  ck(
    same(
      M.FRAMING_OPTIONS.map((o) => o.value),
      FRAMING,
    ),
    'framing: семь слов сервера в порядке владельца',
    show(M.FRAMING_OPTIONS.map((o) => o.value)),
  );
  ck(
    same(
      M.ANGLE_OPTIONS.map((o) => o.value),
      ANGLE,
    ),
    'angle: пять слов сервера',
  );
  ck(
    M.FRAMING_OPTIONS[3].label === 'Portrait – face & neck' &&
      M.ANGLE_OPTIONS[4].label === 'Low angle, from the ground',
    'подписи — слова владельца',
  );

  // ── validate: отказы до денег ──
  const why = (d, b = B) => r.validate(d, { band: b })?.reason ?? null;
  ck(why(filled()) === null, 'заполненный черновик проходит', why(filled()));
  ck(
    /model profile/.test(why(filled({ images: { model_photo: [] } })) ?? ''),
    'нет фото модели → отказ «model profile»',
  );
  ck(
    /model profile/.test(why(filled({ choices: { model: '0' } })) ?? ''),
    'фото без профиля → отказ (model_id обязателен для провенанса)',
  );
  ck(/colourway/.test(why(filled({ images: { product: [] } })) ?? ''), 'нет продукта → отказ');
  ck(
    /at most 4/.test(
      why(
        filled({
          images: { product: [pic(31), pic(32), pic(35), pic(41), pic(51)] },
          choices: { product_colorway: '0' },
        }),
      ) ?? '',
    ),
    'пять продуктов → отказ «at most 4»',
  );
  ck(
    /scene picture/.test(
      why(filled({ choices: { scene_mode: 'reference' }, images: { scene_photo: [] } })) ?? '',
    ),
    'with reference без картинки → отказ',
  );
  ck(
    /used twice/.test(
      why(filled({ choices: { scene_mode: 'reference' }, images: { scene_photo: [pic(90)] } })) ??
        '',
    ),
    'сцена = фото модели → отказ (duplicate_picture)',
  );
  ck(
    why(filled({ images: { scene_photo: [pic(90)] } })) === null,
    'та же картинка в слоте сцены при edit не уезжает — и не отказ',
  );
  ck(
    /no longer a render/.test(why(filled({ images: { product: [pic(41)] } })) ?? ''),
    'рендер OLIVE под колорвеем ROSSO → отказ (product_not_colorway_render)',
  );
  ck(
    why(filled({ images: { product: [pic(51)] }, choices: { product_colorway: '0' } })) === null,
    'колорвей 0 ничего не утверждает → не отказ',
  );

  // ── ворота ──
  const liveNow = (b) => liveKeys(M.gridMarkup(b));
  ck(!liveNow(band()).has('virtual_try_on'), 'списка нет → плитка приглушена (откат)');
  ck(liveNow(B).has('virtual_try_on'), 'в списке → плитка открыта');
  ck(
    !liveNow(band({ playgroundWorkflows: ['create_edit'] })).has('virtual_try_on'),
    'список без ключа → приглушена',
  );

  // ── пулы пикеров ──
  const ids = (list) => list.map((m) => m.id);
  ck(
    same(ids(M.productRendersOf(B, 7)), [35, 31, 32]),
    'рендеры ROSSO: плита верстака, затем выходы; без скрытого, display-only, чужих и не-рендеров',
    show(ids(M.productRendersOf(B, 7))),
  );
  ck(
    same(ids(M.productRendersOf(B, 8)), [41]),
    'рендеры OLIVE: только свой',
    show(ids(M.productRendersOf(B, 8))),
  );
  ck(
    same(ids(M.productRendersOf(B, 0)), [51]),
    'колорвей 0: рендер без колорвея',
    show(ids(M.productRendersOf(B, 0))),
  );
  const cws = M.productColorwaysOf(B, [
    { colorwayId: 7, devName: 'ROSSO' },
    { colorwayId: 8, devName: 'OLIVE' },
    { colorwayId: 9, devName: 'NERO' },
  ]);
  ck(
    same(cws, [
      { id: 0, label: 'sample', renders: 1 },
      { id: 7, label: 'ROSSO', renders: 3 },
      { id: 8, label: 'OLIVE', renders: 1 },
      { id: 9, label: 'NERO', renders: 0 },
    ]),
    'селект колорвеев: sample (есть рендер), колорвеи карточки со счётом',
    show(cws),
  );
  const noSample = M.productColorwaysOf(
    tryBand({ outputs: B.outputs.filter((o) => o.picture.id !== 501) }),
    [],
  );
  ck(
    !noSample.some((c) => c.id === 0),
    'sample не предлагается без своих рендеров',
    show(noSample),
  );
  const photos = M.modelPhotosOf({
    id: 12,
    thumbnail: pic(90),
    media: [pic(91), pic(90), { id: 92 }, pic(93)],
  });
  ck(
    same(ids(photos), [90, 91, 93]),
    'фото профиля: thumbnail первым, без повторов и без картинок без адреса',
    show(ids(photos)),
  );
  ck(M.modelPhotosOf(null).length === 0, 'нет профиля → нет фото');

  // ── results и рекол ──
  const past = {
    id: 55,
    kind: 'freeform',
    ask: 'chin up',
    params: {
      ...EMPTY_PARAMS,
      freeform: {
        preset: 'tryon',
        items: [
          { mediaId: 90, role: 'model', regions: [], texts: [] },
          { mediaId: 31, role: 'product', regions: [], texts: [] },
          { mediaId: 77, role: 'scene', regions: [], texts: [] },
        ],
        options: {
          framing: 'hands',
          angle: 'eye_level',
          sceneMode: 'reference',
          sceneText: 'grey seamless',
          modelId: 12,
          productColorwayId: 7,
          logoSize: '',
          creativity: 0,
        },
      },
      image: { model: GPT, quality: 'high', aspectRatio: '3:4', background: '' },
    },
  };
  ck(r.results.match(past), 'results.match: прогон tryon — свой');
  ck(
    !r.results.match({
      ...past,
      params: { ...past.params, freeform: { ...past.params.freeform, preset: 'free' } },
    }),
    'results.match: freeform free — чужой',
  );
  const mediaMap = new Map([90, 31, 77].map((id) => [id, pic(id)]));
  const back = r.recall(past, mediaMap);
  const again = r.wire(back.draft, tctx);
  ck(
    same(again.params.freeform, past.params.freeform) && again.ask === 'chin up',
    'рекол → wire: тот же freeform и те же слова',
    show(again.params.freeform),
  );
  ck(
    same(again.params.image, { model: GPT, quality: 'high', aspectRatio: '3:4', background: '' }),
    'рекол → wire: та же модель, качество и формат',
    show(again.params.image),
  );
  ck(
    back.said.length === 0 && back.lost === 0,
    'рекол полного прогона ничего не теряет',
    show(back),
  );
  const noProfile = r.recall(
    {
      ...past,
      params: {
        ...past.params,
        freeform: {
          ...past.params.freeform,
          options: { ...past.params.freeform.options, modelId: 0 },
        },
      },
    },
    mediaMap,
  );
  ck(
    (noProfile.draft.images.model_photo ?? []).length === 0 && noProfile.said.length === 1,
    'рекол без model_id: фото не ложится молча, сказано словами',
    show(noProfile.said),
  );

  // ── разметка формы ──
  const html = M.panelMarkup(B, 'virtual_try_on');
  const order = [
    'virtual_try_on.model',
    'virtual_try_on.engine-section',
    'virtual_try_on.shot',
    'virtual_try_on.pose',
    'virtual_try_on.product',
    'virtual_try_on.scene',
    'virtual_try_on.format-section',
  ].map((a) => html.indexOf(`data-fold-section="${a}"`));
  ck(
    order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]),
    'секции в порядке владельца: модель, AI model, кадр, поза, продукт, сцена, формат',
    show(order),
  );
  const values = [...html.matchAll(/data-fold-value="">([^<]*)</g)].map((m) => m[1]);
  ck(
    values.includes('edit scene') && values.includes('9:16') && values.includes('0/4'),
    'шапки: «edit scene», «9:16», «0/4»',
    show(values),
  );
  ck(
    (html.match(/>required</gi) ?? []).length === 2,
    'REQUIRED ровно у модели и продукта',
    String((html.match(/>required</gi) ?? []).length),
  );
  ck(
    /one hand on hip, weight on one leg, chin up/.test(html),
    'плейсхолдер позы — слова владельца',
  );
  const oldHtml = M.panelMarkup(tryBand({ imageModels: undefined }), 'virtual_try_on');
  ck(
    !/engine-section|format-section/.test(oldHtml) && /virtual_try_on\.scene/.test(oldHtml),
    'без моделей: ни AI model, ни Format, остальная форма на месте',
  );
}

// ─── Q · Retouch a Zone: тело из мазков ───────────────────────────────────────────────────────
head('Q', 'Retouch a Zone: оболочка кисти → items[0].regions[0], слова → texts[0]');
const corner = (x, y) => ({ x: { value: x }, y: { value: y } });
/** A polygon region as the door reads it — written out by hand, every field of the annotation. */
const polygon = (points) => ({
  kind: 'TECH_CARD_ANNOTATION_KIND_POLYGON',
  points,
  text: '',
  labelX: undefined,
  labelY: undefined,
  color: 'TECH_CARD_ANNOTATION_COLOR_UNKNOWN',
  dashed: false,
  filled: false,
  caps: 'TECH_CARD_ANNOTATION_CAPS_UNSPECIFIED',
  pieceLineKey: '',
  pieceLineKeys: [],
});
const photo = (id, w = 1200, h = 1600) => ({
  id,
  media: {
    thumbnail: { mediaUrl: `https://x/${id}.jpg` },
    fullSize: { mediaUrl: `https://x/${id}-full.jpg`, width: w, height: h },
  },
});
{
  // One stroke from (0.4, 0.5) to (0.6, 0.5), brush radius 0.05 of the shorter side, square
  // picture. Each end is a disc sampled at 8 angles; the hull is the two half-octagons joined by
  // straight top and bottom edges: 10 corners, by hand (0.05·cos45° = 0.035355 → 4 decimals).
  const strokes = [
    {
      size: 0.05,
      points: [
        { x: 0.4, y: 0.5 },
        { x: 0.6, y: 0.5 },
      ],
    },
  ];
  const zone = M.zoneOfStrokes(strokes, 1);
  const got = M.retouchRequest({
    media: photo(41),
    zone,
    painted: true,
    words: '  remove the stain, keep the twill  ',
  });
  const want = {
    kind: 'freeform',
    ask: '',
    params: {
      ...EMPTY_PARAMS,
      freeform: {
        preset: 'retouch',
        items: [
          {
            mediaId: 41,
            regions: [
              polygon([
                corner('0.3500', '0.5000'),
                corner('0.3646', '0.4646'),
                corner('0.4000', '0.4500'),
                corner('0.6000', '0.4500'),
                corner('0.6354', '0.4646'),
                corner('0.6500', '0.5000'),
                corner('0.6354', '0.5354'),
                corner('0.6000', '0.5500'),
                corner('0.4000', '0.5500'),
                corner('0.3646', '0.5354'),
              ]),
            ],
            texts: ['remove the stain, keep the twill'],
            role: '',
          },
        ],
        options: undefined,
      },
    },
  };
  ck(
    same(got, want),
    'один мазок → freeform/retouch: 1 картинка, 1 полигон из 10 углов, слова в texts[0], ask пуст, без image',
    show(got),
  );
  const tall = M.zoneOfStrokes([{ size: 0.05, points: [{ x: 0.5, y: 0.5 }] }], 0.5);
  const xs = tall ? tall.map((p) => p.x) : [];
  const ys = tall ? tall.map((p) => p.y) : [];
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  ck(
    !!tall && Math.abs(spanX - 0.1) < 1e-9 && Math.abs(spanY - 0.05) < 1e-9,
    'кисть круглая на высокой картинке (1:2): диск 0.1 по x и 0.05 по y (доли своих осей)',
    show(tall),
  );
}
{
  // Forty dabs on a ring: the hull has far more than 12 corners and must become the
  // circumscribed twelve-gon — at most 12 corners, and every painted sample inside it.
  const strokes = Array.from({ length: 40 }, (_, i) => {
    const t = (2 * Math.PI * i) / 40;
    return { size: 0.01, points: [{ x: 0.5 + 0.3 * Math.cos(t), y: 0.5 + 0.3 * Math.sin(t) }] };
  });
  const hull = M.convexHull(M.paintedSamples(strokes, 1));
  ck(hull.length > 12, `кольцо: оболочка краски больше 12 углов (${hull.length})`);
  const zone = M.zoneOfStrokes(strokes, 1);
  ck(
    !!zone && zone.length >= 3 && zone.length <= 12,
    `кольцо → зона из 3..12 углов (${zone?.length ?? 'null'})`,
    show(zone),
  );
  const inside = (poly, p) => {
    // Convex, any orientation: the point is on one side of every edge (4-decimal rounding slack).
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      if (Math.abs(c) < 1e-4) continue;
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
    return true;
  };
  const samples = M.paintedSamples(strokes, 1);
  const out = zone ? samples.filter((p) => !inside(zone, p)) : samples;
  ck(out.length === 0, 'кольцо: вся краска внутри зоны (описанный, а не урезанный)', show(out[0]));
  const fourDecimals = (v) => Math.abs(Math.round(v * 1e4) - v * 1e4) < 1e-6;
  ck(
    !!zone && zone.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1),
    'кольцо: углы в 0..1',
  );
  ck(!!zone && zone.every((p) => fourDecimals(p.x) && fourDecimals(p.y)), 'кольцо: 4 знака');
  ck(!!zone && M.polygonArea(zone) >= 1e-5, 'кольцо: площадь ≥ 1e-5');
  const edge = M.zoneOfStrokes([{ size: 0.06, points: [{ x: 0, y: 0 }] }], 1);
  ck(
    !!edge && edge.every((p) => p.x >= 0 && p.y >= 0) && M.polygonArea(edge) >= 1e-5,
    'мазок в углу картинки: зона прижата к краю, не выходит за 0',
    show(edge),
  );
  ck(
    M.zoneOfStrokes([{ size: 0.001, points: [{ x: 0.5, y: 0.5 }] }], 1) === null,
    'мазок меньше 1e-5 площади кадра → null (дверь отказала бы region_degenerate)',
  );
  ck(M.zoneOfStrokes([], 1) === null, 'нет мазков → null');
}

// ─── R · отказы маски ─────────────────────────────────────────────────────────────────────────
head('R', 'маска: отказы до денег, в порядке двери');
{
  const zone = M.zoneOfStrokes([{ size: 0.05, points: [{ x: 0.5, y: 0.5 }] }], 1);
  const ok = { media: photo(41), zone, painted: true, words: 'a clean pocket' };
  ck(M.retouchRefusal(ok) === null, 'нарисовано, слова есть, картинка большая → готово');
  const blank = M.retouchRefusal({ ...ok, zone: null, painted: false });
  ck(
    blank?.reason === 'paint the zone to change',
    'ничего не нарисовано → «paint the zone to change»',
    show(blank),
  );
  const tiny = M.retouchRefusal({ ...ok, zone: null, painted: true });
  ck(/too small/.test(tiny?.reason ?? ''), 'нарисовано, но без площади → «too small»', show(tiny));
  const mute = M.retouchRefusal({ ...ok, words: '   ' });
  ck(
    mute?.reason === 'describe what should be there',
    'нет слов (пробелы) → «describe what should be there»',
    show(mute),
  );
  const small = M.retouchRefusal({ ...ok, media: photo(41, 50, 900) });
  ck(
    /50×900 px/.test(small?.reason ?? '') && /64 px/.test(small?.reason ?? ''),
    'картинка 50×900 → отказ, называет размер и 64 px (source_too_small до денег)',
    show(small),
  );
  ck(
    M.retouchRefusal({ ...ok, media: { id: 41, media: { thumbnail: { mediaUrl: 'x' } } } }) ===
      null,
    'размер не указан (старая строка медиа) → не отказ: сервер проверит сам',
  );
  ck(
    M.retouchRefusal({ ...ok, media: null })?.reason === 'pick a picture to retouch',
    'нет картинки → «pick a picture to retouch»',
  );
  const empty = M.retouchRequest({ ...ok, zone: null, painted: false });
  ck(
    same(empty.params.freeform, { preset: 'retouch', items: [], options: undefined }),
    'не нарисовано → items пуст (тело без зоны не собирается)',
    show(empty.params.freeform),
  );
  const long = M.retouchRequest({ ...ok, words: 'ж'.repeat(1200) });
  ck(
    Array.from(long.params.freeform.items[0]?.texts?.[0] ?? '').length === 1000,
    'слова срезаны по потолку двери 1000 символов',
  );
}

// ─── S · ворота ретуши ────────────────────────────────────────────────────────────────────────
head('S', 'ворота: плитка 10 и угол mask — только где сервер перечислил retouch_zone');
{
  const withList = band({ playgroundWorkflows: ['retouch_zone'] });
  const withoutKey = band({ playgroundWorkflows: ['create_edit'] });
  ck(liveKeys(M.gridMarkup(withList)).has('retouch_zone'), 'сетка: retouch_zone в списке → жива');
  ck(!liveKeys(M.gridMarkup(band())).has('retouch_zone'), 'сетка: списка нет → приглушена');
  ck(
    !liveKeys(M.gridMarkup(withoutKey)).has('retouch_zone'),
    'сетка: в списке нет retouch_zone → приглушена',
  );
  ck(
    M.retouchOffered(withList) && !M.retouchOffered(band()) && !M.retouchOffered(withoutKey),
    'retouchOffered: да только при retouch_zone в playgroundWorkflows',
  );
  const pic = (id, ordinal, mediaId) => ({
    id,
    ordinal,
    media: { id: mediaId, media: { thumbnail: { mediaUrl: `https://x/${mediaId}.jpg` } } },
  });
  const runs = [
    {
      id: 41,
      kind: 'freeform',
      status: 'succeeded',
      params: { ...EMPTY_PARAMS, freeform: { preset: 'free', items: [], options: undefined } },
      pictures: [pic(501, 1, 77)],
    },
    {
      id: 42,
      kind: 'freeform',
      status: 'succeeded',
      params: { ...EMPTY_PARAMS, freeform: { preset: 'retouch', items: [], options: undefined } },
      pictures: [pic(502, 1, 78)],
    },
  ];
  const masks = (markup) => (markup.match(/aria-label="mask picture/g) ?? []).length;
  const off = M.resultsMarkup(band({ runs }), null);
  ck(off.includes('data-pg-output="501"'), 'итоги нарисованы (сетка, старый сервер)');
  ck(masks(off) === 0, 'старый сервер: угла mask нет ни на одной картинке', `${masks(off)}`);
  ck(
    masks(M.resultsMarkup(band({ runs, playgroundWorkflows: ['create_edit'] }), null)) === 0,
    'список без retouch_zone: угла mask нет',
  );
  const on = M.resultsMarkup(band({ runs, playgroundWorkflows: ['retouch_zone'] }), null);
  ck(
    masks(on) === 2,
    'retouch_zone в списке: угол mask на каждой картинке комнаты',
    `${masks(on)}`,
  );
  ck(
    M.maskableRun({ kind: 'freeform' }) &&
      M.maskableRun({ kind: 'cutout' }) &&
      M.maskableRun({ kind: 'recolor' }) &&
      !M.maskableRun({ kind: 'threed' }) &&
      !M.maskableRun({ kind: 'flat' }),
    'mask — на растрах плейграунда (freeform, cutout, recolor), не на 3D и не на флэтах',
  );
  const under = M.resultsMarkup(
    band({ runs, playgroundWorkflows: ['retouch_zone', 'create_edit'] }),
    'retouch_zone',
  );
  ck(
    under.includes('data-pg-output="501"') && under.includes('data-pg-output="502"'),
    'итоги под плиткой 10 — вся комната (картинка «free» тоже, с ней и начинают)',
  );
  const panel = M.panelMarkup(withList, 'retouch_zone');
  ck(panel.includes('data-retouch-explanation'), 'панель плитки 10: объяснение нарисовано');
  ck(
    panel.includes(M.RETOUCH_CAVEAT) &&
      M.RETOUCH_CAVEAT === 'The rectangle around your zone may change.',
    'панель плитки 10: честная строка «The rectangle around your zone may change.»',
  );
  ck(!/credit/i.test(panel), 'панель плитки 10: ни слова о кредитах');
  ck(!/GENERATE/.test(panel), 'панель плитки 10: GENERATE нет — прогон начинается с Mask', '');
  const retouchMatch = M.playgroundHistoryMatch('retouch_zone', withList);
  ck(
    !!retouchMatch && retouchMatch(runs[1]) && !retouchMatch(runs[0]),
    'история под плиткой 10 сужается до ретушей',
  );
}

// ─── T · плитка 12 Image to 3D (C-10) ─────────────────────────────────────────────────────────
head('T', 'Image to 3D: тело режима референса, опции по слову сервера, ворота, разметка, рекол');
const OPTS3 = ['texture', 'pbr', 'quality'];
/** A render plate of colourway 5 on the render bench, and a flat plate — media 41 and 43. */
const BENCH3 = [
  {
    id: 1,
    kind: 'render',
    viewKey: 'front',
    colorwayId: 5,
    picture: { id: 901, media: media(41) },
  },
  { id: 2, kind: 'flat', viewKey: 'front', colorwayId: 0, picture: { id: 902, media: media(43) } },
];
const band3 = (over = {}) =>
  band({ playgroundWorkflows: ['image_to_3d'], threedOptions: OPTS3, bench: BENCH3, ...over });
const t3 = () => run('image_to_3d');
/** Every field of DesignThreedParams, written by hand. */
const THREED = (over) => ({
  frames: 0,
  presentation: 'air',
  modelId: 0,
  garmentSizeId: 0,
  fitOverride: '',
  bodyType: '',
  sourcePictureIds: [],
  referenceMediaIds: [],
  texture: '',
  pbr: '',
  quality: '',
  follow: '',
  surfaceHint: '',
  ...over,
});
{
  ck(!!t3(), 'image_to_3d: плитка runnable (run есть)');
  const b = band3();
  const fresh3 = (images) => ({ ...M.initialDraft(t3()), images: { reference: images } });

  // A plate of colourway 5, every option stated.
  const full = t3().wire(
    {
      ...fresh3([media(41)]),
      flags: { texture: true, pbr: true },
      choices: { quality: 'detailed' },
    },
    { band: b },
  );
  ck(
    same(full, {
      kind: 'threed',
      ask: '',
      params: {
        ...EMPTY_PARAMS,
        colorwayId: 5,
        threed: THREED({
          referenceMediaIds: [41],
          texture: 'on',
          pbr: 'on',
          quality: 'detailed',
        }),
      },
    }),
    'плита рендер-верстака колорвея 5, всё названо: тело целиком (colorwayId 5, [41], on/on/detailed, follow пуст)',
    show(full),
  );

  // A fresh draft over a picture that is not a render plate: the defaults, colourway 0.
  const plain = t3().wire(fresh3([media(42), media(44)]), { band: b });
  ck(
    same(plain, {
      kind: 'threed',
      ask: '',
      params: {
        ...EMPTY_PARAMS,
        threed: THREED({
          referenceMediaIds: [42],
          texture: 'on',
          pbr: 'off',
          quality: 'standard',
        }),
      },
    }),
    'свежий черновик, картинка не с верстака: [42] (одна), on/off/standard, colorwayId 0',
    show(plain),
  );
  ck(
    t3().wire(fresh3([media(43)]), { band: b }).params.colorwayId === 0,
    'плита ФЛЭТ-верстака колорвея не даёт (colorwayId 0)',
  );
  ck(M.plateColorway(b, 41) === 5 && M.plateColorway(b, 0) === 0, 'plateColorway: 41 → 5, 0 → 0');

  // Materials without the texture never leave as `on` (the door refuses the pair).
  const bare = t3().wire(
    { ...fresh3([media(42)]), flags: { texture: false, pbr: true } },
    { band: b },
  );
  ck(
    bare.params.threed.texture === 'off' && bare.params.threed.pbr === 'off',
    'текстура off + материалы on → уезжает off/off, никогда off/on',
    show(bare.params.threed),
  );
  // …and where the texture row is not the server's to switch, the texture is ON (its constant).
  const pbrOnly = t3().wire(
    { ...fresh3([media(42)]), flags: { texture: false, pbr: true } },
    { band: band3({ threedOptions: ['pbr'] }) },
  );
  ck(
    same(pbrOnly.params.threed, THREED({ referenceMediaIds: [42], pbr: 'on' })),
    'сервер объявил только pbr: texture/quality пусты (константа маршрута), pbr on',
    show(pbrOnly.params.threed),
  );

  // Nothing advertised → every option '' — today's constants.
  const none = t3().wire(
    {
      ...fresh3([media(42)]),
      flags: { texture: false, pbr: true },
      choices: { quality: 'detailed' },
    },
    { band: band3({ threedOptions: [] }) },
  );
  ck(
    same(none.params.threed, THREED({ referenceMediaIds: [42] })),
    'threed_options пуст: texture/pbr/quality/follow — все пустые',
    show(none.params.threed),
  );

  // Follow travels only when the server lists it (never in phase 2).
  ck(plain.params.threed.follow === '', 'follow не объявлен → пусто');
  const withFollow = t3().wire(
    { ...fresh3([media(42)]), choices: { follow: 'shape' } },
    { band: band3({ threedOptions: [...OPTS3, 'follow'] }) },
  );
  ck(
    withFollow.params.threed.follow === 'shape',
    'follow объявлен → уезжает выбранное слово (shape)',
    show(withFollow.params.threed),
  );

  // validate: the picture is the one refusal before money.
  const empty = t3().validate(M.initialDraft(t3()), { band: b });
  ck(empty?.section === 'reference', 'нет картинки → отказ на секции reference', show(empty));
  ck(t3().validate(fresh3([media(42)]), { band: b }) === null, 'с картинкой — отказа нет');

  // Shape and price words.
  ck(
    t3().shape(fresh3([media(42)]), plain) === '1 model · about $1.20' &&
      t3().shape(fresh3([media(41)]), full) === '1 model · about $1.40',
    'строка GENERATE: «1 model · about $1.20» / «about $1.40» у detailed',
    `${t3().shape(null, plain)} | ${t3().shape(null, full)}`,
  );

  // The gate: the list AND the options field.
  const g = (bb) => def('image_to_3d').gate(bb);
  ck(
    same(g(band()), { available: false, reason: 'not on this server yet' }),
    'ворота: списка нет (старый сервер) → «not on this server yet»',
    show(g(band())),
  );
  ck(
    same(g(band({ playgroundWorkflows: ['image_to_3d'] })), {
      available: false,
      reason: 'not on this server yet',
    }),
    'ворота: в списке, но threed_options нет → приглушена',
    show(g(band({ playgroundWorkflows: ['image_to_3d'] }))),
  );
  ck(
    g(band({ playgroundWorkflows: ['image_to_3d'], threedOptions: [] })).available === true,
    'ворота: в списке и threed_options есть (даже пустой) → открыта',
  );
  ck(
    /not wired/.test(
      g(band({ playgroundWorkflows: ['create_edit'], threedOptions: OPTS3 })).reason ?? '',
    ),
    'ворота: не в списке → «not wired on this server»',
  );
  ck(
    liveKeys(M.gridMarkup(band3())).has('image_to_3d') &&
      !liveKeys(M.gridMarkup(band({ playgroundWorkflows: ['image_to_3d'] }))).has('image_to_3d'),
    'сетка: плитка жива только при threed_options',
  );

  // The form's markup: rows only for what the server lists; the fold's header says the quality.
  const all = M.panelMarkup(b, 'image_to_3d');
  ck(
    /data-toggle-row="texture"/.test(all) &&
      /data-toggle-row="pbr"/.test(all) &&
      /data-option-row="quality"/.test(all) &&
      !/data-option-row="follow"/.test(all),
    'форма: Texture, Realistic materials, Quality есть, Follow нет (не объявлен)',
  );
  ck(/Realistic materials/.test(all), 'строка «Realistic materials» названа словами владельца');
  const heads = [...all.matchAll(/data-fold-value="">([^<]*)</g)].map((m) => m[1]);
  ck(heads.includes('standard'), 'шапка «3D options» — «standard»', show(heads));
  ck(/data-fold-section="image_to_3d\.options"/.test(all), 'секция 3D options есть');
  const pbrOnlyForm = M.panelMarkup(band3({ threedOptions: ['pbr'] }), 'image_to_3d');
  ck(
    /data-toggle-row="pbr"/.test(pbrOnlyForm) &&
      !/data-toggle-row="texture"/.test(pbrOnlyForm) &&
      !/data-option-row="quality"/.test(pbrOnlyForm),
    'объявлен только pbr → только его строка',
  );
  const noneForm = M.panelMarkup(band3({ threedOptions: [] }), 'image_to_3d');
  ck(
    noneForm.length > 0 && !/data-fold-section="image_to_3d\.options"/.test(noneForm),
    'threed_options пуст → секции 3D options нет вовсе',
  );
  const followForm = M.panelMarkup(band3({ threedOptions: [...OPTS3, 'follow'] }), 'image_to_3d');
  ck(
    /data-option-row="follow"/.test(followForm) && /The photo/.test(followForm),
    'follow объявлен → строка Follow «The photo | The shape»',
  );
  const bareForm = M.panelMarkup(b, 'image_to_3d', {
    ...fresh3([media(42)]),
    flags: { texture: false, pbr: true },
  });
  ck(
    /turn it on first/.test(bareForm),
    'текстура off → у строки материалов сказано, почему она выключена',
  );

  // Results: its own block (the card's 3D models); the history narrows to threed runs.
  const r = t3().results;
  ck(
    typeof r.view === 'function' && same(r.reps, ['threed']),
    'результаты: свой блок (view) и reps [threed]',
  );
  const runs3 = [
    { id: 1, kind: 'threed' },
    { id: 2, kind: 'freeform' },
    { id: 3, kind: 'render' },
  ];
  const m3 = M.playgroundHistoryMatch('image_to_3d', b);
  ck(
    same(
      runs3.filter(m3).map((x) => x.id),
      [1],
    ),
    'история под плиткой: только threed-прогоны',
  );
  ck(
    M.playgroundHistoryRep('image_to_3d', b) === 'threed' &&
      M.playgroundHistoryRep('create_edit', band({ playgroundWorkflows: ['create_edit'] })) ===
        'playground' &&
      M.playgroundHistoryRep(null, b) === 'playground',
    'слово истории: threed под Image to 3D, playground под другими и на сетке',
  );

  // Recall: the first reference and the options; a bench build is said, not guessed.
  const past = {
    id: 77,
    kind: 'threed',
    params: {
      threed: THREED({
        referenceMediaIds: [42, 43],
        texture: 'off',
        pbr: 'off',
        quality: 'detailed',
      }),
    },
  };
  const back = t3().recall(
    past,
    new Map([
      [42, media(42)],
      [43, media(43)],
    ]),
  );
  ck(
    same(
      back.draft.images.reference.map((x) => x.id),
      [42],
    ) &&
      back.draft.flags.texture === false &&
      back.draft.choices.quality === 'detailed' &&
      back.said.some((w) => /1 more angle/.test(w)),
    'рекол: первая картинка, опции, лишний ракурс назван',
    show(back),
  );
  const bench = t3().recall({ id: 78, kind: 'threed', params: { threed: THREED({}) } }, new Map());
  ck(
    bench.draft.images.reference.length === 0 && bench.said.some((w) => /render bench/.test(w)),
    'рекол сборки STEP 5 (верстак): картинки нет, сказано почему',
    show(bench),
  );
}

// ─── U · рельс без STEP 5 (C-10) ───────────────────────────────────────────────────────────────
head('U', 'рельс: STEP 5 только у сервера без playground_workflows; ?step=threed; счёт шагов');
{
  const ids = (list) => list.map((st) => st.id).join(',');
  const oldSrv = { band: band(), bandless: false };
  const newSrv = { band: band({ playgroundWorkflows: [] }), bandless: false };
  const silent = { band: {}, bandless: true };
  ck(
    ids(M.railSteps(oldSrv)) === 'card,mood,flat,pattern,render,threed',
    'старый сервер (band без playground_workflows): шесть ячеек, STEP 5 последней',
    ids(M.railSteps(oldSrv)),
  );
  ck(
    ids(M.railSteps(newSrv)) === 'card,mood,flat,pattern,render',
    'новый сервер (список есть, даже пустой): пять ячеек, без 3d',
    ids(M.railSteps(newSrv)),
  );
  ck(
    ids(M.railSteps(silent)) === 'card,mood,flat,pattern,render',
    'сервер молчит (полоса грузится / не отвечает): STEP 5 не рисуется',
    ids(M.railSteps(silent)),
  );
  ck(
    !M.STEPS.some((st) => st.id === 'threed') && M.THREED_STEP.label === '3d',
    'STEPS без threed; STEP 5 — отдельная константа «3d»',
  );
  ck(M.stepOfKind('threed').label === '3d', 'stepOfKind(threed) — ярлык «3d» (слово пикеров)');

  ck(
    same(M.legacyStep('threed', true), { step: 'playground', wf: 'image_to_3d' }),
    '?step=threed на новом сервере → playground + image_to_3d',
    show(M.legacyStep('threed', true)),
  );
  ck(M.legacyStep('threed', false) === null, '?step=threed на старом — живой шаг, не старый адрес');
  ck(M.legacyStep('threed') === null, '…и без ответа сервера (флаг по умолчанию) — тоже нет');
  ck(
    M.legacyStep('threed', true) === M.legacyStep('threed', true),
    'ответ — одна ссылка (эффект перезаписи не перезапускается)',
  );
  ck(
    same(M.legacyStep('aside', true), { step: 'playground', wf: 'change_color' }),
    '?step=aside — как было',
  );
  // The composer's reading of `?step=` (studio-tab: `decided`).
  const at = (v, r) => M.addressedStep(v, r);
  ck(
    at('threed', true) === 'playground' &&
      at('threed', false) === 'threed' &&
      at('aside', false) === 'playground' &&
      at('flat', true) === 'flat' &&
      at('junk', true) === null &&
      at(null, true) === null,
    'addressedStep: threed → playground на новом, threed на старом; aside, flat, мусор — как прежде',
    show([
      at('threed', true),
      at('threed', false),
      at('aside', false),
      at('flat', true),
      at('junk', true),
    ]),
  );

  // A card where everything is done: the counter's ceiling is the rail's length.
  const plate = (kind, viewKey, id) => ({
    id,
    kind,
    viewKey,
    colorwayId: 0,
    picture: { id: 800 + id, media: media(800 + id) },
  });
  const doneBand = (over) =>
    band({
      bench: [
        plate('flat', 'front', 1),
        plate('flat', 'back', 2),
        plate('render', 'front', 3),
        plate('render', 'back', 4),
      ],
      runs: [{ id: 5, kind: 'threed', pictures: [{ id: 9 }] }],
      ...over,
    });
  const ctxOf = (b, threed) => ({
    band: b,
    bandless: false,
    now: null,
    card: { name: 'coat', styleNumber: 'S1', categoryId: 3, baseSampleSizeId: 0, pastIdea: false },
    moodPictures: 1,
    moodConcept: 'a coat',
    counts: { pattern: 1, render: 2, threed, onmodel: 0, playground: 0 },
    colorway: { id: 0, label: '', archived: false },
  });
  const oldDone = ctxOf(doneBand({}), 1);
  const newDone = ctxOf(doneBand({ playgroundWorkflows: ['image_to_3d'] }), 1);
  ck(
    M.doneCount(newDone) === 5 && M.railSteps(newDone).length === 5,
    'новый сервер, всё сделано: «5 of 5»',
    `${M.doneCount(newDone)} of ${M.railSteps(newDone).length}`,
  );
  ck(
    M.doneCount(oldDone) === 6 && M.railSteps(oldDone).length === 6,
    'старый сервер, всё сделано вместе с 3D: «6 of 6» (как до волны)',
    `${M.doneCount(oldDone)} of ${M.railSteps(oldDone).length}`,
  );
  // Only the 3D model is missing: the old server opens on STEP 5, the new one's chain is complete.
  const oldNo3d = ctxOf(doneBand({}), 0);
  const newNo3d = ctxOf(doneBand({ playgroundWorkflows: ['image_to_3d'] }), 0);
  ck(
    M.defaultStep(oldNo3d) === 'threed',
    'старый сервер без 3D-модели: карточка открывается на STEP 5',
    M.defaultStep(oldNo3d),
  );
  ck(
    M.defaultStep(newNo3d) === 'card',
    'новый сервер: цепь из пяти завершена — открывается там, где начиналась, не на 3d',
    M.defaultStep(newNo3d),
  );
  // A render bench with no FRONT blocks STEP 5 on the old rail; the new rail has no such link.
  const noFront = (over) =>
    band({
      bench: [plate('flat', 'front', 1), plate('flat', 'back', 2), plate('render', 'back', 4)],
      ...over,
    });
  const oldBlock = M.nearestBlock(ctxOf(noFront({}), 0));
  const newBlock = M.nearestBlock(ctxOf(noFront({ playgroundWorkflows: [] }), 0));
  ck(
    oldBlock?.stepId === 'threed',
    'старый сервер: рендер без FRONT держит STEP 5 (полоса LOCKED как прежде)',
    show(oldBlock),
  );
  ck(newBlock === null, 'новый сервер: полосы LOCKED про 3d нет', show(newBlock));

  // The rail itself, drawn by React: the cells and the counter on each server.
  const cells = (markup) => [...markup.matchAll(/data-step="([a-z]+)"/g)].map((m) => m[1]);
  const oldRail = M.railMarkup(oldDone);
  const newRail = M.railMarkup(newDone);
  ck(
    cells(oldRail).includes('threed') && /6 of 6 steps/.test(oldRail),
    'рельс старого сервера: ячейка 3d и «6 of 6 steps»',
    show(cells(oldRail)),
  );
  ck(
    !cells(newRail).includes('threed') && /5 of 5 steps/.test(newRail),
    'рельс нового сервера: без ячейки 3d, «5 of 5 steps»',
    show(cells(newRail)),
  );
  ck(cells(newRail).includes('playground'), 'PLAYGROUND на месте');
}

const expected = MUTATED ? ' (прогон С МУТАЦИЕЙ — провалы ожидаются)' : '';
console.log(
  `\n${bad === 0 ? 'ЗЕЛЕНО' : 'КРАСНО'}: ${total - bad} / ${total} проверок прошло, провалов ${bad}` +
    (bad ? ` в группах ${[...failedIn].join(', ')}` : '') +
    expected,
);
process.exit(bad === 0 ? 0 : 1);
