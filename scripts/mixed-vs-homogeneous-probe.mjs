#!/usr/bin/env node
// Ф2.6 — ЗОНД: короче ли смешанный настил суммы однородных.
//
// Читать вместе с scripts/mixed-vs-homogeneous-entry.ts, где объяснено, почему вопрос
// эмпирический, а не арифметический. Здесь — постановка опыта и отчёт.
//
// ОПЫТ. Для каждой фикстуры (состав вида «XS×2 + XL×1») гоняются:
//   A — ОДИН смешанный прогон: детали обоих размеров на одной полосе;
//   B, C… — по одному ОДНОРОДНОМУ прогону на каждый размер состава, с тем же количеством изделий.
// Сравнивается длина A с суммой длин B + C. Всё остальное у прогонов ОДИНАКОВО: ширина, зазор,
// кромка, припуск, rdpEps, политика поворотов, бюджет НА ПРОГОН — и печатается в шапке отчёта,
// чтобы читателю не приходилось верить этой строке на слово.
//
// ЧЕГО ЭТА ПРОБА НЕ ДЕЛАЕТ. Она не подкручивает фикстуру до зелёного. Провал — это результат:
// он значит, что поиск не пользуется свободой, которую даёт смешанный состав, и что обещание,
// на котором стоит вся Ф2, на этом файле не выполняется.
//
// Usage:
//   node scripts/mixed-vs-homogeneous-probe.mjs ~/Downloads/'summer men.dxf'
//   node scripts/mixed-vs-homogeneous-probe.mjs            # синтетическая градация (помечена)
//
// Env: MIX_BUDGET_MS (бюджет НА ПРОГОН, по умолчанию 30000), MIX_REPEATS (повторов на прогон, 3),
//      MIX_WIDTH (ширина полосы, см), MIX_GAP, MIX_MARGIN, MIX_SEAM, MIX_EPS,
//      MIX_CROSS_GRAIN=1 (разрешить 90/270), MIX_DIRECTION (any|two_way|one_way|unknown),
//      MIX_LAYER (слой контура), MIX_GRAIN (слой долевой), MIX_FIXTURES (список номеров, «1,3»).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `mix-probe-${process.pid}.mjs`);
const alias = Object.fromEntries(
  ['components', 'lib', 'api', 'ui', 'utils', 'constants', 'hooks', 'types', 'context', 'styles']
    .map((k) => [k, resolve(REPO, 'src', k)])
    .concat([['@', resolve(REPO, 'src')]]),
);
await build({
  entryPoints: [resolve(HERE, 'mixed-vs-homogeneous-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias,
});
const mod = await import(pathToFileURL(outfile).href);

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const BUDGET_MS = num(process.env.MIX_BUDGET_MS, 30_000);
const REPEATS = Math.max(1, num(process.env.MIX_REPEATS, 3));
const BASE = {
  fabricWidthCm: num(process.env.MIX_WIDTH, mod.NEST_DEFAULTS.fabricWidthCm),
  gapCm: num(process.env.MIX_GAP, mod.NEST_DEFAULTS.gapCm),
  edgeMarginCm: num(process.env.MIX_MARGIN, mod.NEST_DEFAULTS.edgeMarginCm),
  seamAllowanceCm: num(process.env.MIX_SEAM, mod.NEST_DEFAULTS.seamAllowanceCm),
  rdpEpsCm: num(process.env.MIX_EPS, mod.NEST_DEFAULTS.rdpEpsCm),
  allowCrossGrain: num(process.env.MIX_CROSS_GRAIN, 0) > 0,
  fabricDirection: process.env.MIX_DIRECTION ?? 'any',
  timeBudgetMs: BUDGET_MS,
};
// Поиск останавливается по ЧАСАМ или по поколениям; 400 — потолок движка (MAX_GENERATIONS).
// Прогон, дошедший до него, бюджетом не обрезан, и сравнивать такие прогоны честно.
const MAX_GENERATIONS = 400;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const fmt = (x, n = 1) => x.toFixed(n);

let brokenRuns = 0; // измерения, которым нельзя верить (геометрия/непоместившиеся)
let confounds = 0; // сравнения, испорченные неравенством условий
const verdicts = [];

// ── фикстуры ───────────────────────────────────────────────────────────────────────────
// Состав задаётся ИНДЕКСАМИ в градации файла (0 = самый мелкий размер), а не именами токенов:
// имена у каждого лекальщика свои, а «самый мелкий против самого крупного» — это то, что
// фикстура хочет сказать. Порядок градации выводит splitPiecesBySize по средней площади.
const FIXTURES = [
  { label: 'крайние размеры, разные количества', pick: (t) => [[t[0], 2], [t[t.length - 1], 1]] },
  { label: 'соседи по градации', pick: (t) => [[t[1], 2], [t[t.length - 2], 1]] },
  { label: 'равные количества', pick: (t) => [[t[Math.floor(t.length / 2)], 2], [t[t.length - 1], 2]] },
  {
    label: 'три размера',
    pick: (t) => [[t[0], 1], [t[Math.floor(t.length / 2)], 1], [t[t.length - 1], 1]],
  },
  {
    // Формула блоба умножает деталь БЕЗ размерного хвоста на ЧИСЛО ИЗДЕЛИЙ, а не на строку
    // состава, и эта ветка обязана попасть в замер: именно размеронезависимые детали (одна и та
    // же обтачка на все три изделия) — тот мелкий груз, который и должен садиться в выпады.
    label: 'с размеронезависимыми деталями (обтачки — одна на все изделия)',
    pick: (t) => [[t[Math.floor(t.length / 2)], 2], [t[t.length - 1], 1]],
    agnostic: ['CLR_3', 'CLR_4'],
  },
];

async function measure(fx, fixture, index) {
  const tokens = fx.tokens.filter((t) => t !== '');
  if (tokens.length < 2) {
    console.log(`\n  ФИКСТУРА ${index} ПРОПУЩЕНА: в файле меньше двух размеров (${tokens.length})`);
    return;
  }
  const comp = fixture
    .pick(tokens)
    .filter(([tok]) => tok != null)
    .map(([token, quantity]) => ({ token, quantity }));
  // Один и тот же размер, выбранный дважды (короткая градация), превратил бы «смешанный» состав
  // в однородный — и сравнение стало бы тавтологией.
  if (new Set(comp.map((c) => c.token)).size < comp.length) {
    console.log(`\n  ФИКСТУРА ${index} ПРОПУЩЕНА: градация слишком коротка для этого состава`);
    return;
  }

  const agnosticIdentities = new Set(fixture.agnostic ?? []);
  const present = [...fx.identityByPieceId.values()];
  const missingAgnostic = [...agnosticIdentities].filter((a) => !present.includes(a));
  if (missingAgnostic.length > 0) {
    console.log(
      `\n  ФИКСТУРА ${index} ПРОПУЩЕНА: в файле нет деталей ${missingAgnostic.join(', ')}`,
    );
    return;
  }
  // Геометрию размеронезависимой детали берём у СРЕДНЕГО размера градации — брать у одного из
  // размеров состава значило бы дать этому размеру фору.
  const agnosticToken = tokens[Math.floor(tokens.length / 2)];

  const label = comp.map((c) => `${c.token}×${c.quantity}`).join(' + ');
  console.log(`\n── фикстура ${index}: ${label} — ${fixture.label} ──`);
  if (agnosticIdentities.size > 0) {
    console.log(
      `  размеронезависимые детали: ${[...agnosticIdentities].join(', ')} (геометрия размера ${agnosticToken}, кроятся ${comp.reduce((s, c) => s + c.quantity, 0)} раз каждая)`,
    );
  }

  // MIX_SEED_GROUPS=0 — мерить поиск БЕЗ засева склейкой. Нужно ровно для одного: сравнить обе
  // стороны ОДНОЙ сборкой на ОДНОЙ машине. Сравнивать с числами вчерашнего прогона нельзя —
  // загрузка машины меняет предпросчёт, а через него и выбранное огрубление геометрии.
  const spec = {
    composition: comp,
    agnosticIdentities,
    agnosticToken,
    seedGroups: process.env.MIX_SEED_GROUPS !== '0',
  };
  const jobs = [
    { tag: 'A', kind: 'СМЕШАННЫЙ', name: label, job: mod.buildJob(fx, spec, BASE) },
    ...comp.map((c, i) => ({
      tag: String.fromCharCode(66 + i),
      kind: 'однородный',
      name: `${c.token}×${c.quantity}`,
      job: mod.buildJob(fx, { ...spec, composition: [c] }, BASE),
    })),
  ];

  for (const j of jobs) {
    console.log(
      `  ${j.tag} ${j.kind.padEnd(10)} ${j.name.padEnd(22)} деталей ${String(j.job.uniquePieces).padStart(3)}` +
        `  экземпляров ${String(j.job.instances).padStart(3)}  изделий ${j.job.totalUnits}` +
        `  площадь ${fmt(j.job.areaCm2 / 10_000, 3)} м²`,
    );
  }
  // Площадь смешанного обязана равняться сумме площадей однородных — это проверка того, что
  // формула экземпляров одна и та же по обе стороны сравнения, а не разные задания.
  const areaA = jobs[0].job.areaCm2;
  const areaSum = jobs.slice(1).reduce((s, j) => s + j.job.areaCm2, 0);
  if (Math.abs(areaA - areaSum) > 1e-6) {
    confounds++;
    console.log(
      `  КОНФАУНД: площадь смешанного ${fmt(areaA, 2)} см² ≠ сумме однородных ${fmt(areaSum, 2)} см² — сравниваются РАЗНЫЕ комплекты деталей`,
    );
  }

  console.log(
    '\n    прогон              длина, см  поколений    оценок      eps  предпросчёт     всего  размещено  проверка',
  );
  const runs = new Map();
  for (const j of jobs) {
    const outs = [];
    for (let r = 0; r < REPEATS; r++) {
      const o = await mod.runJob(fx, j.job);
      outs.push(o);
      const geomOk = o.overlaps === 0 && o.shortPairs === 0 && o.outsideWidth === 0;
      const allPlaced = o.placedCount === o.totalCount && !o.cancelled;
      if (!geomOk || !allPlaced) brokenRuns++;
      console.log(
        `    ${j.tag} ${j.name.padEnd(16)} ${fmt(o.usedLengthCm).padStart(9)}` +
          `  ${String(o.generation).padStart(9)}` +
          `  ${String(o.evaluated).padStart(8)}` +
          `  ${fmt(o.effectiveEpsCm, 3).padStart(7)}` +
          `  ${(fmt(o.prepassMs / 1000) + ' с').padStart(11)}` +
          `  ${(fmt(o.elapsedMs / 1000) + ' с').padStart(8)}` +
          `  ${`${o.placedCount}/${o.totalCount}`.padStart(9)}` +
          `  ${geomOk ? 'ok' : `НАЛОЖ ${o.overlaps} КОРОТ ${o.shortPairs} ВНЕ ${o.outsideWidth}`}` +
          `${allPlaced ? '' : '  ← НЕ ВСЁ РАЗМЕЩЕНО'}`,
      );
      for (const w of o.warnings) console.log(`        ⚠ ${w}`);
    }
    runs.set(j.tag, { job: j, outs });
  }

  const lens = (tag) => runs.get(tag).outs.map((o) => o.usedLengthCm);
  const line = (tag) => {
    const l = lens(tag);
    const j = runs.get(tag).job;
    const gens = runs.get(tag).outs.map((o) => o.generation);
    const secs = runs.get(tag).outs.map((o) => o.elapsedMs / 1000);
    console.log(
      `    ${tag} ${j.name.padEnd(16)} медиана ${fmt(median(l)).padStart(8)} см` +
        `  (min ${fmt(Math.min(...l))} / max ${fmt(Math.max(...l))})` +
        `  поколений ${Math.min(...gens)}…${Math.max(...gens)}` +
        `  по часам ${fmt(median(secs))} с` +
        // Повтор ОДИН — говорить «прогоны совпали» не о чем: движок посеян детерминированно
        // (nest/index.ts), и повторы меряют не поиск, а ровность машины.
        `  повторы совпали ${REPEATS < 2 ? '— (повтор один)' : new Set(runs.get(tag).outs.map((o) => o.blob)).size === 1 ? 'да' : 'НЕТ'}`,
    );
  };
  console.log('');
  for (const j of jobs) line(j.tag);

  const medA = median(lens('A'));
  const homo = jobs.slice(1).map((j) => median(lens(j.tag)));
  const sum = homo.reduce((s, x) => s + x, 0);
  const delta = medA - sum;
  const pct = (delta / sum) * 100;
  console.log(
    `\n    СУММА ОДНОРОДНЫХ = ${homo.map((x) => fmt(x)).join(' + ')} = ${fmt(sum)} см` +
      `   СМЕШАННЫЙ = ${fmt(medA)} см`,
  );
  console.log(
    `    Δ = ${fmt(delta)} см (${fmt(pct, 2)} %)   ` +
      (delta < 0
        ? `ПРЕМИСА ПОДТВЕРЖДЕНА: смешанный короче на ${fmt(-delta)} см (${fmt(-pct, 2)} %)`
        : `ПРЕМИСА НЕ ПОДТВЕРЖДЕНА: смешанный ДЛИННЕЕ на ${fmt(delta)} см (${fmt(pct, 2)} %)`),
  );
  // СКЛЕЙКА — граница, ниже которой смешанный обязан оказаться, и она ДАРОВАЯ. Положите маркер B
  // от нуля, а маркер C — за ним через зазор: это допустимая раскладка СМЕШАННОГО задания, ничего
  // не пересекающая и ничего не теряющая. Значит оптимум смешанного ≤ B + C + зазор ВСЕГДА, на
  // любом файле, без всяких предположений о том, садятся ли мелкие детали в чужие выпады.
  //
  // Отсюда единственно верное чтение провала: если поиск выдал БОЛЬШЕ склейки, опровергнута не
  // премиса, а движок — он не нашёл решения, которое можно выписать даром из двух уже посчитанных
  // раскладок. Это разные диагнозы и разные починки, и путать их нельзя.
  const glue = sum + BASE.gapCm * (jobs.length - 2);
  console.log(
    `    склейка (B за C через зазор — даровое допустимое решение смешанного задания) = ${fmt(glue)} см;` +
      ` смешанный ${medA <= glue ? 'уложился в неё' : `ХУЖЕ НЕЁ на ${fmt(medA - glue)} см — поиск проиграл дармовщине`}`,
  );

  // ── условия сравнения: любое неравенство обесценивает число выше ──
  const epsAll = jobs.flatMap((j) => runs.get(j.tag).outs.map((o) => o.effectiveEpsCm));
  if (new Set(epsAll.map((e) => e.toFixed(6))).size > 1) {
    confounds++;
    console.log(
      `    КОНФАУНД: движок огрубил геометрию НЕ ОДИНАКОВО — eps ${[...new Set(epsAll.map((e) => fmt(e, 3)))].join(', ')}.` +
        ' У смешанного задания записей NFP вдвое больше, и лестница точности могла обрезать именно его.',
    );
  }
  const genA = Math.min(...runs.get('A').outs.map((o) => o.generation));
  const genH = jobs.slice(1).map((j) => Math.min(...runs.get(j.tag).outs.map((o) => o.generation)));
  const allConverged = genA >= MAX_GENERATIONS - 1 && genH.every((g) => g >= MAX_GENERATIONS - 1);
  // ГАНДИКАП, А НЕ ПРОСТО «НЕРАВЕНСТВО». У смешанного задания вдвое больше уникальных деталей:
  // предпросчёт дороже, поколение дороже, и при равном бюджете поколений ему достаётся меньше.
  // Куда это смещает ответ — зависит от ответа, и валить оба случая в одно слово «конфаунд»
  // значило бы отчитаться о разных вещах одинаково:
  //   • смешанный ВЫИГРАЛ с меньшим числом поколений — выиграл ВОПРЕКИ гандикапу, и вывод стоит
  //     тем твёрже; сравнение при равном поиске было бы для него ещё выгоднее;
  //   • смешанный ПРОИГРАЛ с меньшим числом поколений — геометрию от бюджета не отличить, и это
  //     не опровержение премисы, а НЕОПРЕДЕЛЁННОСТЬ. Гнать вывод «премиса неверна» отсюда так же
  //     нечестно, как подкрутить фикстуру до зелёного.
  const handicapped = !allConverged && genA < Math.min(...genH);
  let inconclusive = false;
  if (allConverged) {
    console.log(`    все поиски дошли до потолка ${MAX_GENERATIONS} поколений — часы ни на что не влияли.`);
  } else if (handicapped && delta < 0) {
    console.log(
      `    гандикап В ПОЛЬЗУ ОДНОРОДНЫХ: смешанному досталось ${genA} поколений против ${genH.join('/')}` +
        ' — и он всё равно короче. Вывод от этого только твёрже.',
    );
  } else if (handicapped) {
    inconclusive = true;
    console.log(
      `    НЕОПРЕДЕЛЁННО: смешанному досталось ${genA} поколений против ${genH.join('/')} у однородных.` +
        ' Проигрыш при таком неравенстве не отличить от нехватки бюджета — премиса тут не опровергнута,' +
        ' а НЕ ПРОВЕРЕНА. Нужен бюджет, на котором все поиски доходят до потолка.',
    );
  } else {
    console.log(
      `    ⚠ бюджет ограничивал: поколений A=${genA}, однородные ${genH.join('/')} (потолок ${MAX_GENERATIONS}).` +
        ' Смешанному досталось не меньше, чем однородным, — сравнение честное, но ни один поиск не сошёлся.',
    );
  }

  verdicts.push({ index, label, medA, sum, delta, pct, allConverged, inconclusive });
}

// ── загрузка фикстуры ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const wanted = (process.env.MIX_FIXTURES ?? '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
const chosen = FIXTURES.filter((_, i) => wanted.length === 0 || wanted.includes(i + 1));

// ПРОВЕНАНС ДВИЖКА. Число, снятое этой пробой, описывает КОНКРЕТНЫЙ движок, а пересобирается
// он из рабочего дерева: замер, снятый поверх недописанной правки, — это замер чужого черновика,
// и он неотличим от честного, если не сказать, чем мерили. Лучшее усилие: нет git — нет строки.
try {
  const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' }).trim();
  const dirty = git('status', '--porcelain', '--', 'src/lib/nesting', 'src/components/managers/tech-card');
  console.log(
    `── движок: ${git('rev-parse', '--short', 'HEAD')} (${git('rev-parse', '--abbrev-ref', 'HEAD')})` +
      (dirty ? ` + НЕЗАКОММИЧЕННЫЕ ПРАВКИ:\n${dirty}` : ', рабочее дерево чистое') +
      ' ──',
  );
} catch {
  console.log(
    `── движок: git недоступен, версия неизвестна${process.env.MIX_ENGINE_NOTE ? ` (${process.env.MIX_ENGINE_NOTE})` : ''} ──`,
  );
}

console.log('── условия опыта (одни на ВСЕ прогоны) ──');
console.log(
  `  ширина ${BASE.fabricWidthCm} см | зазор ${BASE.gapCm} см | кромка ${BASE.edgeMarginCm} см | припуск ${BASE.seamAllowanceCm} см` +
    ` | rdpEps ${BASE.rdpEpsCm} см | поперёк долевой ${BASE.allowCrossGrain ? 'да' : 'нет'} | направление ${BASE.fabricDirection}`,
);
console.log(
  `  бюджет ${BUDGET_MS} мс НА КАЖДЫЙ прогон | повторов ${REPEATS} | потолок поиска ${MAX_GENERATIONS} поколений`,
);

const fixtures = [];
for (const arg of args) {
  const path = resolve(process.cwd(), arg.replace(/^~/, process.env.HOME ?? '~'));
  const buf = await readFile(path);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  fixtures.push(
    await mod.loadFixture({
      sheets: [{ name: path.split('/').pop(), open: async () => bytes }],
      path,
      contourLayer: process.env.MIX_LAYER,
      grainLayer: process.env.MIX_GRAIN,
      seamAllowanceCm: BASE.seamAllowanceCm,
    }),
  );
}
if (fixtures.length === 0) {
  console.log(
    '\n  РЕАЛЬНОГО ФАЙЛА НЕ ЗАДАНО — гоняется СИНТЕТИЧЕСКАЯ градация.' +
      '\n  Критерий Ф2.6 сформулирован «НА РЕАЛЬНОМ ФАЙЛЕ», и синтетикой он НЕ ЗАКРЫВАЕТСЯ:' +
      '\n  число ниже описывает придуманные детали, а не выкройку.',
  );
  const k = { XS: 0.9, S: 0.95, M: 1, L: 1.05, XL: 1.1 };
  fixtures.push(mod.syntheticGradedFixture(Object.keys(k), (t) => k[t]));
}

for (const fx of fixtures) {
  console.log(`\n══ ФАЙЛ: ${fx.path} ══`);
  console.log(
    `  контуров разобрано ${fx.parsed} | слой контура «${fx.layer}»` +
      (fx.layerOptions.length
        ? ` из ${fx.layerOptions.map((o) => `${o.layer}(деталей ${o.pieces}, градуируется ${o.graded}/${o.checked})`).join(' ')}`
        : ''),
  );
  console.log(
    `  слой долевой «${fx.grainLayer}» | развёрнуто по долевой ${fx.rotatedToGrain} | деталей на слое ${fx.pieces.length}`,
  );
  if (fx.blocksMissingOnLayer.length) {
    console.log(`  ⚠ блоков нет на выбранном слое: ${fx.blocksMissingOnLayer.join(', ')}`);
  }
  console.log(
    `  размеры файла (в порядке градации): ${fx.tokens
      .map((t) => `${t || '(без размера)'}: ${fx.piecesByToken.get(t).length} дет., ${fmt(fx.areaByToken.get(t) / 10_000, 3)} м²`)
      .join(' | ')}`,
  );
  // Если площади размеров совпадают, градация до геометрии не доехала — и мерить нечего:
  // «смешанный» состав тогда состоит из копий одной и той же детали.
  const graded = fx.tokens.filter((t) => t !== '').map((t) => fx.areaByToken.get(t));
  if (graded.length >= 2 && Math.max(...graded) - Math.min(...graded) < 1e-6) {
    console.log(
      '  ОСТАНОВКА: размеры на этом слое НЕ РАЗЛИЧАЮТСЯ по площади — выбран справочный контур,' +
        ' а не деталь. Замер был бы сравнением задания с самим собой.',
    );
    continue;
  }

  let i = 0;
  for (const f of FIXTURES) {
    i++;
    if (!chosen.includes(f)) continue;
    await measure(fx, f, i);
  }
}

// ── итог ───────────────────────────────────────────────────────────────────────────────
console.log('\n══ ИТОГ ══');
for (const v of verdicts) {
  console.log(
    `  ${String(v.index).padStart(2)}. ${v.label.padEnd(22)} смешанный ${fmt(v.medA).padStart(8)} см` +
      `  против суммы ${fmt(v.sum).padStart(8)} см` +
      `  Δ ${fmt(v.delta).padStart(8)} см (${fmt(v.pct, 2).padStart(6)} %)` +
      `  ${v.inconclusive ? 'НЕОПРЕДЕЛЁННО' : v.delta < 0 ? 'короче' : 'ДЛИННЕЕ'}` +
      `${v.allConverged ? '' : ' (поиск не сошёлся)'}`,
  );
}
const won = verdicts.filter((v) => v.delta < 0).length;
const unclear = verdicts.filter((v) => v.inconclusive).length;
if (verdicts.length > 0) {
  const meds = verdicts.map((v) => v.pct);
  console.log(
    `\n  смешанный короче в ${won} из ${verdicts.length} фикстур` +
      (unclear ? `, неопределённых ${unclear}` : '') +
      `; выигрыш по медиане фикстур ${fmt(-median(meds), 2)} %` +
      ` (лучшая ${fmt(-Math.min(...meds), 2)} %, худшая ${fmt(-Math.max(...meds), 2)} %)`,
  );
  const converged = verdicts.filter((v) => v.allConverged).length;
  console.log(
    `  фикстур, где ВСЕ поиски дошли до потолка поколений: ${converged} из ${verdicts.length}` +
      (converged === verdicts.length
        ? ' — сравнивались задания, а не бюджеты.'
        : ' — на остальных бюджет был частью ответа.'),
  );
}
if (brokenRuns > 0) {
  console.log(`\n  ИЗМЕРЕНИЕ ИСПОРЧЕНО: прогонов с браком геометрии или потерянными деталями — ${brokenRuns}.`);
}
if (confounds > 0) {
  console.log(`  СРАВНЕНИЙ С НЕРАВНЫМИ УСЛОВИЯМИ: ${confounds} — числа выше о премисе не говорят.`);
}
const ok = verdicts.length > 0 && won === verdicts.length && brokenRuns === 0 && confounds === 0;
console.log(
  ok
    ? '\n  ПРЕМИСА Ф2 ПОДТВЕРЖДЕНА НА КАЖДОЙ ФИКСТУРЕ.'
    : '\n  ПРЕМИСА Ф2 ПОДТВЕРЖДЕНА НЕ ВЕЗДЕ — см. строки выше.',
);
process.exit(ok ? 0 : 1);
