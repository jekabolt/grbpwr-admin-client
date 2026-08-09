import type { common_TechCardBomKind } from 'api/proto-http/admin';
import type { LayVerdict } from 'components/managers/production-runs/components/useLays';
import { UNSET_KIND } from 'components/managers/tech-card/components/bom-kind';
import {
  cutSymmetryUnanswered,
  isCutSymmetryMarked,
} from 'components/managers/tech-card/components/piece-codes';

// ПЕЧАТНЫЕ МЕТКИ — АНГЛИЙСКИЙ СЛОЙ, ТОЛЬКО ДЛЯ БУМАГИ.
//
// Словари меток, которые печатные документы звали до этого файла, делят код с ЭКРАННЫМИ
// компонентами (pieces-tab.tsx, lay-editor.tsx, lay-coverage-table.tsx, operations-field.tsx,
// sketch-tab.tsx, run-pack-viewer/components/cut-list.tsx). Перевести их на месте значило бы
// перевести и админку, которой этого не просили. Поэтому бумага получает свой слой, а экран
// остаётся русским: печатный документ уезжает на внешнюю фабрику, и русский текст на нём
// нечитаем для получателя.
//
// Правило модуля — как у print/sheet.tsx и по той же причине: он обязан остаться ЛЁГКИМ.
// Только строки и чистые функции; никаких React-импортов, RPC, словарей и хуков. Предикаты
// (isCutSymmetryMarked, cutSymmetryUnanswered) при этом ИМПОРТИРУЮТСЯ из экранного словаря,
// а не копируются: «когда печатать оговорку» обязано совпадать у экрана и бумаги, расходиться
// им разрешено только в языке подписи.
//
// Глифы не переводятся и здесь не дублируются: VERDICT_GLYPH берите из useLays, grainlineArrow —
// из piece-codes. Языка в них нет, а вторая копия символа — это второй шанс разойтись.

// ─────────────────────────────────────────────────────────────────────────────
// КАК ДЕТАЛЬ КРОИТСЯ (cut_symmetry) — печатные подписи.
//
// Формы «cut N …» — стандартная разметка кат-листов в швейном производстве: «cut 2 alike»,
// «cut 2 mirrored (1 pair)», «cut 1 on fold». Число в подписи — pieces_per_garment; сама
// symmetry по-прежнему НИЧЕГО не умножает (0266 свернула удвоение в pieces_per_garment).

const IDENTICAL = 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL';
const MIRRORED = 'TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED';
const FOLD = 'TECH_CARD_PIECE_CUT_SYMMETRY_FOLD';

/** Оговорка про неразмеченную парную деталь — вопрос цеху, а не факт про деталь. */
export const PRINT_CUT_SYMMETRY_UNANSWERED = 'pairing not specified — check before cutting';

// Нечётное или неизвестное количество сюда не доезжает (CHECK в БД + проверка формы), но если
// доехало — печатаем сам факт парности без выдуманной половины, как и русский оригинал.
function mirroredLabel(n: number): string {
  if (Number.isInteger(n) && n >= 2 && n % 2 === 0) {
    const pairs = n / 2;
    return `cut ${n} mirrored (${pairs} ${pairs === 1 ? 'pair' : 'pairs'})`;
  }
  return 'cut mirrored (pairs)';
}

/**
 * Печатный аналог экранного cutSymmetryBadge (piece-codes.ts) — та же семантика, тот же
 * контракт тонов, английская подпись. `identical` печатается, как и на экране: в наряде рядом
 * стоят строки одной детали в разных цветах, и молчание в одной из них читается как «а тут иначе».
 */
export function printCutSymmetryBadge(
  value: string | undefined,
  piecesPerGarment?: number,
): { label: string; tone: 'ink' | 'mut' | 'attention' } | null {
  const v = (value ?? '').trim();
  const n = piecesPerGarment ?? 0;
  if (isCutSymmetryMarked(v)) {
    if (v === IDENTICAL) return { label: n > 0 ? `cut ${n} alike` : 'cut alike', tone: 'mut' };
    if (v === MIRRORED) return { label: mirroredLabel(n), tone: 'ink' };
    if (v === FOLD) return { label: n > 0 ? `cut ${n} on fold` : 'cut on fold', tone: 'ink' };
    // Значение не из словаря печатается как есть: молча спрятать чужую разметку хуже, чем
    // показать сырую строку (тот же принцип терпимого чтения, что и в piece-codes).
    return { label: v, tone: 'ink' };
  }
  if (cutSymmetryUnanswered(v, piecesPerGarment)) {
    return { label: PRINT_CUT_SYMMETRY_UNANSWERED, tone: 'attention' };
  }
  return null;
}

/**
 * Печатный аналог cutSymmetryPrintCaption: подпись вплотную к количеству на изделие в тех-паке.
 * Отличие от бейджа то же, что у оригинала: `identical` не печатается вовсе — голое число под
 * колонкой «qty / garment» уже означает «одинаковые копии», лишнее слово было бы шумом.
 */
export function printCutSymmetryCaption(
  value: string | undefined,
  piecesPerGarment?: number,
): string {
  const v = (value ?? '').trim();
  const n = piecesPerGarment ?? 0;
  if (v === MIRRORED) return mirroredLabel(n);
  if (v === FOLD) return n > 0 ? `cut ${n} on fold` : 'cut on fold';
  if (v === IDENTICAL) return '';
  return cutSymmetryUnanswered(v, piecesPerGarment) ? PRINT_CUT_SYMMETRY_UNANSWERED : '';
}

/** Легенда словаря — печатается один раз под таблицей деталей, а не в каждой строке. */
export const PRINT_CUT_SYMMETRY_LEGEND =
  'mirrored — half of the panels are cut as mirror images (left / right), not as identical copies; on fold — the piece is cut on the fabric fold; "pairing not specified" — nobody has answered this question on the tech card yet, confirm before cutting.';

// ─────────────────────────────────────────────────────────────────────────────
// ВИДЫ ПОЗИЦИЙ BOM (kind, 0278) — английские отраслевые названия. Ключи обязаны совпадать с
// KIND_LABEL в bom-kind.ts: это тот же словарь, только языком фабрики.

export const PRINT_KIND_LABEL: Partial<Record<common_TechCardBomKind, string>> = {
  TECH_CARD_BOM_KIND_ZIPPER: 'zipper',
  TECH_CARD_BOM_KIND_ZIPPER_SLIDER: 'zipper slider',
  TECH_CARD_BOM_KIND_BUTTON: 'button',
  TECH_CARD_BOM_KIND_SNAP: 'snap fastener',
  TECH_CARD_BOM_KIND_RIVET: 'rivet',
  TECH_CARD_BOM_KIND_EYELET: 'eyelet',
  TECH_CARD_BOM_KIND_HOOK_AND_BAR: 'hook and bar',
  TECH_CARD_BOM_KIND_SNAP_HOOK: 'snap hook',
  TECH_CARD_BOM_KIND_BUCKLE: 'buckle / side-release buckle',
  TECH_CARD_BOM_KIND_STRAP_ADJUSTER: 'strap adjuster',
  TECH_CARD_BOM_KIND_RING: 'ring / D-ring',
  TECH_CARD_BOM_KIND_TOGGLE: 'toggle',
  TECH_CARD_BOM_KIND_CORD_STOPPER: 'cord lock',
  TECH_CARD_BOM_KIND_CORD_END: 'cord end',
  TECH_CARD_BOM_KIND_MAGNET: 'magnet',
  TECH_CARD_BOM_KIND_CHAIN: 'chain',
  TECH_CARD_BOM_KIND_ELASTIC: 'elastic',
  TECH_CARD_BOM_KIND_DRAWCORD: 'drawcord',
  TECH_CARD_BOM_KIND_BINDING: 'binding',
  TECH_CARD_BOM_KIND_TAPE: 'tape',
  TECH_CARD_BOM_KIND_PIPING: 'piping',
  TECH_CARD_BOM_KIND_WEBBING: 'webbing',
  TECH_CARD_BOM_KIND_HOOK_LOOP: 'hook-and-loop tape',
  TECH_CARD_BOM_KIND_BONING: 'boning / rigilene',
  TECH_CARD_BOM_KIND_LACE: 'lace',
  TECH_CARD_BOM_KIND_RIBBING: 'rib knit trim',
  TECH_CARD_BOM_KIND_PRINT: 'print',
  TECH_CARD_BOM_KIND_EMBROIDERY: 'embroidery',
  TECH_CARD_BOM_KIND_APPLIQUE: 'appliqué',
  TECH_CARD_BOM_KIND_PATCH: 'patch',
  TECH_CARD_BOM_KIND_HEAT_TRANSFER: 'heat transfer',
  TECH_CARD_BOM_KIND_RHINESTONE: 'rhinestones',
  TECH_CARD_BOM_KIND_SEQUIN: 'sequins',
  TECH_CARD_BOM_KIND_STUD: 'decorative stud',
  TECH_CARD_BOM_KIND_FOIL: 'foil',
  TECH_CARD_BOM_KIND_LASER: 'laser cut / engraving',
  TECH_CARD_BOM_KIND_SEWING_THREAD: 'sewing thread',
  TECH_CARD_BOM_KIND_TOPSTITCH_THREAD: 'topstitching thread',
  TECH_CARD_BOM_KIND_OVERLOCK_THREAD: 'overlock thread',
  TECH_CARD_BOM_KIND_BUTTONHOLE_THREAD: 'buttonhole thread',
  TECH_CARD_BOM_KIND_EMBROIDERY_THREAD: 'embroidery thread',
  TECH_CARD_BOM_KIND_ELASTIC_THREAD: 'elastic thread',
  TECH_CARD_BOM_KIND_POLYBAG: 'polybag',
  TECH_CARD_BOM_KIND_CARTON: 'carton',
  TECH_CARD_BOM_KIND_HANGER: 'hanger',
  TECH_CARD_BOM_KIND_HANGTAG_STRING: 'hangtag string',
  TECH_CARD_BOM_KIND_STICKER: 'sticker',
  TECH_CARD_BOM_KIND_TISSUE: 'tissue paper',
  TECH_CARD_BOM_KIND_DUST_BAG: 'dust bag',
  TECH_CARD_BOM_KIND_GARMENT_CASE: 'garment cover',
  TECH_CARD_BOM_KIND_INSERT_CARD: 'insert card',
  TECH_CARD_BOM_KIND_OTHER: 'other',
};

/** Печатный аналог kindLabel (bom-kind.ts): UNSET — не подпись, значение не из словаря — как есть. */
export const printKindLabel = (kind?: string): string | undefined =>
  kind && kind !== UNSET_KIND
    ? (PRINT_KIND_LABEL[kind as common_TechCardBomKind] ?? kind)
    : undefined;

// ─────────────────────────────────────────────────────────────────────────────
// ВЕРДИКТЫ ПОКРЫТИЯ (useLays.ts VERDICT_WORD) — словарь приёмки: pass / fail, «не проверено» —
// своя категория, а не «ок» и не «плохо» (см. шапку словаря в useLays.ts).

export const PRINT_LAY_VERDICT_WORD: Record<LayVerdict, string> = {
  ok: 'pass',
  warning: 'with caveats',
  blocker: 'fail',
  unknown: 'not checked',
};

export const printLayVerdictWord = (verdict: LayVerdict): string =>
  PRINT_LAY_VERDICT_WORD[verdict];

// ─────────────────────────────────────────────────────────────────────────────
// РЕЖИМЫ НАСТИЛА (lay-card.tsx LAY_MODE_LABEL).

export const PRINT_LAY_MODE_LABEL: Record<string, string> = {
  PRODUCTION_LAY_MODE_FACE_UP: 'face up',
  PRODUCTION_LAY_MODE_FACE_TO_FACE: 'face to face',
  PRODUCTION_LAY_MODE_UNSPECIFIED: 'mode not set',
};

// ─────────────────────────────────────────────────────────────────────────────
// ОБЩИЕ ПРАВИЛА ЧТЕНИЯ КАТ-ЛИСТА. Обе бумаги одной партии обязаны отвечать на вопрос «получен ли
// кат-лист» ОДНИМ выражением. Раньше их было два: наряд сравнивал с литералом ZERO_TS, тех-пак
// смотрел на префикс '0001-'. Сегодня protojson сериализует нулевой timestamp ровно как ZERO_TS и
// оба согласны, но любая смена формата (миллисекунды, оффсет) развела бы их в противоположные
// стороны: один объявил бы заглушку авторитетной, другой — нет.

const ZERO_TIMESTAMP_PREFIX = '0001-';

/**
 * Ответ кат-листа авторитетен, только если он назвал свой снимок. Пока бэкенд дописывают, шлюз
 * может ответить 200 и пустым телом — и тогда `rows: []` неотличимо от честного «в карте нет
 * деталей кроя». Разница огромна: первое значит «мы ничего не узнали», второе — «узнали, кроить
 * нечего», и напечатать первое как второе значит выдать несуществующий наряд за полный.
 */
export const cutPlanAuthoritative = (generatedAt?: string): boolean =>
  !!generatedAt && !generatedAt.startsWith(ZERO_TIMESTAMP_PREFIX);
