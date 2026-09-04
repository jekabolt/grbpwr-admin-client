#!/usr/bin/env node
// ЦВЕТОВОЙ ПЛАН: ПАЛИТРА СОБИРАЕТСЯ ЗАПИСЬЮ, А НАЗНАЧЕННАЯ ТКАНЬ ДОЕЗЖАЕТ С МЕТКОЙ.
//
// Зачем проба вообще. У фичи A две половины, и каждая ломается молча.
//   ПЕРВАЯ — ПАЛИТРА. И кисть, и ведро смешивают пиксели на краю; проход по готовому холсту
//   возвращает сотни оттенков, которых никто не выбирал. Человек назначал бы ткани цветам,
//   которых на экране нет, а ПЛАТНЫЙ промпт объявлял бы модели детали, размеченные
//   несуществующей меткой. Защита — закрытое множество кандидатов, записанных в момент коммита
//   жеста, и точное равенство при скане (`exactPalette`).
//   ВТОРАЯ — ПРОВОД. `map_hex` доезжает до промпта строкой «used on the parts painted steel blue
//   (#3a7bd5) on the colour map». Потеряй его сборщик — и прогон с двумя тканями получит правило
//   «деление за вами» вместо сужения, за те же деньги. Ревью бэкенда `5dbb3b5` показало и
//   обратную беду: метка БЕЗ карты заставляет сервер сослаться на картинку, которая не уезжала.
//
// ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ:
//   цитата А — два покрашенных цвета дают РОВНО ДВЕ строки палитры: ободок, полупрозрачный край,
//              чёрные линии и бумага не проходят точное равенство и не становятся метками;
//   цитата Б — назначенная ткань доезжает в `params.colour.fabrics` с ВЕРНЫМ `map_hex`, вместе с
//              картой в `colour_maps` и с главной фотографией первой ткани;
//   правило 1 — метки без карты не бывает: без карт рецепт возвращается БАЙТ В БАЙТ базовым, а
//              цвет, которого нет на палитре уезжающей карты, не даёт строки ткани;
//   правило 2 — две карты на одну картинку → уезжает одна; две ткани на один цвет → одна строка;
//   правило 3 — карта, которая уже уезжает плитой верстака / референсом / лоскутом ткани, ворота
//              отвергают ДО денег;
//   ворота    — покрашенный и не назначенный цвет называется по имени; устаревшая карта отказывает;
//   контроль  — соседние поля строки (`words`, `colourHex`, `name`, `mediaId`) обязаны выживать.
//              Позеленело только они — значит мутация точечная, а не «стенд лёг целиком».
//
// МУТАЦИИ ЖИВУТ В ПАМЯТИ, А НЕ В ФАЙЛЕ (приём `bom-pantone-probe`): правка исходника ради
// проверки — это правка, которую однажды забудут откатить.
//   node scripts/colour-plan-probe.mjs               прогон
//   node scripts/colour-plan-probe.mjs --mutate-scan ОТКРЫВАЕТ множество кандидатов в `exactPalette`
//                                                    (ровно ловушка дизайна: «собрать палитру
//                                                    сканом готового холста») — цитата А обязана
//                                                    покраснеть, цитата Б остаться зелёной
//   node scripts/colour-plan-probe.mjs --mutate-hex  снимает `mapHex` из сборщика тканей — цитата Б
//                                                    краснеет, цитата А остаётся зелёной
//
// РЕЗУЛЬТАТ ПРОГОНА МУТАЦИЙ (2026-09-04, ветка feat/design-band-ui):
//   чистый прогон  → 37 / 37, провалов 0;
//   --mutate-scan  → 4 провала, ВСЕ в цитате А (палитра выросла с 2 строк до 200: ободок, бумага и
//                    чернила чертежа стали «использованными цветами»). Цитата Б и все три правила
//                    остались зелёными — защита точечная, а не «стенд лёг целиком»;
//   --mutate-hex   → 4 провала: две метки в цитате Б и обе проверки правила 2, которое читает те же
//                    метки. Цитата А при этом зелёная — скан не тронут.
//   Обе мутации живут ТОЛЬКО в бандле; исходник после прогона байт в байт тот же.
//
// Проба СЧИТАЕТ ПРОВАЛЫ и печатает их число: ноль провалов при упавшей сборке — это не зелень, а
// молчание, поэтому число исходов печатается всегда.

import { build as esbuild } from 'esbuild';
import { rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE_SCAN = process.argv.includes('--mutate-scan');
const MUTATE_HEX = process.argv.includes('--mutate-hex');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// ─── мутации: одна строка НАСТОЯЩЕГО модуля подменяется в бандле ─────────────────────────────
const CLOSED_SET_LINE = '  const admit = (packed: number): number => want.get(packed) ?? -1;';
const OPEN_SET_LINE = `  const admit = (packed: number): number => {
    const seat = want.get(packed);
    if (seat !== undefined) return seat;
    want.set(packed, order.length);
    order.push(\`#\${packed.toString(16).padStart(6, '0')}\`);
    counts.push(0);
    return order.length - 1;
  };`;
const MAP_HEX_LINE = '        mapHex: colour.hex,';

const swap = (name, needle, replacement) => ({
  name,
  setup(b) {
    b.onLoad({ filter: /colour-plan\/model\.ts$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(needle)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
      return { contents: src.replace(needle, replacement), loader: 'ts' };
    });
  },
});

const plugins = [];
if (MUTATE_SCAN) plugins.push(swap('open-the-candidate-set', CLOSED_SET_LINE, OPEN_SET_LINE));
if (MUTATE_HEX) plugins.push(swap('drop-map-hex', MAP_HEX_LINE, ''));

const outfile = resolve(REPO, `scripts/.colour-plan-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'colour-plan-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: REPO,
  outfile,
  logLevel: 'silent',
  plugins,
  // Пути репозитория — те же, что у vite/tsconfig: иначе бандл соберёт не тот модуль, а стенд
  // будет уверенно мерять чужой код.
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
const M = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

const BLUE = '#3a7bd5';
const RED = '#e0201b';
const MAP_MEDIA = 900;
const FRONT_MEDIA = 10;

const side = { view: 'front', pictureId: 1, mediaId: FRONT_MEDIA };
const assets = [
  { id: 7, name: 'jersey', mediaId: 70, colourHex: '#101010', note: 'fine rib' },
  { id: 8, name: 'contrast rib', mediaId: 80 },
];
const wireMap = (over = {}) => ({
  mediaId: MAP_MEDIA,
  view: 'front',
  baseMediaId: FRONT_MEDIA,
  palette: [
    { hex: BLUE, px: 4000 },
    { hex: RED, px: 3000 },
  ],
  ...over,
});
const wirePlan = (over = {}) => ({
  techCardId: 1,
  rev: 3,
  maps: [wireMap()],
  cloths: [
    { hex: BLUE, assetId: 7, colourHex: '', words: '', parts: '' },
    { hex: RED, assetId: 8, colourHex: '', words: 'ribbed knit', parts: '' },
  ],
  updatedBy: '',
  updatedAt: null,
  ...over,
});

// ─── ЦИТАТА А: палитра собирается по ЗАКРЫТОМУ множеству ─────────────────────────────────────
head('цитата А — два покрашенных цвета дают ровно две строки палитры');
{
  const doc = M.paintedDoc({
    w: 200,
    h: 100,
    fills: [
      { hex: BLUE, px: 4000 },
      { hex: RED, px: 3000 },
    ],
    rimPx: 800,
    softPx: 300,
  });
  // Ровно то, что записал бы редактор: два выбранных цвета плюс чернила чертежа и бумага, которые
  // `isMapInk` обязан отбросить сам.
  const recorded = [BLUE, RED, '#000000', '#ffffff'];
  const palette = M.exactPalette(doc, recorded);
  ck(palette.length === 2, 'ровно две строки палитры', `получено ${palette.length}`);
  ck(palette[0]?.hex === BLUE && palette[0]?.px === 4000, 'первая строка — первый покрашенный цвет и его точный счёт', JSON.stringify(palette[0]));
  ck(palette[1]?.hex === RED && palette[1]?.px === 3000, 'вторая строка — второй', JSON.stringify(palette[1]));
  ck(
    !palette.some((s) => s.hex === '#ffffff' || s.hex === '#000000'),
    'бумага и чернила чертежа метками не становятся',
  );
  const rim = palette.filter((s) => s.hex !== BLUE && s.hex !== RED);
  ck(rim.length === 0, 'ободок и полупрозрачный край не добавили ни одной метки', JSON.stringify(rim.slice(0, 3)));
  // КОНТРОЛЬ ЖИВОСТИ: стенд обязан УМЕТЬ увидеть цвет. Нулевая палитра на всё подряд была бы
  // «зелёной» по первому пункту и не значила бы ничего.
  const third = M.exactPalette(doc, [BLUE]);
  ck(third.length === 1 && third[0].px === 4000, 'КОНТРОЛЬ: сузив кандидатов до одного, скан считает именно его', JSON.stringify(third));
}

// ─── ЦИТАТА Б: назначенная ткань доезжает с меткой ───────────────────────────────────────────
head('цитата Б — назначенная ткань уезжает в payload с верным map_hex');
{
  const band = M.makeBand({ sides: [side], assets, plan: wirePlan() });
  const plan = M.readPlan(band);
  const wire = M.planRecipe(band, plan, M.baseRecipe());
  const f = wire.fabrics ?? [];
  ck(f.length === 2, 'две ткани — по одной на покрашенный цвет', `получено ${f.length}`);
  ck(f[0]?.mapHex === BLUE, 'первая несёт метку первого покрашенного цвета', String(f[0]?.mapHex));
  ck(f[1]?.mapHex === RED, 'вторая — метку второго', String(f[1]?.mapHex));
  ck(f[0]?.assetId === 7 && f[0]?.name === 'jersey', 'КОНТРОЛЬ: копия ассета снята с полки', JSON.stringify([f[0]?.assetId, f[0]?.name]));
  ck(f[0]?.mediaId === 70, 'КОНТРОЛЬ: фотография лоскута на месте', String(f[0]?.mediaId));
  ck(f[1]?.words === 'ribbed knit', 'КОНТРОЛЬ: слова строки перебивают заметку ассета', String(f[1]?.words));
  ck((wire.colourMaps ?? []).length === 1, 'карта уезжает с прогоном', JSON.stringify(wire.colourMaps));
  ck((wire.colourMaps ?? [])[0]?.mediaId === MAP_MEDIA, 'и это именно та картинка', String((wire.colourMaps ?? [])[0]?.mediaId));
  ck(wire.fabricMediaId === 70, 'главная фотография — фотография ПЕРВОЙ ткани списка', String(wire.fabricMediaId));
  ck(wire.words === 'fine rib jersey', 'КОНТРОЛЬ: слова прогона не тронуты — их пишет человек', String(wire.words));
}

// ─── ПРАВИЛО 1: метки без карты не бывает ────────────────────────────────────────────────────
head('правило 1 — `map_hex` только вместе с картой, и только с палитры этой карты');
{
  const band = M.makeBand({ sides: [side], assets, plan: wirePlan({ maps: [] }) });
  const plan = M.readPlan(band);
  const base = M.baseRecipe();
  const wire = M.planRecipe(band, plan, base);
  ck(JSON.stringify(wire) === JSON.stringify(base), 'без карт рецепт возвращается БАЙТ В БАЙТ базовым');
  ck((wire.colourMaps ?? []).length === 0, 'и `colour_maps` не появляется на проводе вовсе');
  ck(!JSON.stringify(wire).includes('mapHex'), 'и `map_hex` не появляется ни в одной строке');

  // Цвет, назначенный, но не покрашенный: строка есть в плане, метки на карте нет.
  const orphan = M.makeBand({
    sides: [side],
    assets,
    plan: wirePlan({
      maps: [wireMap({ palette: [{ hex: BLUE, px: 4000 }] })],
      cloths: [
        { hex: BLUE, assetId: 7, colourHex: '', words: '', parts: '' },
        { hex: '#00ff88', assetId: 8, colourHex: '', words: '', parts: '' },
      ],
    }),
  });
  const orphanWire = M.planRecipe(orphan, M.readPlan(orphan), M.baseRecipe());
  ck((orphanWire.fabrics ?? []).length === 1, 'цвет, которого нет на палитре карты, строки ткани не даёт', `получено ${(orphanWire.fabrics ?? []).length}`);
  ck(
    !(orphanWire.fabrics ?? []).some((f) => f.mapHex === '#00ff88'),
    'и его метка на провод не уезжает',
  );
}

// ─── ПРАВИЛО 2: одна картинка — одна карта; один цвет — одна ткань ───────────────────────────
head('правило 2 — дублей не бывает ни у карт, ни у меток');
{
  const twin = M.makeBand({
    sides: [side, { view: 'back', pictureId: 2, mediaId: 11 }],
    assets,
    plan: wirePlan({
      maps: [wireMap(), wireMap({ view: 'back', baseMediaId: 11 })],
    }),
  });
  const maps = M.sendableMaps(twin, M.readPlan(twin));
  ck(maps.length === 1, 'две карты на ОДНУ картинку — уезжает одна', `получено ${maps.length}`);

  const dupe = M.makeBand({
    sides: [side],
    assets,
    plan: wirePlan({
      cloths: [
        { hex: BLUE, assetId: 7, colourHex: '', words: '', parts: '' },
        { hex: BLUE, assetId: 8, colourHex: '', words: '', parts: '' },
        { hex: RED, assetId: 8, colourHex: '', words: '', parts: '' },
      ],
    }),
  });
  const dupeWire = M.planRecipe(dupe, M.readPlan(dupe), M.baseRecipe());
  const blues = (dupeWire.fabrics ?? []).filter((f) => f.mapHex === BLUE);
  ck(blues.length === 1, 'две ткани на ОДИН покрашенный цвет — остаётся одна', `получено ${blues.length}`);
  ck(blues[0]?.assetId === 7, 'и это первая из них, а не последняя выигравшая молча', String(blues[0]?.assetId));
}

// ─── ПРАВИЛО 3: карта не может быть плитой, референсом или лоскутом ──────────────────────────
head('правило 3 — картинка не бывает и чертежом, и листом меток');
{
  const asPlate = M.makeBand({
    sides: [side],
    assets,
    plan: wirePlan({ maps: [wireMap({ mediaId: FRONT_MEDIA })] }),
  });
  const g1 = M.colourPlanGate(asPlate, M.readPlan(asPlate));
  ck(g1.ok === false, 'карта = плита верстака → ворота закрыты', JSON.stringify(g1));
  ck(!g1.ok && /plate/.test(g1.reason), 'и отказ называет роль картинки', !g1.ok ? g1.reason : '');

  const asRef = M.makeBand({
    sides: [side],
    assets,
    references: [MAP_MEDIA],
    plan: wirePlan(),
  });
  const g2 = M.colourPlanGate(asRef, M.readPlan(asRef));
  ck(g2.ok === false && /reference/.test(g2.reason ?? ''), 'карта = референс → ворота закрыты', JSON.stringify(g2));

  const asSwatch = M.makeBand({
    sides: [side],
    assets: [{ id: 7, name: 'jersey', mediaId: MAP_MEDIA }, assets[1]],
    plan: wirePlan(),
  });
  const g3 = M.colourPlanGate(asSwatch, M.readPlan(asSwatch));
  ck(g3.ok === false && /swatch/.test(g3.reason ?? ''), 'карта = лоскут ткани прогона → ворота закрыты', JSON.stringify(g3));
}

// ─── ВОРОТА: неназначенный цвет и устаревшая карта ───────────────────────────────────────────
head('ворота — покрашенное без ответа и покрашенное по чужому чертежу');
{
  const unassigned = M.makeBand({
    sides: [side],
    assets,
    plan: wirePlan({ cloths: [{ hex: BLUE, assetId: 7, colourHex: '', words: '', parts: '' }] }),
  });
  const g = M.colourPlanGate(unassigned, M.readPlan(unassigned));
  ck(g.ok === false, 'покрашенный и не назначенный цвет закрывает дверь', JSON.stringify(g));
  ck(!g.ok && g.reason.includes(RED), 'и отказ называет ИМЕННО ЭТОТ цвет', !g.ok ? g.reason : '');

  const stale = M.makeBand({
    sides: [{ view: 'front', pictureId: 5, mediaId: 99 }],
    assets,
    plan: wirePlan(),
  });
  const gs = M.colourPlanGate(stale, M.readPlan(stale));
  ck(gs.ok === false && /repaint/.test(gs.reason ?? ''), 'флэт сменился под картой → дверь закрыта', JSON.stringify(gs));
  ck(
    M.sendableMaps(stale, M.readPlan(stale)).length === 0,
    'и такая карта на провод не уезжает',
  );

  const ok = M.makeBand({ sides: [side], assets, plan: wirePlan() });
  ck(M.colourPlanGate(ok, M.readPlan(ok)).ok === true, 'КОНТРОЛЬ: полный план дверь открывает');
}

// ─── СЛУЧАЙНЫЙ МАЗОК ─────────────────────────────────────────────────────────────────────────
head('случайный мазок — виден в ведомости, но не требует ткани и не едет');
{
  const strayBand = M.makeBand({
    sides: [side],
    assets,
    plan: wirePlan({
      maps: [
        wireMap({
          palette: [
            { hex: BLUE, px: 4000 },
            { hex: RED, px: 3000 },
            { hex: '#00ff88', px: 3 },
          ],
        }),
      ],
    }),
  });
  const plan = M.readPlan(strayBand);
  const rows = M.planColours(strayBand, plan);
  ck(rows.length === 3, 'строка в ведомости есть у всех трёх', `получено ${rows.length}`);
  ck(rows[2]?.stray === true, 'третья названа случайной', JSON.stringify(rows[2]));
  ck(M.colourPlanGate(strayBand, plan).ok === true, 'и дверь она не закрывает');
  const wire = M.planRecipe(strayBand, plan, M.baseRecipe());
  ck((wire.fabrics ?? []).length === 2, 'на провод уезжают только две настоящие', `получено ${(wire.fabrics ?? []).length}`);
}

console.log(
  `\n${bad === 0 ? 'ЗЕЛЕНО' : 'КРАСНО'}: ${total - bad} / ${total} проверок прошло, провалов ${bad}` +
    (MUTATE_SCAN || MUTATE_HEX ? ' (прогон С МУТАЦИЕЙ — провалы ожидаются)' : ''),
);
process.exit(bad === 0 ? 0 : 1);
