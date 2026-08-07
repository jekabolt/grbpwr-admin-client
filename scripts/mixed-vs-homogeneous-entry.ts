// Ф2.6 — «смешанный состав короче суммы однородных». Мерная часть.
//
// Вся Ф2 стоит на ОДНОМ физическом утверждении: настил из разных размеров (M×2 + L×1) короче,
// чем два отдельных однородных настила тех же изделий, потому что мелкие детали одного размера
// садятся в межлекальные выпады другого. Фаза уехала на прод, и это утверждение никто ни разу
// не измерил.
//
// Утверждение верно В ОПТИМУМЕ по построению: любое решение двух отдельных настилов, положенное
// встык, — это допустимое решение смешанного задания, значит оптимум смешанного ≤ сумме
// оптимумов. Но раскладку кладёт не оптимум, а генетический поиск с бюджетом в секундах, и у
// смешанного задания вдвое больше уникальных деталей: предпросчёт NFP дороже, поколений меньше,
// пространство поиска шире. Поэтому вопрос эмпирический, и ответ на него может быть «нет».
//
// Проба обязана уметь ОПРОВЕРГНУТЬ утверждение. Ни одного параметра, подобранного до зелёного:
// все три прогона (смешанный и два однородных) идут на одной ширине, одном зазоре, одном
// припуске, одном rdpEps, одной политике поворотов и одном бюджете НА ПРОГОН; всё, чем они
// отличаются, — состав. Асимметрия здесь превращает измерение в подгонку, поэтому каждый
// параметр печатается в отчёте.
//
// Геометрия проверяется НЕ движком: verifyPlacements приезжает из nest-probe-entry.ts, где она
// написана заново, брутфорсом, без единого импорта из движка. Короткая раскладка, в которой
// детали налезли друг на друга, — это не победа, а брак, и без независимой проверки «смешанный
// короче» означало бы ровно это.
import type { NestConfig, NestResult, PieceDTO } from '../src/lib/nesting/types';
import { NEST_DEFAULTS } from '../src/lib/nesting/types';
import { parseSheets, type SheetBytes } from '../src/lib/nesting/worker/parse-files';
import { orientToGrain } from '../src/lib/nesting/geom/grain-orient';
import { applySeamAllowance } from '../src/lib/nesting/geom/seam-allowance';
import { nest } from '../src/lib/nesting/nest';
import { splitPiecesBySize } from 'components/managers/tech-card/components/nesting/use-block-sizes';
import {
  defaultContourLayer,
  layerOptions,
  type LayerOption,
} from 'components/managers/tech-card/components/nesting/contour-layer';
import {
  defaultGrainLayer,
  grainLayerOptions,
} from 'components/managers/tech-card/components/nesting/grain';
import { verifyPlacements } from './nest-probe-entry';

// Токены, которые ВООБЩЕ бывают размерами. В приложении это словарь размеров карточки; здесь его
// нет, и подменять его списком токенов ЭТОГО файла было бы подгонкой — splitPiecesBySize тогда
// резала бы ровно то, что мы хотим видеть разрезанным. Поэтому список широкий и написан вслепую:
// решение «размер это или модификатор» всё равно принимает структура файла (deriveBlockSizes),
// а не членство в списке — иначе «FP_L» стала бы полочкой размера L.
const DICT_TOKENS = new Set<string>([
  'xxxs', 'xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl',
  '2xl', '3xl', '4xl', '5xl', 'os', 'onesize',
  ...Array.from({ length: 41 }, (_, i) => String(i + 28)), // 28…68 — числовые размерные ряды
]);

export type Fixture = {
  path: string;
  parsed: number;
  layer: string;
  layerOptions: LayerOption[];
  grainLayer: string;
  rotatedToGrain: number;
  // Детали ВЫБРАННОГО слоя, по одной на имя блока, уже развёрнутые по долевой и раздутые на
  // припуск — ровно то, что в приложении уезжает в воркер.
  pieces: PieceDTO[];
  sizeByPieceId: Map<number, string>;
  identityByPieceId: Map<number, string>;
  // Размерные токены файла в порядке градации (по средней площади — так их упорядочивает
  // splitPiecesBySize, и это порядок, выведенный из тех же данных, а не из справочника).
  tokens: string[];
  piecesByToken: Map<string, PieceDTO[]>;
  areaByToken: Map<string, number>;
  blocksMissingOnLayer: string[];
};

export type LoadOpts = {
  sheets: SheetBytes[];
  path: string;
  contourLayer?: string;
  grainLayer?: string;
  seamAllowanceCm: number;
};

export async function loadFixture(opts: LoadOpts): Promise<Fixture> {
  const { pieces: parsed } = await parseSheets(opts.sheets, {
    unit: 'auto',
    tol: NEST_DEFAULTS.tol,
    tolChain: NEST_DEFAULTS.tolChain,
  });

  // Размеры режутся по ВСЕМУ разбору, а не по одному слою: вердикт deriveBlockSizes считается по
  // структуре имён блоков, и она одна на файл.
  const split = splitPiecesBySize(parsed, DICT_TOKENS);
  const layerOpts = layerOptions(parsed, split.codeById);
  // СЛОЙ ВЫБИРАЕТ ПРОДАКШЕНОВАЯ ФУНКЦИЯ, и это не формальность. В обоих реальных файлах слой 1
  // несёт линию кроя БАЗОВОГО размера, одинаковую во всех пяти блоках, — взяв его, проба сравнила
  // бы «смешанный настил» из пяти копий одной и той же детали с однородным из тех же копий, то
  // есть измерила бы ноль и назвала бы это результатом.
  const layer = opts.contourLayer ?? defaultContourLayer(layerOpts);

  const seenBlock = new Set<string>();
  const picked: PieceDTO[] = [];
  for (const p of parsed) {
    if ((p.layer ?? '') !== layer) continue;
    const key = `${p.fileIndex}|${p.blockName || p.name}`;
    if (seenBlock.has(key)) continue;
    seenBlock.add(key);
    picked.push(p);
  }

  const allBlocks = new Set(parsed.map((p) => (p.blockName ?? '').trim()).filter(Boolean));
  const onLayer = new Set(picked.map((p) => (p.blockName ?? '').trim()).filter(Boolean));
  const missing = [...allBlocks].filter((b) => !onLayer.has(b)).sort();

  const grainLayer = opts.grainLayer ?? defaultGrainLayer(grainLayerOptions(parsed));
  const oriented = orientToGrain(picked, grainLayer);
  const seam = applySeamAllowance(oriented.pieces, opts.seamAllowanceCm);
  const pieces = seam.pieces;

  const sizeByPieceId = new Map<number, string>();
  const identityByPieceId = new Map<number, string>();
  const piecesByToken = new Map<string, PieceDTO[]>();
  const areaByToken = new Map<string, number>();
  for (const p of pieces) {
    const code = split.codeById.get(p.id);
    const size = code?.size ?? '';
    sizeByPieceId.set(p.id, size);
    identityByPieceId.set(p.id, code?.identity ?? p.blockName ?? p.name);
    const list = piecesByToken.get(size) ?? [];
    list.push(p);
    piecesByToken.set(size, list);
    areaByToken.set(size, (areaByToken.get(size) ?? 0) + p.areaCm2);
  }
  const tokens = [...piecesByToken.keys()].sort(
    (a, b) => (split.orderOfSize.get(a) ?? 1e6) - (split.orderOfSize.get(b) ?? 1e6),
  );

  return {
    path: opts.path,
    parsed: parsed.length,
    layer,
    layerOptions: layerOpts,
    grainLayer,
    rotatedToGrain: oriented.rotated,
    pieces,
    sizeByPieceId,
    identityByPieceId,
    tokens,
    piecesByToken,
    areaByToken,
    blocksMissingOnLayer: missing,
  };
}

// ── задание ────────────────────────────────────────────────────────────────────────────

export type CompositionEntry = { token: string; quantity: number };

export type JobSpec = {
  composition: CompositionEntry[];
  // Идентичности (имя блока без размерного хвоста), которые считаются РАЗМЕРОНЕЗАВИСИМЫМИ:
  // одна и та же деталь на любое изделие настила. В «summer men.dxf» таких нет — файл градуирует
  // всё, — поэтому для фикстуры с ними берётся геометрия одного размера (agnosticToken), а
  // остальные её размеры из задания выпадают. Так воспроизводится деталь без размерного хвоста,
  // которую формула блоба кроит totalUnits раз.
  agnosticIdentities?: Set<string>;
  agnosticToken?: string;
  /** false — не слать размер группой, то есть мерить поиск БЕЗ засева склейкой (A/B). */
  seedGroups?: boolean;
};

export type BuiltJob = {
  config: NestConfig;
  instances: number;
  uniquePieces: number;
  totalUnits: number;
  areaCm2: number;
  // Экземпляров на деталь — по формуле блоба, чтобы отчёт мог её показать, а не пообещать.
  unitsByPieceId: Map<number, number>;
};

export type BaseParams = {
  fabricWidthCm: number;
  gapCm: number;
  edgeMarginCm: number;
  seamAllowanceCm: number;
  rdpEpsCm: number;
  allowCrossGrain: boolean;
  fabricDirection: NestConfig['fabricDirection'];
  timeBudgetMs: number;
};

// ФОРМУЛА ЭКЗЕМПЛЯРОВ — та же, что у модалки (nesting-modal.tsx, unitsOfPiece) и у блоба:
//   экземпляров = qty × (у детали есть размер ? количество этого размера : всего изделий).
// qty здесь всюду 1: в файле один блок на деталь кроя, а парность/дубли — предмет другой пробы.
export function buildJob(fx: Fixture, spec: JobSpec, base: BaseParams): BuiltJob {
  const totalUnits = spec.composition.reduce((s, c) => s + c.quantity, 0);
  const qtyByToken = new Map(spec.composition.map((c) => [c.token, c.quantity]));
  const agnostic = spec.agnosticIdentities ?? new Set<string>();
  const agnosticToken = spec.agnosticToken ?? '';

  const unitsByPieceId = new Map<number, number>();
  const entries: NestConfig['pieces'] = [];
  let instances = 0;
  let areaCm2 = 0;
  for (const p of fx.pieces) {
    const size = fx.sizeByPieceId.get(p.id) ?? '';
    const identity = fx.identityByPieceId.get(p.id) ?? '';
    let units: number;
    if (agnostic.has(identity)) {
      // Размеронезависимая деталь представлена ОДНИМ блоком; остальные её размеры — не деталь
      // кроя, а тот же блок, нарисованный ещё раз, и попасть в задание не должны.
      units = size === agnosticToken ? totalUnits : 0;
    } else if (size === '') {
      units = totalUnits;
    } else {
      units = qtyByToken.get(size) ?? 0;
    }
    unitsByPieceId.set(p.id, units);
    if (units < 1) continue;
    // Размер едет группой — ровно так, как его шлёт модалка. Без этого зонд мерил бы поиск БЕЗ
    // засева склейкой.
    //
    // Выключается переменной, и это не отладочный тумблер: единственный способ узнать, помог ли
    // засев, — прогнать ОДНУ СБОРКУ на ОДНОЙ машине в обе стороны. Сравнение с числами вчерашнего
    // прогона ничего не значит — там машина была занята параллельными агентами, предпросчёт шёл
    // всемеро дольше, и лестница точности выбирала другое огрубление.
    entries.push({
      pieceId: p.id,
      quantity: units,
      groupKey: spec.seedGroups === false ? undefined : size,
    });
    instances += units;
    areaCm2 += p.areaCm2 * units;
  }

  return {
    config: {
      pieces: entries,
      fabricWidthCm: base.fabricWidthCm,
      gapCm: base.gapCm,
      edgeMarginCm: base.edgeMarginCm,
      allowCrossGrain: base.allowCrossGrain,
      fabricDirection: base.fabricDirection,
      grainLayer: fx.grainLayer,
      seamAllowanceCm: base.seamAllowanceCm,
      timeBudgetMs: base.timeBudgetMs,
      rdpEpsCm: base.rdpEpsCm,
    },
    instances,
    uniquePieces: entries.length,
    totalUnits,
    areaCm2,
    unitsByPieceId,
  };
}

export type RunOutcome = {
  usedLengthCm: number;
  efficiency: number;
  generation: number;
  elapsedMs: number;
  placedCount: number;
  totalCount: number;
  unplaced: number;
  cancelled: boolean;
  warnings: string[];
  prepassMs: number;
  predictedPrepassMs: number;
  effectiveEpsCm: number;
  requestedEpsCm: number;
  nfpTotal: number;
  evaluated: number;
  // Независимая проверка геометрии — по НАСТОЯЩИМ контурам, кодом, который движка не знает.
  overlaps: number;
  shortPairs: number;
  minClearanceCm: number;
  outsideWidth: number;
  // Подпись раскладки: две одинаковые подписи = один и тот же маркер до микрона.
  blob: string;
};

function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (((h2 >>> 0) * 4294967296 + (h1 >>> 0)) >>> 0).toString(16).padStart(8, '0');
}

export async function runJob(fx: Fixture, job: BuiltJob): Promise<RunOutcome> {
  const result: NestResult = await nest(fx.pieces, job.config, () => false, () => {});
  const v = verifyPlacements(fx.pieces, result, job.config);
  const t = result.telemetry;
  return {
    usedLengthCm: result.usedLengthCm,
    efficiency: result.efficiency,
    generation: result.generation,
    elapsedMs: result.elapsedMs,
    placedCount: result.placedCount,
    totalCount: result.totalCount,
    unplaced: result.unplaced?.length ?? 0,
    cancelled: result.cancelled,
    warnings: result.warnings ?? [],
    prepassMs: t?.prepassMs ?? -1,
    predictedPrepassMs: t?.predictedPrepassMs ?? -1,
    effectiveEpsCm: t?.rdpEpsCm ?? -1,
    requestedEpsCm: t?.requestedRdpEpsCm ?? job.config.rdpEpsCm,
    nfpTotal: t?.nfpTotal ?? -1,
    evaluated: t?.evaluated ?? -1,
    overlaps: v.overlaps,
    shortPairs: v.shortPairs,
    minClearanceCm: v.minClearanceCm,
    outsideWidth: v.outsideWidth,
    blob: hash(
      JSON.stringify(
        result.placements.map((p) => [
          p.pieceId,
          p.instance,
          p.rot,
          p.flipped === true,
          Math.round(p.x * 1000),
          Math.round(p.y * 1000),
        ]),
      ),
    ),
  };
}

// ── СИНТЕТИЧЕСКАЯ градация — запасной вариант, когда настоящего файла на машине нет ────────
//
// Помечена синтетической ВЕЗДЕ, где печатается, и настоящий критерий Ф2.6 («на реальном файле»)
// ею не закрывается. Нужна ровно затем, чтобы проба оставалась запускаемой и чтобы отказ звучал
// как «файла нет», а не как «не измеряли».
export function syntheticGradedFixture(
  tokens: readonly string[],
  // Линейный коэффициент размера: XS мельче XL примерно на столько же, на сколько в градации.
  scaleOf: (token: string) => number,
): Fixture {
  // Девять деталей — как в «summer men.dxf»: спинка, две её части, две подкройные, полочки, рукава.
  const shapes: { identity: string; w: number; h: number; cut: number }[] = [
    { identity: 'BP', w: 52, h: 18, cut: 0.35 },
    { identity: 'BP_1', w: 33, h: 24, cut: 0.2 },
    { identity: 'BP_2', w: 33, h: 24, cut: 0.2 },
    { identity: 'CLR_3', w: 21, h: 9, cut: 0.15 },
    { identity: 'CLR_4', w: 21, h: 9, cut: 0.15 },
    { identity: 'FP_L', w: 32, h: 74, cut: 0.3 },
    { identity: 'FP_R', w: 32, h: 74, cut: 0.3 },
    { identity: 'SL_L', w: 47, h: 34, cut: 0.25 },
    { identity: 'SL_R', w: 47, h: 34, cut: 0.25 },
  ];
  const pieces: PieceDTO[] = [];
  const sizeByPieceId = new Map<number, string>();
  const identityByPieceId = new Map<number, string>();
  const piecesByToken = new Map<string, PieceDTO[]>();
  const areaByToken = new Map<string, number>();
  let id = 0;
  for (const token of tokens) {
    const k = scaleOf(token);
    for (const s of shapes) {
      const w = s.w * k;
      const h = s.h * k;
      // Пятиугольник со срезанным углом: у прямоугольников межлекальных выпадов почти нет, и
      // фикстура, собранная из них, отвечала бы на другой вопрос.
      const poly = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h * (1 - s.cut) },
        { x: w * (1 - s.cut), y: h },
        { x: 0, y: h },
      ];
      let a2 = 0;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        a2 += p.x * q.y - q.x * p.y;
      }
      id++;
      const dto: PieceDTO = {
        id,
        name: `${s.identity}_${token}`,
        blockName: `${s.identity}_${token}`,
        source: 'synthetic',
        fileIndex: 0,
        poly: a2 < 0 ? [...poly].reverse() : poly,
        bboxW: w,
        bboxH: h,
        areaCm2: Math.abs(a2) / 2,
      };
      pieces.push(dto);
      sizeByPieceId.set(id, token);
      identityByPieceId.set(id, s.identity);
      const list = piecesByToken.get(token) ?? [];
      list.push(dto);
      piecesByToken.set(token, list);
      areaByToken.set(token, (areaByToken.get(token) ?? 0) + dto.areaCm2);
    }
  }
  return {
    path: 'СИНТЕТИКА (реального файла нет)',
    parsed: pieces.length,
    layer: '(синтетика)',
    layerOptions: [],
    grainLayer: '',
    rotatedToGrain: 0,
    pieces,
    sizeByPieceId,
    identityByPieceId,
    tokens: [...tokens],
    piecesByToken,
    areaByToken,
    blocksMissingOnLayer: [],
  };
}

export { NEST_DEFAULTS };
export type { NestConfig, NestResult, PieceDTO };
