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
      freeform: { preset: 'free', items: [item(31), item(32), item(33)] },
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
    same(pick('create_edit'), ['freeform/free']),
    'история create_edit — только freeform/free',
    show(pick('create_edit')),
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

const expected = MUTATED ? ' (прогон С МУТАЦИЕЙ — провалы ожидаются)' : '';
console.log(
  `\n${bad === 0 ? 'ЗЕЛЕНО' : 'КРАСНО'}: ${total - bad} / ${total} проверок прошло, провалов ${bad}` +
    (bad ? ` в группах ${[...failedIn].join(', ')}` : '') +
    expected,
);
process.exit(bad === 0 ? 0 : 1);
