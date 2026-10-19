#!/usr/bin/env node
// АВТО-ПОДБОР АРТИКУЛА ПОД КОЛОРВЕЙ — ПРОБА ЧИСТОГО МАТЧЕРА (colourway-material-match.ts).
//
//   node scripts/colourway-match-probe.mjs
//
// Бандл собирается esbuild'ом из НАСТОЯЩЕГО модуля (scripts/colourway-match-entry.ts), фикстуры —
// здесь же. Проба считает провалы и печатает их число: ноль провалов при упавшей сборке — молчание.
//
// СЛУЧАИ: ΔE2000 против эталона Sharma; точное совпадение цвета; цвет слота со строки рецепта;
// нет данных о цвете; узкий рулон штрафуется; ручной пин сохраняется; артикул слота уже в цвет;
// несколько точных — не exact; слот без секции пропускается.

import { build as esbuild } from 'esbuild';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const outfile = resolve(REPO, `scripts/.colourway-match-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'colourway-match-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: REPO,
  outfile,
  logLevel: 'silent',
});
const { proposePins, deltaE2000, findPantone, planAuto } = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

// ─── фикстуры ────────────────────────────────────────────────────────────────────────────────
const FABRIC = 'TECH_CARD_BOM_SECTION_FABRIC';
const TRIM = 'TECH_CARD_BOM_SECTION_TRIM';
const dec = (v) => ({ value: String(v) });
const fabric = (id, over = {}) => ({
  id: String(id), // int64 едет строкой — матчер обязан читать через wireInt
  name: `fabric ${id}`,
  section: FABRIC,
  materialClass: 'MATERIAL_CLASS_FABRIC',
  supplier: 'Acme Mills',
  archived: false,
  purpose: 'MATERIAL_PURPOSE_PRODUCTION',
  fabricAttrs: { widthCm: dec(150), weightGsm: dec(240) },
  compositionEntries: [{ name: 'Cotton', percent: dec(100) }],
  latestPrice: { price: dec(10), currency: 'EUR' },
  ...over,
});
const trim = (id, over = {}) => ({
  id,
  name: `trim ${id}`,
  section: TRIM,
  materialClass: 'MATERIAL_CLASS_OTHER',
  supplier: 'Tapes Co',
  archived: false,
  ...over,
});

const CATALOG = [
  fabric(1, { name: 'twill black', pantone: '19-4005 TCX' }), // артикул слота L1
  fabric(2, { name: 'twill classic blue', pantone: '19-4052 TCX' }),
  fabric(3, {
    name: 'twill blue narrow',
    color: '#11507F',
    fabricAttrs: { widthCm: dec(140), weightGsm: dec(240) },
  }),
  fabric(4, {
    name: 'twill blue wide',
    color: '#13517F',
    fabricAttrs: { widthCm: dec(155), weightGsm: dec(240) },
  }),
  fabric(5, { name: 'archived blue', pantone: '19-4052 TCX', archived: true }),
  fabric(6, {
    name: 'wool red',
    color: '#C0392B',
    compositionEntries: [{ name: 'Wool', percent: dec(100) }],
  }),
  trim(20), // артикул слота L2 — без цвета
  trim(21),
  trim(22, { supplier: 'Other' }),
];

const BOM = [
  { lineKey: 'L1', section: FABRIC, materialId: '1', fabricWidth: dec(150) },
  { lineKey: 'L2', section: TRIM, materialId: 20 },
  { lineKey: 'L3', name: 'unlinked, no section', materialId: 0 },
];

const cw = (id, over = {}) => ({
  colorwayId: String(id),
  status: 'COLORWAY_LIFECYCLE_STATUS_ACTIVE',
  usages: [],
  ...over,
});
const card = (...colorways) => ({ techCard: { bomItems: BOM }, colorways });
const BLUE = { pantone: '19-4052 TCX', pantoneSystem: 'TCX', label: '', hex: '#0F4C81' };
const BLACK = { pantone: '19-4005 TCX', pantoneSystem: 'TCX', label: '', hex: '#2B2B2B' };

const run = (colorway, catalog = CATALOG, extra = {}) =>
  proposePins({
    techCard: card(colorway),
    colorwayId: Number(colorway.colorwayId),
    catalog,
    ...extra,
  });
const forLine = (ps, key) => ps.filter((p) => p.lineKey === key);
const show = (ps) =>
  ps
    .map(
      (p) =>
        `${p.lineKey}→${p.materialId} ${p.score} ${p.confidence}${p.exact ? ' exact' : ''} [${p.reason}]`,
    )
    .join('\n        ');

// ─── 0. ΔE2000 ───────────────────────────────────────────────────────────────────────────────
head('0 — ΔE2000 против эталонных пар Sharma (2005)');
{
  const pairs = [
    [{ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ L: 50, a: -1.3802, b: -84.2814 }, { L: 50, a: 0, b: -82.7485 }, 1.0],
    [{ L: 50, a: 2.5, b: 0 }, { L: 50, a: 0, b: -2.5 }, 4.3065],
    [{ L: 2.0776, a: 0.0795, b: -1.135 }, { L: 0.9033, a: -0.0636, b: -0.5514 }, 0.9082],
  ];
  for (const [p, q, want] of pairs) {
    const got = deltaE2000(p, q);
    ck(
      Math.abs(got - want) < 1e-3,
      `ΔE(${p.L},${p.a},${p.b} · ${q.L},${q.a},${q.b}) = ${want}`,
      got.toFixed(4),
    );
  }
  ck(!!findPantone('19-4052 TCX'), 'КОНТРОЛЬ: пантон фикстуры есть в наборе');
}

// ─── 1. точное совпадение ────────────────────────────────────────────────────────────────────
head('1 — точное совпадение цвета (пантон главного цвета = пантон артикула)');
{
  const ps = run(cw(10, { colours: [BLUE] }));
  const l1 = forLine(ps, 'L1');
  console.log('        ' + show(l1));
  ck(l1.length === 1, 'одно предложение на слот', String(l1.length));
  ck(
    l1[0]?.materialId === 2 && l1[0]?.exact === true,
    'exact → артикул 2',
    JSON.stringify(l1[0]?.materialId),
  );
  ck(l1[0]?.confidence === 'high', 'confidence high');
  ck(l1[0]?.reason === l1[0]?.reasons.join(' · '), 'reason = reasons.join(" · ")');
  ck(!ps.some((p) => p.materialId === 5), 'архивный артикул не предлагается');
  ck(forLine(ps, 'L3').length === 0, 'слот без секции пропущен');
}

// ─── 1б. цвет слота со строки рецепта ───────────────────────────────────────────────────────
head('1б — цвет слота на строке рецепта старше главного цвета колорвея');
{
  const ps = run(
    cw(11, {
      colours: [{ ...BLACK, pantone: '', label: 'stone', hex: '#D9CFC1' }],
      usages: [{ bomLineKey: 'L1', pantone: '19-4052 TCX', color: '' }],
    }),
  );
  const l1 = forLine(ps, 'L1');
  ck(
    l1.length === 1 && l1[0].materialId === 2 && l1[0].exact,
    'слот L1 берёт синий со строки → артикул 2 exact',
    show(l1),
  );
}

// ─── 2. нет данных о цвете ───────────────────────────────────────────────────────────────────
head('2 — у артикулов нет цвета: подсказки low, «colour unknown», не exact');
{
  const ps = run(cw(12, { colours: [BLUE] }));
  const l2 = forLine(ps, 'L2');
  console.log('        ' + show(l2));
  ck(l2.length === 2, 'два кандидата (артикул слота не предлагается сам себе)', String(l2.length));
  ck(
    l2.every((p) => !p.exact && p.confidence === 'low'),
    'все low и не exact',
  );
  ck(
    l2.every((p) => p.reasons.includes('colour unknown') && p.deltaE === null),
    'причина «colour unknown», ΔE null',
  );
  ck(l2[0]?.materialId === 21, 'тот же поставщик выше (21 перед 22)', String(l2[0]?.materialId));
}

// ─── 3. узкий рулон штрафуется ───────────────────────────────────────────────────────────────
head('3 — без точного совпадения: узкий рулон ниже широкого при равном цвете');
{
  // Цель — hex, которого нет ни у одного артикула: точных совпадений нет, решает ΔE + сходство.
  const ps = run(
    cw(13, { colours: [{ pantone: '', pantoneSystem: '', label: 'ink blue', hex: '#12507F' }] }),
  );
  const l1 = forLine(ps, 'L1');
  console.log('        ' + show(l1));
  ck(l1.length === 3, 'до трёх подсказок', String(l1.length));
  ck(
    l1.every((p) => !p.exact),
    'ни одна не exact',
  );
  const wide = l1.findIndex((p) => p.materialId === 4);
  const narrow = l1.findIndex((p) => p.materialId === 3);
  ck(
    wide >= 0 && narrow >= 0 && wide < narrow,
    'широкий (4) выше узкого (3)',
    `${wide} < ${narrow}`,
  );
  ck(
    l1[narrow]?.reasons.some((r) => r.startsWith('narrower')),
    'у узкого причина «narrower …»',
  );
  ck(!l1.some((p) => p.materialId === 6), 'красный (ΔE > порога) не предлагается');
  ck(l1[0].score >= l1[1].score && l1[1].score >= l1[2].score, 'лучшая первой');
  ck(
    l1[0].confidence === 'low',
    'low: отрыв от второго меньше порога (почти одинаковые синие)',
    `${l1[0].score} vs ${l1[1].score}`,
  );
}

// ─── 4. ручной пин сохраняется ───────────────────────────────────────────────────────────────
head('4 — ручной пин колорвея не трогается');
{
  const ps = run(cw(14, { colours: [BLUE], usages: [{ bomLineKey: 'L1', materialId: '3' }] }));
  ck(forLine(ps, 'L1').length === 0, 'L1 с пином на 3 — без предложений', show(forLine(ps, 'L1')));
  const ps2 = run(cw(15, { colours: [BLUE], usages: [{ bomLineKey: 'L1', materialId: '1' }] }));
  ck(
    forLine(ps2, 'L1')[0]?.materialId === 2,
    'КОНТРОЛЬ: пин на артикул самого слота — не пин, предложение есть',
  );
  const ps3 = run(
    cw(16, {
      colours: [BLUE],
      usages: [{ bomLineKey: 'L1', pieceLineKey: 'P1', materialId: '3' }],
    }),
  );
  ck(forLine(ps3, 'L1')[0]?.materialId === 2, 'КОНТРОЛЬ: строка детали — не пин слота');
}

// ─── 5. артикул слота уже в цвет ─────────────────────────────────────────────────────────────
head('5 — артикул слота уже в цвет колорвея: предложений нет');
{
  const ps = run(cw(17, { colours: [BLACK] }));
  ck(
    forLine(ps, 'L1').length === 0,
    'L1 чёрный в чёрном колорвее — keeps the slot article',
    show(forLine(ps, 'L1')),
  );
  const near = run(
    cw(18, { colours: [{ pantone: '', pantoneSystem: '', label: 'off black', hex: '#2C2C2C' }] }),
  );
  ck(forLine(near, 'L1').length === 0, 'и при ΔE ≤ 3 без точного совпадения');
}

// ─── 6. несколько точных ─────────────────────────────────────────────────────────────────────
head('6 — два артикула в точный цвет: решает человек (exact=false, «one of 2 exact»)');
{
  const cat = [
    ...CATALOG,
    fabric(7, { name: 'twill classic blue B', pantone: '19-4052 TPX', supplier: 'Other' }),
  ];
  const l1 = forLine(run(cw(19, { colours: [BLUE] }), cat), 'L1');
  console.log('        ' + show(l1));
  ck(l1.length === 2 && l1.every((p) => !p.exact), 'два предложения, ни одно не exact');
  ck(l1[0]?.materialId === 2, 'тот же поставщик первым');
  ck(l1[0]?.reasons[0] === 'one of 2 exact', 'причина «one of 2 exact»');
}

// ─── 7. образец в финальном колорвее, склад ──────────────────────────────────────────────────
head('7 — sample-only артикул штрафуется в финальном колорвее; склад даёт бонус');
{
  const cat = CATALOG.map((m) => (m.id === '4' ? { ...m, purpose: 'MATERIAL_PURPOSE_SAMPLE' } : m));
  const target = {
    colours: [{ pantone: '', pantoneSystem: '', label: 'ink blue', hex: '#12507F' }],
  };
  const fin = forLine(run(cw(20, target), cat), 'L1').find((p) => p.materialId === 4);
  const dft = forLine(
    run(cw(21, { ...target, status: 'COLORWAY_LIFECYCLE_STATUS_DRAFT' }), cat),
    'L1',
  ).find((p) => p.materialId === 4);
  ck(
    fin && dft && fin.score < dft.score,
    'ACTIVE: счёт образца ниже, чем в DRAFT',
    `${fin?.score} < ${dft?.score}`,
  );
  ck(fin?.reasons.includes('sample-only article'), 'причина «sample-only article»');
  const st = forLine(run(cw(22, target), CATALOG, { stock: new Map([[3, 5]]) }), 'L1');
  ck(st.find((p) => p.materialId === 3)?.reasons.includes('in stock'), 'остаток > 0 → «in stock»');
  ck(st.find((p) => p.materialId === 4)?.reasons.includes('no stock'), 'остаток 0 → «no stock»');
}

head('5б — артикул слота не в каталоге: судит цвет на самой строке BOM');
{
  const techCard = {
    techCard: { bomItems: [{ lineKey: 'LX', section: FABRIC, materialId: 99, pantone: '19-4052 TCX' }] },
    colorways: [cw(23, { colours: [BLUE] })],
  };
  const ps = proposePins({ techCard, colorwayId: 23, catalog: CATALOG });
  ck(ps.length === 0, 'строка BOM уже синяя — предложений нет', JSON.stringify(ps.map((p) => p.materialId)));
  techCard.techCard.bomItems[0].pantone = '19-4005 TCX';
  const ps2 = proposePins({ techCard, colorwayId: 23, catalog: CATALOG });
  ck(ps2[0]?.materialId === 2 && ps2[0]?.exact, 'КОНТРОЛЬ: строка чёрная — предлагается синий 2 exact');
}

head('8 — детерминизм');
{
  const a = JSON.stringify(
    run(
      cw(13, { colours: [{ pantone: '', pantoneSystem: '', label: 'ink blue', hex: '#12507F' }] }),
    ),
  );
  const b = JSON.stringify(
    run(
      cw(13, { colours: [{ pantone: '', pantoneSystem: '', label: 'ink blue', hex: '#12507F' }] }),
      [...CATALOG].reverse(),
    ),
  );
  ck(a === b, 'порядок каталога не влияет на ответ');
}

head('9 — planAuto + предложения матчера (наша точная молчит: у колорвея нет ключей цвета)');
{
  const mat = (id, code, color) => ({ id, name: `m${id}`, code, color, section: FABRIC, archived: false });
  const M1 = mat(1, 'TW100 black', 'black');
  const M2 = mat(2, 'TW100 navy', 'navy');
  const M3 = mat(3, 'XY200 navy', 'navy');
  const slot = { lineKey: 'L1', section: FABRIC, unit: 'm', materialId: 1, material: M1 };
  const prop = (materialId, exact, score = 0.9) => ({
    lineKey: 'L1', materialId, score, confidence: 'high', exact, deltaE: 0, reasons: [], reason: '',
  });
  const plan = (proposals) =>
    planAuto({
      colorway: { colorwayId: 7 },
      cardSlots: [slot],
      rowsBySlot: new Map(),
      materials: [M1, M2, M3],
      otherColorways: [],
      bomItems: [slot],
      pieces: [],
      proposals,
    });
  const a = plan([prop(2, true)]);
  ck(a.pins.length === 1 && a.pins[0].patch.materialId === 2, 'exact + то же семейство → пин', JSON.stringify(a.pins));
  const b = plan([prop(3, true)]);
  ck(
    b.pins.length === 0 && b.ambiguous[0]?.candidates?.[0] === 3,
    'exact, но другое семейство → не пин, pick one of',
    JSON.stringify(b),
  );
  const c = plan([prop(2, false, 0.8), prop(3, false, 0.9)]);
  ck(
    c.pins.length === 0 && c.ambiguous[0]?.count === 2 && c.ambiguous[0].candidates.join() === '3,2',
    'не-exact → не пин, кандидаты лучшие первыми',
    JSON.stringify(c),
  );
  // Секция слота сменена в форме (не сохранено): матчер читал старый BOM, артикул — старой секции.
  const live = { ...slot, section: TRIM };
  const d = planAuto({
    colorway: { colorwayId: 7 },
    cardSlots: [live],
    rowsBySlot: new Map(),
    materials: [M1, M2, M3],
    otherColorways: [],
    bomItems: [live],
    pieces: [],
    proposals: [prop(2, true)],
  });
  ck(d.pins.length === 0, 'exact + семейство, но секция живого слота другая → не пин', JSON.stringify(d.pins));
  ck(d.ambiguous.length === 0, 'фолбэк: кандидат чужой секции выкинут, ноль валидных → нет ambiguous', JSON.stringify(d.ambiguous));
  const f = plan([prop(3, false, 0.7), { ...prop(9, false, 0.99) }, prop(2, false, 0.7)]);
  ck(
    f.ambiguous[0]?.count === 2 && f.ambiguous[0].candidates.join() === '2,3',
    'фолбэк: несуществующий выкинут, равный балл → по имени, другое семейство допустимо',
    JSON.stringify(f.ambiguous),
  );
  // 2+ своих точных: слияние с предложениями — только валидные, по баллу, затем по имени.
  const N4 = { ...mat(4, 'TW100 navy', 'navy'), name: 'aaa' };
  const N7 = { ...mat(7, 'TW100 navy', 'navy'), name: 'zzz' };
  const P5 = mat(5, 'TW100 ecru', 'ecru'); // то же семейство, другой цвет — валиден как предложение
  const P6 = { ...mat(6, 'TW100 navy', 'navy'), archived: true };
  const e = planAuto({
    colorway: { colorwayId: 7, devName: 'navy' },
    cardSlots: [slot],
    rowsBySlot: new Map(),
    materials: [M1, M2, M3, N4, P5, P6, N7],
    otherColorways: [],
    bomItems: [slot],
    pieces: [],
    proposals: [prop(3, false, 0.99), prop(5, false, 0.95), prop(6, false, 0.9), prop(2, false, 0.5)],
  });
  ck(
    e.pins.length === 0 &&
      e.ambiguous[0]?.count === 4 &&
      e.ambiguous[0].candidates.join() === '5,2,4',
    'слияние: другое семейство и архив выкинуты, count до среза, балл → имя',
    JSON.stringify(e.ambiguous),
  );
}

console.log(
  `\n${bad === 0 ? 'ЗЕЛЕНО' : 'КРАСНО'}: ${total - bad} / ${total} проверок прошло, провалов ${bad}`,
);
process.exit(bad === 0 ? 0 : 1);
