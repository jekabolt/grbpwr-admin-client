// Ф3 — УСЛОВИЯ СЪЁМКИ МАРКЕРА (B4 + B5). Мерная часть, bundled by nest-conditions-probe.mjs.
//
// Зонд отвечает на три вопроса, и все три — про обещания, которые экран даёт оператору и
// которые нечем проверить, глядя на экран.
//
//   1. ПОДПИСЬ СЛОЯ (B4). «слой 14: линия шва» — это ЗАМЕР, а не жанр. На реальных файлах он
//      обязан совпасть с тем, что там на самом деле лежит: у `blazer.dxf` ЧЕТЫРЕ полных
//      контурных слоя (две линии кроя и две линии шва), и если бы подпись бралась из ранга или
//      из номера слоя, на этом файле она бы соврала четыре раза подряд.
//   2. ПОРЯДОК ПРЕДЗАПОЛНЕНИЯ (§5.5). Порядок источников — решение, а не выражение: файл с
//      линией кроя бьёт эталон карточки, эталон карточки бьёт цех, цех бьёт замеренный зазор, и
//      только за ними стоит умолчание раскладки. Переставленный порядок даёт правдоподобное
//      неверное число в поле, от которого зависит каждый сантиметр нормы.
//   3. ЧЕРТЁЖ В ЭКСПОРТЕ (§7.2/§7.4). Сохранённый маркер, открытый заново, обязан выгружаться
//      СО СЛОЕМ SEAM — и обязан ОТКАЗАТЬСЯ выгружаться, когда выкройку подменили. Проверяется
//      побайтово по самому файлу: есть ли в нём слой SEAM и сколько на нём сущностей.
//
// Путь до геометрии здесь ТОТ ЖЕ, что у оператора: разбор → слой контура → разворот по долевой →
// припуск на шов → блоб маркера → чтение блоба → пересборка. Ни одного шага, написанного заново:
// зонд, который собрал бы детали сам, мерил бы вторую реализацию.
import type { common_TechCardMarker } from 'api/proto-http/admin';
import { splitPiecesBySize } from 'components/managers/tech-card/components/nesting/use-block-sizes';
import {
  buildAllowanceIndex,
  type ContourAllowance,
} from 'components/managers/tech-card/components/nesting/contour-allowance';
import {
  defaultContourLayer,
  layerAllowanceLabel,
  layerOptions,
  seamAllowancePrefill,
  seamLineLayer,
  type SeamAllowancePrefill,
} from 'components/managers/tech-card/components/nesting/contour-layer';
import {
  defaultGrainLayer,
  grainLayerOptions,
} from 'components/managers/tech-card/components/nesting/grain';
import {
  buildMarkerLayout,
  markerToView,
} from 'components/managers/tech-card/components/nesting/marker-io';
import {
  describeRebuildError,
  patternSourcesForMarker,
  rebuildMarkerDrawingFromParsed,
  type MarkerPatternRow,
  type PatternSource,
} from 'components/managers/tech-card/components/nesting/marker-rebuild';
import { orientToGrain } from '../src/lib/nesting/geom/grain-orient';
import { applySeamAllowance } from '../src/lib/nesting/geom/seam-allowance';
import { renderLayoutDxf } from '../src/lib/nesting/render/dxf';
import type { NestResult, PieceDTO } from '../src/lib/nesting/types';
import { NEST_DEFAULTS } from '../src/lib/nesting/types';
import { parseSheets, type SheetBytes } from '../src/lib/nesting/worker/parse-files';

// Правило §5.5 экспортируется КАК ЕСТЬ — зонд обязан звать ту же функцию, что и модалка, иначе
// он проверяет свою копию порядка.
export { NEST_DEFAULTS, seamAllowancePrefill };

// Токены, которые ВООБЩЕ бывают размерами. В приложении это словарь размеров карточки; здесь его
// нет, и подменить его списком токенов ЭТОГО файла было бы подгонкой.
const DICT_TOKENS = new Set<string>([
  'xxxs', 'xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl',
  '2xl', '3xl', '4xl', '5xl', 'os', 'onesize',
  ...Array.from({ length: 41 }, (_, i) => String(i + 28)),
]);

export type LayerReport = {
  layer: string;
  pieces: number;
  graded: number;
  checked: number;
  // Ровно то, что печатается на кнопке слоя.
  label: string;
  verdict: ContourAllowance['verdict'] | 'not_measured';
  // Плоский признак «замер дал вердикт». Читается вместо `verdict` теми, кому важно одно: можно
  // ли назвать число. Проверяется зондом ровно потому, что он ДУБЛИРУЕТ вердикт — а дубль,
  // который никто не сверяет, однажды разойдётся с оригиналом.
  sampled: boolean;
  allowanceCm: number | null;
  gapCm: number | null;
  acceptedBlocks: number;
  unknownReason: string | null;
};

export type ExportReport = {
  // Слой объявлен в таблице слоёв файла.
  declaresSeam: boolean;
  declaresInner: boolean;
  // Сущностей НА слое. Объявленный и пустой слой — ровно та ложь, ради которой всё писалось.
  seamEntities: number;
  innerEntities: number;
  bytes: number;
};

export type RebuildReport = {
  ok: boolean;
  error: string;
  errorKind: string;
  pieces: number;
  withDrawing: number;
};

export type ConditionsReport = {
  parsed: number;
  // ── B4: подписи слоёв ──
  layers: LayerReport[];
  // Замер по каждому слою при ОТСУТСТВИИ индекса — обязан быть пуст (обратная совместимость с
  // тремя другими вызывающими `layerOptions`, которым припуск не нужен).
  layersWithoutIndex: { layer: string; measured: boolean; label: string }[];
  defaultLayer: string;
  defaultVerdict: LayerReport['verdict'];
  seamLayerPick: string | null;
  cutLayers: string[];
  seamLayers: string[];
  // ── B5: предзаполнение ──
  prefill: {
    // Ни карточка, ни цех эталона не задали — решает файл.
    bare: SeamAllowancePrefill;
    // Эталон карточки задан — он бьёт замеренный зазор, но НЕ бьёт факт «в контуре линия кроя».
    withCard: SeamAllowancePrefill;
    withWorkshop: SeamAllowancePrefill;
    // Тот же порядок, но замер говорит «линия кроя»: карточный эталон обязан ПРОИГРАТЬ факту.
    onCutLayer: SeamAllowancePrefill | null;
    onCutLayerWithCard: SeamAllowancePrefill | null;
  };
  // Сработал бы локальный блок двойного припуска на слое ПО УМОЛЧАНИЮ (то есть без единого
  // ручного клика оператора) при припуске 1 см.
  doubleAllowanceOnDefaultLayer: boolean;
  // ── B5: экспорт сохранённого маркера ──
  markerSeamAllowanceCm: number;
  markerContourLayer: string;
  markerGrainLayer: string;
  storedPieces: number;
  // Экспорт ПЕРЕОТКРЫТОГО маркера без пересборки — то, что система выдавала до Ф3.5.
  exportStored: ExportReport;
  // Он же после пересборки — то, что она выдаёт теперь.
  exportRebuilt: ExportReport;
  rebuild: RebuildReport;
  // Отказы: подменённая выкройка, пропавший блок, пустой набор, маркер без условий.
  rebuildDrift: RebuildReport;
  rebuildMissingBlock: RebuildReport;
  rebuildNoPatterns: RebuildReport;
  rebuildLegacy: RebuildReport;
};

// ── DXF: что реально лежит в файле ────────────────────────────────────────────────────────────
// Поток пар «код / значение», CRLF (render/dxf.ts). Читаем его как поток пар, а не грепом: строка
// «SEAM» встречается и в ТАБЛИЦЕ слоёв (код 2), и на сущностях (код 8), и склеить их значило бы
// объявить пустой слой непустым — то есть ровно ту ложь, которую зонд ищет.
function dxfLayerStats(dxf: string): ExportReport {
  const lines = dxf.split('\r\n');
  let declaresSeam = false;
  let declaresInner = false;
  let seamEntities = 0;
  let innerEntities = 0;
  let inLayerTable = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1];
    if (code === '0' && value === 'TABLE') inLayerTable = true;
    if (code === '0' && value === 'ENDTAB') inLayerTable = false;
    if (inLayerTable && code === '2') {
      if (value === 'SEAM') declaresSeam = true;
      if (value === 'INNER') declaresInner = true;
    }
    if (code === '8') {
      if (value === 'SEAM') seamEntities++;
      if (value === 'INNER') innerEntities++;
    }
  }
  return { declaresSeam, declaresInner, seamEntities, innerEntities, bytes: dxf.length };
}

function reportOf(out: ReturnType<typeof rebuildMarkerDrawingFromParsed>): RebuildReport {
  if (out.ok) {
    return {
      ok: true,
      error: '',
      errorKind: '',
      pieces: out.pieces.length,
      withDrawing: out.pieces.filter((p) => (p.inner ?? []).length > 0).length,
    };
  }
  return {
    ok: false,
    error: describeRebuildError(out.error),
    errorKind: out.error.kind,
    pieces: 0,
    withDrawing: 0,
  };
}

export type ConditionsInput = {
  sheets: SheetBytes[];
  contourLayer?: string;
  grainLayer?: string;
  seamAllowanceCm?: number;
  fabricWidthCm?: number;
};

export async function analyzeConditions(input: ConditionsInput): Promise<ConditionsReport> {
  const opts = { unit: 'auto' as const, tol: NEST_DEFAULTS.tol, tolChain: NEST_DEFAULTS.tolChain };
  const { pieces: parsed, detectedUnit } = await parseSheets(input.sheets, opts);
  const split = splitPiecesBySize(parsed, DICT_TOKENS);

  // ── B4 ────────────────────────────────────────────────────────────────────────────────────
  // Индекс строится по ПОЛНОМУ разбору — на отфильтрованном по слою наборе мерить нечем.
  const index = buildAllowanceIndex(parsed);
  const opted = layerOptions(parsed, split.codeById, index);
  const bare = layerOptions(parsed, split.codeById);
  const layers: LayerReport[] = opted.map((o) => ({
    layer: o.layer,
    pieces: o.pieces,
    graded: o.graded,
    checked: o.checked,
    label: layerAllowanceLabel(o),
    verdict: o.allowance ? o.allowance.verdict : 'not_measured',
    sampled: o.sampled,
    allowanceCm: o.allowanceCm,
    gapCm: o.allowance?.gapCm ?? null,
    acceptedBlocks: o.allowance?.stats.accepted ?? 0,
    unknownReason: o.allowance?.reason ?? null,
  }));
  const defaultLayer = input.contourLayer ?? defaultContourLayer(opted);
  const chosen = opted.find((o) => o.layer === defaultLayer) ?? null;
  const measured = chosen?.allowance ?? null;
  const cutOption = opted.find((o) => o.allowance?.verdict === 'cut') ?? null;

  // ── §5.5 ──────────────────────────────────────────────────────────────────────────────────
  const fallbackCm = NEST_DEFAULTS.seamAllowanceCm;
  const prefill = {
    bare: seamAllowancePrefill({ measured, fallbackCm }),
    withCard: seamAllowancePrefill({ measured, cardRequiredCm: 0.7, fallbackCm }),
    withWorkshop: seamAllowancePrefill({ measured, workshopDefaultCm: 0.3, fallbackCm }),
    onCutLayer: cutOption ? seamAllowancePrefill({ measured: cutOption.allowance, fallbackCm }) : null,
    onCutLayerWithCard: cutOption
      ? seamAllowancePrefill({ measured: cutOption.allowance, cardRequiredCm: 0.7, fallbackCm })
      : null,
  };
  const doubleAllowanceOnDefaultLayer =
    measured?.verdict === 'cut' && (measured.allowanceCm ?? 0) > 0;

  // ── B5: путь оператора до блоба ───────────────────────────────────────────────────────────
  const grainLayers = grainLayerOptions(parsed);
  const grainLayer = input.grainLayer ?? defaultGrainLayer(grainLayers);
  const seamAllowanceCm = input.seamAllowanceCm ?? 1;
  const widthCm = input.fabricWidthCm ?? 140;

  // Один контур на блок выбранного слоя — ровно так набирает детали модалка (плюс её фильтр по
  // составу, который здесь не нужен: раскладывать мы не будем).
  const seen = new Set<string>();
  const picked: PieceDTO[] = [];
  for (const p of parsed) {
    if ((p.layer ?? '') !== defaultLayer) continue;
    const key = `${p.fileIndex}|${p.blockName || p.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(p);
  }
  const oriented = orientToGrain(picked, grainLayer);
  const withSeam = applySeamAllowance(oriented.pieces, seamAllowanceCm);
  const laid = withSeam.pieces;

  // Размещения синтетические и намеренно тривиальные: зонд проверяет ЧЕРТЁЖ, а не поиск. Реальный
  // прогон добавил бы к ответу двадцать секунд и ни одного нового факта — сверка §7.3 идёт по
  // контуру детали в её собственной системе, куда размещение не входит вовсе.
  let cursor = 0;
  const placements = laid.map((p) => {
    const x = cursor;
    cursor += p.bboxW + 1;
    return { pieceId: p.id, instance: 0, rot: 0 as const, x, y: 0, flipped: false };
  });
  const result: NestResult = {
    placements,
    usedLengthCm: cursor,
    efficiency: 0.5,
    placedCount: placements.length,
    totalCount: placements.length,
    unplaced: [],
    generation: 1,
    elapsedMs: 0,
    cancelled: false,
    warnings: [],
  };
  const layout = buildMarkerLayout({
    pieces: laid,
    perSetQty: new Map(laid.map((p) => [p.id, 1])),
    urlBySource: new Map(),
    result,
    unit: detectedUnit,
    config: { targetLengthCm: undefined, rdpEpsCm: NEST_DEFAULTS.rdpEpsCm, timeBudgetMs: 20_000 },
    tol: NEST_DEFAULTS.tol,
    tolChain: NEST_DEFAULTS.tolChain,
    composition: [{ sizeId: 1, quantity: 1 }],
  });
  // Сводка — ровно те поля, которые шлёт `saveMarker` после B5: припуск, слой контура, слой
  // долевой. Без них пересборка отказывается ДО сети («conditions-missing»), и это её первый
  // проверяемый ответ.
  const marker: common_TechCardMarker = {
    summary: {
      id: 1,
      name: 'зонд',
      fabricWidthCm: { value: String(widthCm) },
      usedLengthCm: { value: String(result.usedLengthCm.toFixed(2)) },
      efficiencyPct: { value: '50' },
      placedCount: result.placedCount,
      totalCount: result.totalCount,
      seamAllowanceCm: { value: seamAllowanceCm.toFixed(2) },
      contourLayer: defaultLayer,
      grainLayer,
    } as common_TechCardMarker['summary'],
    layout,
  };
  const view = markerToView(marker);

  const exportStored = dxfLayerStats(renderLayoutDxf(view.result, view.pieces, widthCm));
  const rebuilt = rebuildMarkerDrawingFromParsed({ marker, parsed });
  const exportRebuilt = dxfLayerStats(
    renderLayoutDxf(view.result, rebuilt.ok ? rebuilt.pieces : view.pieces, widthCm),
  );

  // ── отказы ────────────────────────────────────────────────────────────────────────────────
  // Подменённая выкройка: та же деталь, другой контур. Масштаб, а не сдвиг — сдвиг снялся бы
  // ренормализацией к собственному bbox, и «подмена» прошла бы сверку, ничего не доказав.
  const victim = (picked[0]?.blockName ?? '').trim();
  const drifted = parsed.map((p) =>
    (p.blockName ?? '').trim() === victim && victim
      ? {
          ...p,
          poly: p.poly.map((q) => ({ x: q.x * 1.05, y: q.y * 1.05 })),
          bboxW: p.bboxW * 1.05,
          bboxH: p.bboxH * 1.05,
          areaCm2: p.areaCm2 * 1.1025,
        }
      : p,
  );
  const withoutBlock = parsed.filter((p) => (p.blockName ?? '').trim() !== victim || !victim);
  const legacyMarker: common_TechCardMarker = {
    summary: { id: 1, name: 'старая норма' } as common_TechCardMarker['summary'],
    layout,
  };

  return {
    parsed: parsed.length,
    layers,
    layersWithoutIndex: bare.map((o) => ({
      layer: o.layer,
      measured: o.allowance != null,
      label: layerAllowanceLabel(o),
    })),
    defaultLayer,
    defaultVerdict: measured ? measured.verdict : 'not_measured',
    seamLayerPick: seamLineLayer(opted),
    cutLayers: opted.filter((o) => o.allowance?.verdict === 'cut').map((o) => o.layer),
    seamLayers: opted.filter((o) => o.allowance?.verdict === 'seam').map((o) => o.layer),
    prefill,
    doubleAllowanceOnDefaultLayer,
    markerSeamAllowanceCm: seamAllowanceCm,
    markerContourLayer: defaultLayer,
    markerGrainLayer: grainLayer,
    storedPieces: (layout.pieces ?? []).length,
    exportStored,
    exportRebuilt,
    rebuild: reportOf(rebuilt),
    rebuildDrift: reportOf(rebuildMarkerDrawingFromParsed({ marker, parsed: drifted })),
    rebuildMissingBlock: reportOf(
      rebuildMarkerDrawingFromParsed({ marker, parsed: withoutBlock }),
    ),
    rebuildNoPatterns: reportOf(rebuildMarkerDrawingFromParsed({ marker, parsed: [] })),
    rebuildLegacy: reportOf(
      rebuildMarkerDrawingFromParsed({ marker: legacyMarker, parsed }),
    ),
  };
}

// ── ОТБОР ВЫКРОЕК ПОД РАСКЛАДКУ (§7.5 + известный гэп) ────────────────────────────────────────
// Файлов не требует: это правило, а не измерение. Проверяется здесь, потому что модалка кормит им
// пересборку, и «выкройки не загружены» на карточке, где они загружены, — самый дорогой из
// возможных неверных ответов: он отправляет оператора искать несуществующую пропажу.
export type PickCase = {
  name: string;
  got: PatternSource[];
};

export function patternPickCases(): PickCase[] {
  const rows: MarkerPatternRow[] = [
    { name: 'верх', url: 'https://cdn/x/top.dxf', bomLineKey: 'line-a' },
    { name: 'подклад', url: 'https://cdn/x/lining.dxf', bomLineKey: 'line-b' },
    // Лист, привязанный к НАЗНАЧЕНИЮ и без ключа строки: назначение владеет несколькими строками.
    { name: 'основной по назначению', url: 'https://cdn/x/main.dxf', fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN' },
    // PDF — устаревший формат, разбирать нечем.
    { name: 'старый pdf', url: 'https://cdn/x/old.pdf', bomLineKey: 'line-a' },
    // «Назначение не задано» — это ОТСУТСТВИЕ ответа, а не девятое назначение.
    { name: 'unset', url: 'https://cdn/x/unset.dxf', bomLineKey: 'line-a', fabricPurpose: 'TECH_CARD_BOM_PURPOSE_UNSET' },
  ];
  return [
    {
      name: 'без резолвера: по ключу строки',
      got: patternSourcesForMarker(rows, { bomLineKey: 'line-a' }),
    },
    {
      name: 'с резолвером: назначение владеет строкой',
      got: patternSourcesForMarker(rows, {
        bomLineKey: 'line-a',
        purposeOwnsLine: (p) => p === 'TECH_CARD_BOM_PURPOSE_MAIN',
      }),
    },
    {
      name: 'с резолвером: назначение НЕ владеет строкой',
      got: patternSourcesForMarker(rows, {
        bomLineKey: 'line-a',
        purposeOwnsLine: () => false,
      }),
    },
    {
      name: 'раскладка без привязки к ткани',
      got: patternSourcesForMarker(rows, { bomLineKey: '' }),
    },
  ];
}
