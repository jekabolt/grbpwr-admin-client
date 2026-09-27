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
//
// C-10 (плитка 12 Image to 3D, STEP 5 уходит с рельса):
//   J · wire() / validate() / ворота / разметка / рекол плитки image_to_3d: тело режима референса
//       ЦЕЛИКОМ; опции уезжают только объявленные сервером (threed_options), иначе ''; pbr без
//       текстуры не уезжает никогда; follow — только если объявлен; колорвей — только у плиты
//       рендер-верстака; результаты — свой блок моделей, история — threed-прогоны, слово «3D runs»;
//   K · рельс: STEP 5 есть ровно у отвечающего сервера без playground_workflows (6 ячеек, «N of 6»),
//       у нового — 5 ячеек и «N of 5», пока сервер молчит — тоже 5; `?step=threed` переписывается
//       только у нового; defaultStep/nearestBlock на новом не называют threed.
//   node scripts/playground-registry-probe.mjs --mutate-threed-options  опции рисуются и уезжают без
//                                                                   слова сервера → краснеет J
//   node scripts/playground-registry-probe.mjs --mutate-threed-pbr  pbr уезжает и без текстуры
//                                                                   → краснеет J
//   node scripts/playground-registry-probe.mjs --mutate-threed-gate ворота не ждут threed_options
//                                                                   → краснеет J
//   node scripts/playground-registry-probe.mjs --mutate-threed-colorway колорвей плиты не
//                                                                   привязывается → краснеет J
//   node scripts/playground-registry-probe.mjs --mutate-rail-threed STEP 5 на рельсе всегда
//                                                                   → краснеет K
//   node scripts/playground-registry-probe.mjs --mutate-legacy-threed `?step=threed` переписывается
//                                                                   и у старого сервера → краснеет K
//   node scripts/playground-registry-probe.mjs --mutate-step-first  композитор спрашивает шаг раньше
//                                                                   старого адреса → краснеет K
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
      /registry\/index\.ts$/,
      "if (kind === 'cutout') return 'remove_background';",
      '',
    ),
  );

if (MUT.presetMatch)
  plugins.push(
    swap(
      'match-on-preset',
      /tiles\/create-edit\.tsx$/,
      "match: (run) => (run.kind ?? '').trim().toLowerCase() === 'freeform',",
      "match: (run) => (run.kind ?? '').trim().toLowerCase() === 'freeform' && (run.params === undefined || (run.params.freeform?.preset ?? '').trim() === 'free'),",
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
      band({ playgroundWorkflows: ALL, freeformPresets: undefined }),
      ['change_color', 'remove_background', 'create_edit'],
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

// ─── J · плитка 12 Image to 3D (C-10) ─────────────────────────────────────────────────────────
head('J', 'Image to 3D: тело режима референса, опции по слову сервера, ворота, разметка, рекол');
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

// ─── K · рельс без STEP 5 (C-10) ───────────────────────────────────────────────────────────────
head('K', 'рельс: STEP 5 только у сервера без playground_workflows; ?step=threed; счёт шагов');
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
