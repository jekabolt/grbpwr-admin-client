// ПЕРЕСБОРКА ЧЕРТЕЖА ДЕТАЛИ ПРИ ЭКСПОРТЕ СОХРАНЁННОГО МАРКЕРА (Ф3.5).
//
// ЧТО ЧИНИТСЯ. Блоб маркера хранит ВНЕШНИЕ контуры и размещения — и больше ничего
// (`buildMarkerLayout`: pieceId/name/source/poly/bbox/area/blockName). Чертёж детали — линия шва,
// надсечки, свёрла, вытачки — живёт в `PieceDTO.inner`, в блоб не пишется и полем прото не
// выражен вовсе. Значит деталь, восстановленная `markerToView`, приходит БЕЗ чертежа, и экспорт
// переоткрытого маркера выдаёт файл, у которого линии шва нет. Раскройщик, у которого «слоя SEAM
// в файле нет», читает это как «у изделия нет линии шва» — и режет по единственной линии,
// которая там есть.
//
// ПОЧЕМУ НЕ ХРАНИТЬ ЧЕРТЁЖ В БЛОБЕ. Потому что он ПРОИЗВОДНЫЙ. `orientToGrain` и
// `applySeamAllowance` — чистые функции, зовущиеся по обе стороны воркера на одном входе
// (`geom/grain-orient.ts`, `geom/seam-allowance.ts`), а разбор DXF детерминирован при тех же
// `unit/tol/tolChain`. То есть чертёж ВОСПРОИЗВОДИМ из выкройки, а хранить производное в блобе,
// у которого кап 300 деталей упирается в размер раньше, чем в смысл, — плата без выигрыша.
//
// ПОЧЕМУ ФАЙЛЫ БЕРУТСЯ ИЗ СЕГОДНЯШНИХ СТРОК ВЫКРОЕК, А НЕ ИЗ БЛОБА. Сервер СТИРАЕТ `source_url`
// на сохранении (`apisrv/admin/techcard_markers.go`, `p.SourceUrl = ""`), и это by design: строки
// выкроек — full-replace ребёнок, объекты CDN собираются сборщиком мусора, как только на них не
// ссылается ни одна строка, так что ссылка внутри блоба протухла бы при первой же перезаливке
// листа. Значит единственный законный источник файлов — строки выкроек карточки СЕГОДНЯ, а
// «сегодняшний файл — тот же самый» обязано быть ДОКАЗАНО, а не предположено. Отсюда сверка.
//
// СВЕРКА — ЭТО НЕ ПЕДАНТИЗМ, А ЕДИНСТВЕННАЯ ЗАЩИТА ОТ ПОДМЕНЫ. Пересборка склеивает СТАРЫЕ
// размещения с НОВОЙ геометрией. Если выкройку перезалили другой, размещения останутся от
// прежней, и файл выйдет с перехлёстом — молча, потому что «деталей столько же и имена те же».
// Сверка контура ловит это до экспорта. Она же ловит и класс ошибок, ради которого заведён
// `flipped`: у зеркального блока (FP_L против FP_R) контур — тот же силуэт с ОБРАТНЫМ обходом,
// поэтому поточечное сравнение расходится на первой же вершине, и правая полочка не может
// молча встать на место левой.
//
// ЗЕРКАЛО И ПОВОРОТ ЗДЕСЬ НЕ ПРИМЕНЯЮТСЯ ВООБЩЕ, и это часть договора. `placed(p) = R(rot) ·
// M^flipped · p + (x, y)` (см. `lib/nesting/types.ts`) живёт на РАЗМЕЩЕНИИ, а размещения
// приезжают из блоба нетронутыми. Пересборка работает в СОБСТВЕННОЙ системе детали — там же, где
// живёт сохранённый `poly`, — и сверяет одно с другим до всякой укладки. Применить здесь зеркало
// «чтобы совпало» значило бы стереть ровно ту подпись, по которой отличается левая деталь от
// правой, и получить сорок четыре левые полочки, у которых на экране всё в порядке.
import type {
  common_TechCardMarker,
  common_TechCardMarkerLayout,
  common_TechCardMarkerPiece,
  common_TechCardMarkerSummary,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { orientToGrain } from 'lib/nesting/geom/grain-orient';
import { mmToEngineCm } from './allowance-units';
import { applySeamAllowance } from 'lib/nesting/geom/seam-allowance';
import type { ParseOpts, PieceDTO, Pt } from 'lib/nesting/types';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { isDxfUrl } from 'utils/pattern';

import { decNum } from './marker-io';
import { patternSheetName, sameSheetName } from './sheet-name';

// ── условия съёмки, прочитанные со строки ───────────────────────────────────────────────

// Поля Ф3 на сводке (`seam_allowance_cm` 27, `contour_layer` 29, `grain_layer` 30) приезжают
// СЛЕДУЮЩИМ бампом сабмодуля прото (работа B0), а этот модуль пишется параллельно с ним.
// Поэтому они читаются через структурный тип, а не через `any`: когда генерированный
// `common_TechCardMarkerSummary` их получит, пересечение ниже останется валидным и НИ ОДНА
// строка здесь не изменится.
type Ф3ConditionFields = {
  seamAllowanceMm?: googletype_Decimal | undefined;
  contourLayer?: string | undefined;
  grainLayer?: string | undefined;
};

export type MarkerConditions = {
  // Припуск, который раскладка ДОБАВИЛА, раздув контур наружу. 0 — законное значение.
  seamAllowanceMm: number;
  // Слой DXF, с которого взят разложенный контур. '' — слоя не выбирали (выбирать было не из чего).
  contourLayer: string;
  // Слой DXF долевой. '' ЗНАЧИМА и значит «не разворачивать» — оператор мог отключить разворот.
  grainLayer: string;
  // На строке записано хоть одно из трёх. false = маркер снят ДО Ф3, и восстановить условия
  // нечем. Это НЕ «нулевой припуск без разворота»: догадка здесь дала бы контур, разошедшийся с
  // сохранённым, и сверка обвинила бы в подмене ни в чём не повинную выкройку.
  recorded: boolean;
};

export function readMarkerConditions(summary?: common_TechCardMarkerSummary): MarkerConditions {
  const s = (summary ?? {}) as common_TechCardMarkerSummary & Ф3ConditionFields;
  return {
    seamAllowanceMm: s.seamAllowanceMm !== undefined ? decNum(s.seamAllowanceMm) : 0,
    contourLayer: s.contourLayer ?? '',
    grainLayer: s.grainLayer ?? '',
    // ЗАПИСАН ЛИ ПРИПУСК — вопрос про ПРИПУСК, и отвечать на него наличием слоя нельзя. Слой контура
    // и долевая записываются независимо, поэтому раскладка со слоями и без припуска считалась бы
    // «записанной», а поле выше подставляло бы ВЫДУМАННЫЙ ноль — то есть пересборка молча
    // раскладывала бы по линии шва там, где припуск просто не мерили. Ноль — законное ИЗМЕРЕННОЕ
    // значение, и отличать его от «не записано» обязаны все читатели одинаково: conditionsOf в
    // marker-io.ts судит ровно по этому же признаку.
    recorded: s.seamAllowanceMm !== undefined,
  };
}

// Параметры РАЗБОРА берутся из блоба, а не из NEST_DEFAULTS. Тесселяция дуг и сшивка цепочек
// зависят от tol/tolChain напрямую: разбери сегодня с другим допуском — получишь другое ЧИСЛО
// точек на той же дуге, и сверка упадёт на ровном месте, обвинив файл, который никто не трогал.
// NEST_DEFAULTS остаётся запасным ответом для блоба без params (схема 1) — другого источника у
// такого блоба нет вовсе.
export function rebuildParseOpts(layout?: common_TechCardMarkerLayout): ParseOpts {
  const p = layout?.params;
  const unit = p?.unit;
  return {
    unit: unit === 'mm' || unit === 'cm' || unit === 'in' ? unit : 'auto',
    tol: p?.tolCm != null && p.tolCm > 0 ? p.tolCm : NEST_DEFAULTS.tol,
    tolChain: p?.tolChainCm != null && p.tolChainCm > 0 ? p.tolChainCm : NEST_DEFAULTS.tolChain,
  };
}

// ── отказы ──────────────────────────────────────────────────────────────────────────────

export type RebuildError =
  // Строк выкроек этой ткани на карточке нет вовсе — пересобирать не из чего.
  | { kind: 'no-patterns' }
  // Маркер снят до Ф3: условий съёмки на строке нет, и повторить преобразования нечем.
  | { kind: 'conditions-missing' }
  // Файлы не скачались/не разобрались. `names` — их имена, как они названы на карточке.
  | { kind: 'fetch-failed'; names: string[] }
  // В сегодняшних выкройках нет блока, под которым деталь сохранена.
  | { kind: 'block-missing'; blockName: string; pieceName: string; more: number }
  // Деталь сохранена БЕЗ имени блока (блоб схемы 1 или файл-«россыпь» без блоков), и
  // геометрического двойника у неё в файле тоже не нашлось ровно одного.
  | {
      kind: 'piece-unidentified';
      pieceName: string;
      reason: 'no-block-name' | 'ambiguous';
      more: number;
    }
  // Блок нашёлся, а контур разошёлся: файл заменили (или это другой размер/слой/допуск).
  // `deltaCm === null` — разошлось ЧИСЛО точек, тогда расстояние не определено вовсе.
  | {
      kind: 'geometry-drift';
      blockName: string;
      pieceName: string;
      deltaCm: number | null;
      storedPoints: number;
      rebuiltPoints: number;
      more: number;
    };

const cm = (n: number): string => (n >= 1 ? n.toFixed(2) : n.toFixed(3));

// Огибающая ОКРУГЛЕНИЯ блоба: контур хранится с двумя знаками, значит каждая координата может
// отличаться на пол-шага, а расстояние — на 0.005·√2. Всё, что укладывается сюда, про РАЗМЕР
// детали не говорит ничего: габарит тот же, разошлись сами точки.
export const ROUNDING_ENVELOPE_CM = 0.005 * Math.SQRT2;

// Текст отказа — ОДИН на весь экран, здесь, а не в модалке. Панель Ф3.5 и подпись редактора
// («чертёж детали не восстановлен») говорят об одном и том же факте, и два места, где он
// формулируется, однажды скажут разное.
export function describeRebuildError(e: RebuildError): string {
  const more = (n: number) => (n > 0 ? ` (and ${n} more ${n === 1 ? 'piece' : 'pieces'})` : '');
  switch (e.kind) {
    case 'no-patterns':
      return 'the patterns for this fabric are not uploaded — there is nothing to restore the piece drawing (seam line, notches) from';
    case 'conditions-missing':
      return "the marker was captured before capture conditions started being recorded: the contour layer, the grainline layer and the seam allowance are unknown, and there is nothing to repeat them with. the drawing can't be restored — re-capture the marker";
    case 'fetch-failed':
      return `couldn't download pattern ${e.names.join(', ')} — re-upload it; without the file the drawing can't be restored`;
    case 'block-missing':
      return `the current pattern has no block ${e.blockName}${more(e.more)} — the file was replaced. re-upload the previous pattern or re-capture the marker`;
    case 'piece-unidentified':
      return e.reason === 'no-block-name'
        ? `piece “${e.pieceName}”${more(e.more)} was saved without a block name (an old marker), and the pattern holds no single contour that matches it. the drawing can't be restored — re-capture the marker`
        : `piece “${e.pieceName}”${more(e.more)} matches several blocks of the pattern at once, and their drawings differ — which of them is the one is unknown. re-capture the marker`;
    case 'geometry-drift':
      if (e.deltaCm === null) {
        return `the pattern was replaced: piece ${e.blockName}${more(e.more)} has a different number of contour points (was ${e.storedPoints}, now ${e.rebuiltPoints}). export with the drawing is impossible — re-capture the marker`;
      }
      // Расхождение ВНУТРИ шага хранения (0.005·√2 см) — это не «чуть-чуть заменили». Габарит
      // совпал, а точки нет: так выглядит ЗЕРКАЛЬНЫЙ двойник почти симметричной детали (правая
      // вместо левой) или пересохранение файла другой программой. Назвать это «файл заменён и
      // разошёлся на 7 сотых миллиметра» значит подсказать оператору, что можно не обращать
      // внимания, — а обращать надо в первую очередь.
      if (e.deltaCm <= ROUNDING_ENVELOPE_CM) {
        return `piece ${e.blockName}${more(e.more)} matches by bounding box but not by contour points (divergence ${cm(e.deltaCm)} cm). this is what a MIRRORED version of the piece standing in for the previous one looks like, or a file re-saved by a different program. export with the drawing is impossible — re-capture the marker`;
      }
      return `the pattern was replaced: the contour of piece ${e.blockName}${more(e.more)} no longer matches the saved one (divergence ${cm(e.deltaCm)} cm). export with the drawing is impossible — re-capture the marker`;
  }
}

// ── вход/выход ──────────────────────────────────────────────────────────────────────────

// Файл выкройки так, как его видит раскладка: то же имя, что уехало в `piece.source` при съёмке
// (`filesOf` в patterns-field.tsx зовёт `patternSheetName` из `./sheet-name`). Совпадение имён — не
// украшение: при коллизии имён блоков в двух файлах именно оно решает, из какого брать блок.
export type PatternSource = { name: string; url: string };

export type PatternParseOutcome = {
  pieces: PieceDTO[];
  // Файлы, которые не скачались или не разобрались — ИМЕНАМИ, как они названы на карточке.
  failed: string[];
  warnings: string[];
};

// Порт «скачать и разобрать». Отдельным параметром по двум причинам: разбор обязан идти в
// ВОРКЕРЕ (dxf-parser и clipper не должны попасть в главный бандл), а зонд §7.3 обязан звать ту
// же самую пересборку из node, где воркера нет вовсе.
export type PatternParse = (
  sources: readonly PatternSource[],
  opts: ParseOpts,
) => Promise<PatternParseOutcome>;

export type RebuildOutcome =
  | { ok: true; pieces: PieceDTO[]; warnings: string[] }
  | { ok: false; error: RebuildError };

export type RebuildOptions = {
  // Допуск сверки контура, см. 0 (по умолчанию) — ТОЧНОЕ совпадение после округления до 2 знаков,
  // то есть ровно то, чем контур записан в блоб.
  //
  // ЗАМЕРЕНО, а не предположено (зонд Ф3.5 на «summer men.dxf» 45 деталей и «blazer.dxf» 46, в
  // трёх режимах: слой 1 без разворота, слой 14 с долевой по слою 7, два файла сразу; припуск
  // 1.00 см):
  //   • точная сверка проходит на ВСЕХ деталях — 0 расхождений;
  //   • максимум по точкам «сохранённое против пересобранного» — 0.00707 см, и это РОВНО
  //     огибающая округления блоба (0.005·√2): своего дребезга у пересборки нет вовсе;
  //   • экспорт байт в байт совпадает со свежим прогоном (830–1671 КБ файлы).
  // Поэтому послаблять НЕ НАДО, и это не осторожность: у почти симметричной детали (BP_L того же
  // файла) ЗЕРКАЛЬНЫЙ двойник отстоит от оригинала на 0.007 см, то есть допуск «0.02 см, чтобы
  // унять дребезг» пропустил бы подмену правой детали левой — ровно ту, ради которой заведён
  // `flipped`. Дребезга, который надо унимать, нет; допуск здесь может только ослепить.
  maxPointDeltaCm?: number;
};

// ── шаг 1: какие строки выкроек относятся к этой раскладке ──────────────────────────────

// Строка выкройки в том виде, в каком её держит форма карточки (patterns-field.tsx). Структурный
// тип, а не импорт: тот тип локален для своего файла, а этому модулю нужны ровно четыре поля.
export type MarkerPatternRow = {
  url?: string;
  name?: string;
  filename?: string;
  bomLineKey?: string;
  fabricPurpose?: string;
};

export type PatternPickOptions = {
  // Ткань раскладки — `summary.bomLineKey`.
  bomLineKey: string;
  // ЛИСТ ПРИВЯЗАН НЕ ТОЛЬКО СТРОКОЙ BOM. С 0267 у строки выкройки есть ещё и НАЗНАЧЕНИЕ
  // (`fabricPurpose`), и оно резолвится ПЕРЕД `bomLineKey` (`scopeKeyOfBinding` в bom-purpose.ts):
  // лист, привязанный к назначению «основной материал», обслуживает ВСЕ строки этого назначения и
  // никакого `bomLineKey` не несёт. Фильтр по одному `bomLineKey` такие листы теряет — и выдаёт
  // «выкройки не загружены» там, где они загружены. Резолвер обязан прийти от вызывающего: он
  // строится из строк BOM карточки, которых у этого модуля нет.
  purposeOwnsLine?: (fabricPurpose: string) => boolean;
};

export function patternSourcesForMarker(
  rows: readonly MarkerPatternRow[] | undefined,
  opts: PatternPickOptions,
): PatternSource[] {
  const key = opts.bomLineKey.trim();
  const out: PatternSource[] = [];
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const url = row.url;
    // PDF — устаревший формат листа; разбирать его нечем, и попытка дала бы отказ разбора вместо
    // честного «этой ткани выкроек нет».
    if (!url || !isDxfUrl(url)) continue;
    // «Назначение не задано» — это ОТСУТСТВИЕ ответа, а не девятое назначение, и резолвер о нём
    // спрашивать нельзя: у такой строки привязка живёт в `bomLineKey`, ровно как её читает
    // `scopeKeyOfBinding`. Литерал, а не импорт bom-purpose.ts: тот тянет за собой генерированные
    // типы и пикер строк BOM, а этому модулю нужна одна строковая константа.
    const raw = (row.fabricPurpose ?? '').trim();
    const purpose = raw === 'TECH_CARD_BOM_PURPOSE_UNSET' ? '' : raw;
    const bound =
      purpose && opts.purposeOwnsLine
        ? opts.purposeOwnsLine(purpose)
        : !!key && (row.bomLineKey ?? '').trim() === key;
    if (!bound) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    // ИМЯ — тем же правилом, что и при съёмке (`filesOf`), иначе `piece.source` в блобе не с чем
    // будет сопоставить.
    out.push({ name: patternSheetName(row), url });
  }
  return out;
}

// ── сверка контура (§7.3, уровень 1) ────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

export type ContourComparison = {
  match: boolean;
  // Максимум по точкам — чтобы оператор видел МАСШТАБ: 0.03 см это дребезг, 2.1 см это другая
  // выкройка. null — разошлось число точек, и расстояние между «парами» не определено.
  deltaCm: number | null;
};

export function compareContours(
  stored: readonly Pt[],
  rebuilt: readonly Pt[],
  maxPointDeltaCm = 0,
): ContourComparison {
  if (stored.length !== rebuilt.length || stored.length === 0) {
    return { match: false, deltaCm: null };
  }
  let maxDelta = 0;
  let exact = true;
  for (let i = 0; i < stored.length; i++) {
    const s = stored[i];
    const b = rebuilt[i];
    const d = Math.hypot(b.x - s.x, b.y - s.y);
    if (d > maxDelta) maxDelta = d;
    // Сохранённый контур ПРОШЁЛ через r2 при записи (`buildMarkerLayout`), поэтому сравнивать
    // надо в той же сетке — и обе стороны округляются, чтобы сравнение было симметричным, а не
    // зависело от того, кто из двоих уже округлён.
    if (exact && (r2(b.x) !== r2(s.x) || r2(b.y) !== r2(s.y))) exact = false;
  }
  return {
    match: maxPointDeltaCm > 0 ? maxDelta <= maxPointDeltaCm + 1e-12 : exact,
    deltaCm: maxDelta,
  };
}

// ── ядро: пересборка из УЖЕ РАЗОБРАННЫХ деталей ─────────────────────────────────────────

type StoredPiece = {
  id: number;
  name: string;
  blockName: string;
  source: string;
  poly: Pt[];
};

function storedPiecesOf(layout?: common_TechCardMarkerLayout): StoredPiece[] {
  return (layout?.pieces ?? []).map((p: common_TechCardMarkerPiece) => ({
    id: p.pieceId ?? 0,
    name: p.name || `piece ${p.pieceId ?? 0}`,
    blockName: (p.blockName ?? '').trim(),
    source: p.source ?? '',
    poly: (p.poly ?? []).map((pt) => ({ x: pt.xCm ?? 0, y: pt.yCm ?? 0 })),
  }));
}

// Отпечаток ЧЕРТЕЖА, а не контура: им различаются кандидаты, у которых контуры совпали точно.
// Два блока с одинаковым силуэтом и разными надсечками — это две разные детали, и выбрать из них
// молча нельзя.
function innerSignature(p: PieceDTO): string {
  return (p.inner ?? [])
    .map(
      (c) =>
        `${c.layer}|${c.closed ? 1 : 0}|${c.pts.map((q) => `${r2(q.x)},${r2(q.y)}`).join(' ')}`,
    )
    .join(';');
}

type PieceFailure = { stored: StoredPiece; error: RebuildError };

// Приоритет отказа, когда деталей упало несколько: показывать надо КОРЕНЬ, а не первый по
// порядку симптом. Не скачавшийся файл объясняет и «блока нет», и «контур разошёлся», поэтому
// стоит выше обоих.
const FAILURE_RANK: Record<RebuildError['kind'], number> = {
  'no-patterns': 0,
  'conditions-missing': 1,
  'fetch-failed': 2,
  'block-missing': 3,
  'geometry-drift': 4,
  'piece-unidentified': 5,
};

export type RebuildCoreInput = {
  marker: common_TechCardMarker;
  // Всё, что разобралось из сегодняшних выкроек — ДО фильтра по слою, разворота и припуска: их
  // применяет этот модуль, теми же чистыми функциями и с условиями со строки.
  parsed: readonly PieceDTO[];
  // Файлы, которые не доехали. Держат диагноз честным: «блока нет» при не скачавшемся файле —
  // это не «файл заменён», а «файл не скачался», и лечится оно другим действием.
  failedFiles?: readonly string[];
  warnings?: readonly string[];
  conditions?: MarkerConditions;
} & RebuildOptions;

export function rebuildMarkerDrawingFromParsed(input: RebuildCoreInput): RebuildOutcome {
  const { marker, parsed } = input;
  const failedFiles = input.failedFiles ?? [];
  const conditions = input.conditions ?? readMarkerConditions(marker.summary);
  const eps = input.maxPointDeltaCm ?? 0;
  const warnings: string[] = [...(input.warnings ?? [])];

  if (!conditions.recorded) return { ok: false, error: { kind: 'conditions-missing' } };

  const stored = storedPiecesOf(marker.layout);
  // Блоб без деталей — это не пересборка, а деградированный маркер: рисовать нечего, и говорит об
  // этом модалка (`viewDegraded`), а не отказ пересборки.
  if (stored.length === 0) return { ok: true, pieces: [], warnings };

  if (parsed.length === 0) {
    return failedFiles.length > 0
      ? { ok: false, error: { kind: 'fetch-failed', names: [...failedFiles] } }
      : { ok: false, error: { kind: 'no-patterns' } };
  }

  // Шаг 3. Слой контура. '' — не фильтровать: пустым он бывает ровно тогда, когда выбирать было
  // не из чего (`defaultContourLayer` отдаёт '' только на пустом списке слоёв), и фильтр по ''
  // тогда либо совпадает с отсутствием фильтра, либо выкидывает всё. Лишние кандидаты безопасны:
  // ниже их отсеивает сверка геометрии, а вот лишний отказ стоит цеху экспорта.
  const onLayer = conditions.contourLayer
    ? parsed.filter((p) => (p.layer ?? '') === conditions.contourLayer)
    : [...parsed];

  // Шаги 4–5. ТЕ ЖЕ чистые функции, в том же порядке, с числами со строки. Порядок не
  // переставляется: припуск раздувает УЖЕ развёрнутый контур, и обратная последовательность дала
  // бы другую геометрию на том же входе.
  const oriented = orientToGrain(onLayer, conditions.grainLayer);
  // Те же миллиметры→сантиметры, что в size-areas-from-dxf: пересборка обязана воспроизвести
  // геометрию исходной раскладки, а движок читает сантиметры.
  const seam = applySeamAllowance(oriented.pieces, mmToEngineCm(conditions.seamAllowanceMm));
  const candidates = seam.pieces;
  if (seam.hulled.length > 0) {
    warnings.push(`contour replaced by its convex hull: ${seam.hulled.join(', ')}`);
  }

  // Индекс по имени блока. Регистронезависимый — запасной: одна и та же выкройка, пересохранённая
  // другим CAD, меняет регистр имён блоков, а геометрию нет; идентичность всё равно доказывает
  // сверка, поэтому смягчение здесь ничего не открывает.
  const byBlock = new Map<string, PieceDTO[]>();
  const byBlockLower = new Map<string, PieceDTO[]>();
  for (const p of candidates) {
    const b = (p.blockName ?? '').trim();
    if (!b) continue;
    const exact = byBlock.get(b);
    if (exact) exact.push(p);
    else byBlock.set(b, [p]);
    const lower = byBlockLower.get(b.toLowerCase());
    if (lower) lower.push(p);
    else byBlockLower.set(b.toLowerCase(), [p]);
  }

  const out: PieceDTO[] = [];
  const failures: PieceFailure[] = [];

  for (const sp of stored) {
    // Шаг 6. Сопоставление по имени блока (v2-идентичность). Деталь без имени блока — блоб схемы
    // 1 или файл-«россыпь»: имени нет, и опознавать её приходится ГЕОМЕТРИЕЙ, то есть требовать
    // ровно одного точного совпадения на весь файл.
    const pool = sp.blockName
      ? (byBlock.get(sp.blockName) ?? byBlockLower.get(sp.blockName.toLowerCase()) ?? [])
      : candidates;

    if (sp.blockName && pool.length === 0) {
      failures.push({
        stored: sp,
        error:
          failedFiles.length > 0
            ? { kind: 'fetch-failed', names: [...failedFiles] }
            : { kind: 'block-missing', blockName: sp.blockName, pieceName: sp.name, more: 0 },
      });
      continue;
    }

    // Шаг 7. Сверка. Совпавшие кандидаты — те, чей контур воспроизводит сохранённый ТОЧНО.
    const matched = pool.filter((c) => compareContours(sp.poly, c.poly, eps).match);

    if (matched.length === 0) {
      // Не доехавший файл объясняет любую из двух неудач ниже, и объясняет ДЕЙСТВИЕМ: перезалить
      // лист. Поэтому он проверяется первым — обвинить выкройку в подмене, не сумев её скачать,
      // значит послать оператора переснимать раскладку из-за упавшего CDN.
      if (failedFiles.length > 0) {
        failures.push({ stored: sp, error: { kind: 'fetch-failed', names: [...failedFiles] } });
        continue;
      }
      if (!sp.blockName) {
        failures.push({
          stored: sp,
          error: {
            kind: 'piece-unidentified',
            pieceName: sp.name,
            reason: 'no-block-name',
            more: 0,
          },
        });
        continue;
      }
      // Мерить расхождение надо по ЛУЧШЕМУ кандидату, иначе число в сообщении описывает
      // случайного соседа. «Лучший» — сперва из того же файла (имя листа), затем с тем же числом
      // точек, затем с наименьшим расхождением.
      let best: { cand: PieceDTO; cmp: ContourComparison } | null = null;
      for (const c of pool) {
        const cmp = compareContours(sp.poly, c.poly, eps);
        if (!best) {
          best = { cand: c, cmp };
          continue;
        }
        const sameSource = sameSheetName(c.source, sp.source) ? 1 : 0;
        const bestSource = sameSheetName(best.cand.source, sp.source) ? 1 : 0;
        if (sameSource !== bestSource) {
          if (sameSource > bestSource) best = { cand: c, cmp };
          continue;
        }
        const has = cmp.deltaCm != null ? 1 : 0;
        const bestHas = best.cmp.deltaCm != null ? 1 : 0;
        if (has !== bestHas) {
          if (has > bestHas) best = { cand: c, cmp };
          continue;
        }
        if (cmp.deltaCm != null && best.cmp.deltaCm != null && cmp.deltaCm < best.cmp.deltaCm) {
          best = { cand: c, cmp };
        }
      }
      failures.push({
        stored: sp,
        error: {
          kind: 'geometry-drift',
          blockName: sp.blockName,
          pieceName: sp.name,
          deltaCm: best?.cmp.deltaCm ?? null,
          storedPoints: sp.poly.length,
          rebuiltPoints: best?.cand.poly.length ?? 0,
          more: 0,
        },
      });
      continue;
    }

    let pick = matched[0];
    if (matched.length > 1) {
      const fromSameSheet = matched.filter((c) => sameSheetName(c.source, sp.source));
      if (fromSameSheet.length === 1) {
        pick = fromSameSheet[0];
      } else {
        // Контуры совпали у нескольких — значит силуэт один. Различить их может только ЧЕРТЁЖ, и
        // если он тоже один, выбор безразличен. Если чертёж разный — это две разные детали с
        // одинаковым силуэтом, и тихий выбор одной из них и есть та самая ложь.
        const scope = fromSameSheet.length > 0 ? fromSameSheet : matched;
        const sig = innerSignature(scope[0]);
        if (scope.every((c) => innerSignature(c) === sig)) {
          pick = scope[0];
        } else {
          failures.push({
            stored: sp,
            error: {
              kind: 'piece-unidentified',
              pieceName: sp.name,
              reason: 'ambiguous',
              more: 0,
            },
          });
          continue;
        }
      }
    }

    // Шаг 8. ГЕОМЕТРИЯ — ПЕРЕСОБРАННАЯ, а не сохранённая, и это не описка. Сохранённый контур
    // округлён до 2 знаков (`buildMarkerLayout`), а пересобранная линия шва — полной точности;
    // приклеить одно к другому значит нарисовать пару линий из разных поколений и подорвать ровно
    // то обещание, ради которого слой SEAM заведён («зазор между линиями и есть припуск»). Сверка
    // выше уже доказала, что контуры совпадают, — значит брать надо тот, у которого точность выше.
    //
    // От СОХРАНЁННОЙ детали остаётся ровно идентичность: `id` (на него ссылаются размещения
    // блоба) и подписи. Всё остальное — `grain`/`originX/Y` включительно — приезжает из
    // пересборки: по НАЛИЧИЮ этих двух планировщик подписей решает, была ли деталь развёрнута по
    // долевой (`render/label-fit.ts`), то есть под каким углом печатать имя в DXF. Подставить сюда
    // сохранённую деталь (у неё их нет вовсе) значило бы повернуть подписи в файле, по которому
    // режут.
    out.push({
      ...pick,
      id: sp.id,
      name: sp.name || pick.name,
      source: sp.source || pick.source,
    });
  }

  if (failures.length > 0) {
    const ranked = [...failures].sort((a, b) => {
      const d = FAILURE_RANK[a.error.kind] - FAILURE_RANK[b.error.kind];
      if (d !== 0) return d;
      // Внутри одного вида — сперва самое крупное расхождение: «2.1 см» отвечает на вопрос
      // «подменили ли выкройку» сразу, а «0.03 см» на него не отвечает вовсе.
      if (a.error.kind === 'geometry-drift' && b.error.kind === 'geometry-drift') {
        return (b.error.deltaCm ?? Infinity) - (a.error.deltaCm ?? Infinity);
      }
      return 0;
    });
    const primary = ranked[0].error;
    // `more` считает ВСЕ упавшие детали, а не только однородные: заменённый файл роняет их
    // пачкой, и «нет блока BP_M» без «и ещё 23» описывает аварию как опечатку.
    const more = failures.length - 1;
    switch (primary.kind) {
      case 'block-missing':
        return { ok: false, error: { ...primary, more } };
      case 'geometry-drift':
        return { ok: false, error: { ...primary, more } };
      case 'piece-unidentified':
        return { ok: false, error: { ...primary, more } };
      default:
        return { ok: false, error: primary };
    }
  }

  // Файл не доехал, а все детали всё равно восстановились — значит он к этой раскладке отношения
  // не имел (лишняя строка, старая ревизия). Отказывать тут не за что, но и промолчать нельзя:
  // оператор обязан знать, что часть карточки недоступна.
  if (failedFiles.length > 0) {
    warnings.push(
      `files that didn't arrive: ${failedFiles.join(', ')} — they don't affect the drawing of this marker`,
    );
  }

  return { ok: true, pieces: out, warnings };
}

// ── боевой вход: скачать, разобрать, пересобрать ────────────────────────────────────────

// Разбор идёт В ВОРКЕРЕ и только через динамический импорт. Статический притащил бы dxf-parser и
// геометрию разбора в тот же чанк, что и этот модуль, — а он импортируется модалкой, у которой
// весь смысл в ленивой загрузке. Заодно это единственное, что позволяет звать ядро выше из node,
// где ни `Worker`, ни `import.meta.env` не существуют.
export const defaultPatternParse: PatternParse = async (sources, opts) => {
  const [{ fetchMediaBlob }, { NestingWorkerClient }] = await Promise.all([
    import('lib/features/media-blob'),
    import('lib/nesting/worker/client'),
  ]);
  const settled = await Promise.allSettled(
    sources.map(async (s) => new File([await fetchMediaBlob(s.url)], s.name)),
  );
  const files: File[] = [];
  const failed: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') files.push(r.value);
    else failed.push(sources[i].name);
  });
  if (files.length === 0) return { pieces: [], failed, warnings: [] };
  const client = new NestingWorkerClient();
  try {
    const out = await client.parse(files, opts);
    return { pieces: out.pieces, failed, warnings: out.warnings };
  } finally {
    // Воркер пересборки живёт ровно один разбор. Держать его открытым значит держать вторую
    // копию разобранных деталей рядом с той, что уже есть у модалки.
    client.terminate();
  }
};

export type RebuildInput = {
  marker: common_TechCardMarker;
  sources: readonly PatternSource[];
  parse?: PatternParse;
} & RebuildOptions;

export async function rebuildMarkerDrawing(input: RebuildInput): Promise<RebuildOutcome> {
  const conditions = readMarkerConditions(input.marker.summary);
  // Порядок проверок — от самого дешёвого и самого частого. Условия проверяются ДО сети: маркер,
  // снятый до Ф3, не станет восстановимым от того, что мы скачаем ради него десять мегабайт.
  if (!conditions.recorded) return { ok: false, error: { kind: 'conditions-missing' } };
  if (input.sources.length === 0) return { ok: false, error: { kind: 'no-patterns' } };

  const opts = rebuildParseOpts(input.marker.layout);
  const parse = input.parse ?? defaultPatternParse;
  let outcome: PatternParseOutcome;
  try {
    outcome = await parse(input.sources, opts);
  } catch {
    // Разбор упал целиком (воркер умер, файл оказался DWG) — это тот же диагноз «без файла
    // чертежа нет», и лечится он тем же действием.
    return { ok: false, error: { kind: 'fetch-failed', names: input.sources.map((s) => s.name) } };
  }

  return rebuildMarkerDrawingFromParsed({
    marker: input.marker,
    parsed: outcome.pieces,
    failedFiles: outcome.failed,
    warnings: outcome.warnings,
    conditions,
    maxPointDeltaCm: input.maxPointDeltaCm,
  });
}
