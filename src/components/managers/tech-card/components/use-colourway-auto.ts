import type {
  common_AdminColorwayRef,
  common_Color,
  common_Material,
  common_TechCardMarkerSummary,
  common_TechCardSlotAreaEstimate,
} from 'api/proto-http/admin';
import {
  materialCompositionCode,
} from 'components/managers/materials/components/material-code';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import {
  blankDraft,
  fromRead,
  MANUAL_PROVENANCE,
  toWire,
  type UsageDraft,
} from './colorway-usage-wire';
import { fullRollWidthOf, weightBasisOf } from './nesting/fabric-weight';
import {
  bomUnitKind,
  consumptionCm,
  decNum,
  markerNormProvenance,
  markersForLine,
  markersOfColorway,
  pieceSetChanged,
  scalarNormRefusal,
  toBomUnit,
} from './nesting/marker-io';
import type { Proposal } from './colourway-material-match';
import type { PieceRef } from './piece-picker';
import { wireInt } from './schema';

// ═══ АВТО-ЗАПОЛНЕНИЕ КОЛОРВЕЯ (COLOURWAYS-LITE D8) — ЧИСТЫЕ ФУНКЦИИ, БЕЗ ХУКОВ И БЕЗ ЭФФЕКТОВ ═══
//
// Прежде авто жило эффектом внутри редактора рецепта и срабатывало на открытии колорвея: просмотр
// вкладки сам ставил правки в очередь сохранения. В матрице открыты ВСЕ колорвеи сразу, и тот же
// эффект застейджил бы каждый из них. Поэтому здесь только план (`planAuto`) и его применение к
// списку строк (`applyPlanToUsages`); применяет их кнопка `auto · N` или рождение колорвея копией.
// Просмотр не пишет ничего.

// Measured sections cost by a rate (consumption, per metre/gram) and support per-size grading; the
// rest are counted (quantity, per piece).
export const MEASURED_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
  'TECH_CARD_BOM_SECTION_THREAD',
  'TECH_CARD_BOM_SECTION_TRIM',
]);

// РУЛОННЫЕ секции: набор дословно совпадает с ROLL_GOODS_SECTIONS сервера (копии в bom-purpose.ts и
// piece-layer-role.ts). Только у них бывают детали, раскладки и оценка по площади.
export const PIECE_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
]);

// СЕКЦИИ, КОТОРЫЕ ЗАВОДЯТСЯ В РЕЦЕПТ — ряды матрицы. Упаковка и этикетка в рецепт не заводятся.
export const GARMENT_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
  'TECH_CARD_BOM_SECTION_THREAD',
  'TECH_CARD_BOM_SECTION_HARDWARE',
  'TECH_CARD_BOM_SECTION_TRIM',
  'TECH_CARD_BOM_SECTION_DECORATION',
]);

export type BomLine = {
  id?: number;
  lineKey?: string;
  name?: string;
  section?: string;
  // НАЗНАЧЕНИЕ строки (0265) — вход производной РОЛИ СЛОЯ детали (piece-layer-role.ts).
  purpose?: string;
  unit?: string;
  unitPrice?: string; // decimal string
  currency?: string;
  wastagePercent?: string; // decimal string
  fabricWidth?: string; // decimal string, cm — this LINE's own cloth ROLL width, if it sets one
  // Read-only enrichment off the card read (0259): effectiveFabricWidthCm is
  // COALESCE(this line's width, the linked article's), selvedgeCm is that article's кромка per edge.
  // Cutting width = roll − 2×selvedge, and that is what a marker is laid on.
  effectiveFabricWidthCm?: string;
  selvedgeCm?: string;
  // structured { part: [{ code, percent }] } JSON on catalog-linked / picker-authored lines, free
  // text only on legacy rows — read it through parseCompositionCode, never with a bare regex.
  composition?: string;
  materialId?: number;
  // the linked catalog material (resolved from ListMaterials by materialId).
  material?: common_Material;
};

export type RecipePiece = PieceRef & { id: number };
export type IndexedUsage = { draft: UsageDraft; index: number };
export type SlotRows = { garment: IndexedUsage[]; pieces: IndexedUsage[] };

export function measured(section?: string): boolean {
  return !section || MEASURED_SECTIONS.has(section);
}

export function hasValue(d?: UsageDraft): boolean {
  return (
    !!d &&
    (!!d.consumption.trim() ||
      !!d.quantity.trim() ||
      d.sizeConsumptions.some((x) => (x.consumption ?? '').trim() !== ''))
  );
}

// The width a раскладка for this usage would actually be laid on: the effective article's roll
// width minus its кромка on both edges (0259). The pinned material wins over the slot — a
// colourway pin can be a different cloth. '' when no width is known at all.
//   pinned — the colourway named a DIFFERENT cloth, so BOTH numbers come from it;
//   else   — the linked article's кромка, which is what selvedgeCm already is (0259).
export function cuttingWidthOf(material?: common_Material, slot?: BomLine, pinned = false): string {
  const rollRaw = fullRollWidthOf(material, slot, pinned);
  const selvedgeRaw = pinned
    ? material?.fabricAttrs?.selvedgeCm?.value || ''
    : slot?.selvedgeCm || '';
  const roll = parseDecimalNumber(rollRaw);
  if (!Number.isFinite(roll) || roll <= 0) return '';
  const sv = parseDecimalNumber(selvedgeRaw);
  const cut = roll - 2 * (Number.isFinite(sv) && sv > 0 ? sv : 0);
  return cut > 0 ? String(Math.round(cut * 100) / 100) : '';
}

export function effectiveMaterialId(draft: UsageDraft, slot?: BomLine): number {
  return draft.materialId || slot?.materialId || 0;
}

export function effectiveMaterial(
  draft: UsageDraft,
  slot: BomLine | undefined,
  materials: common_Material[],
): common_Material | undefined {
  const id = effectiveMaterialId(draft, slot);
  return id ? materials.find((m) => wireInt(m.id) === id) : undefined;
}

// Cost/composition previews must follow the effective concrete article, not the slot's default
// snapshot. Costing-gated price data can be absent; in that case the server remains authoritative.
export function articleForUsage(
  slot: BomLine | undefined,
  material: common_Material | undefined,
  materialId: number,
): BomLine | undefined {
  if (!slot) return undefined;
  if (!material) {
    const pinnedOutsideCatalog = materialId > 0 && materialId !== slot.materialId;
    return {
      ...slot,
      material: undefined,
      unitPrice: pinnedOutsideCatalog ? '' : slot.unitPrice,
      currency: pinnedOutsideCatalog ? '' : slot.currency,
      composition: pinnedOutsideCatalog ? '' : slot.composition,
    };
  }
  const isDefault = wireInt(material.id) === slot.materialId;
  return {
    ...slot,
    material,
    materialId: wireInt(material.id),
    unit: material.unit?.trim() || slot.unit,
    unitPrice: decimalToInput(material.latestPrice?.price) || (isDefault ? slot.unitPrice : ''),
    currency: material.latestPrice?.currency || (isDefault ? slot.currency : ''),
    composition: materialCompositionCode(material) || (isDefault ? slot.composition : ''),
  };
}

// ЭФФЕКТИВНЫЙ АРТИКУЛ СТРОКИ И ВСЁ, ЧТО ИЗ НЕГО СЛЕДУЕТ — ОДНОЙ ФУНКЦИЕЙ: плитка (имя, фото, цвет),
// норма (ширина, основа веса) и предупреждения обязаны описывать одну и ту же ткань.
export function resolveSlotArticle(draft: UsageDraft, slot: BomLine, materials: common_Material[]) {
  const material = effectiveMaterial(draft, slot, materials);
  const materialId = effectiveMaterialId(draft, slot);
  // "Pinned" = пин на ДРУГОЙ артикул, чем у слота: пин обратно на свой же артикул — та же ткань.
  const pinnedDifferent = isPinned(draft, slot);
  return {
    material,
    materialId,
    pinnedDifferent,
    // ОСНОВА ВЕСА кг-слота (Ф3) и РАСКРОЙНАЯ ширина считаются здесь и только здесь.
    weightBasis: weightBasisOf(material, slot, pinnedDifferent),
    articleWidth: cuttingWidthOf(material, slot, pinnedDifferent),
    article: articleForUsage(slot, material, materialId),
  };
}

// ПИН РАВНЫЙ АРТИКУЛУ СЛОТА — ЭТО НЕ ПИН. Всюду, где спрашивается «стоит ли пин», спрашивается
// эффективное неравенство, а не истинность materialId.
export function isPinned(draft: UsageDraft, slot?: BomLine): boolean {
  return draft.materialId > 0 && draft.materialId !== (slot?.materialId ?? 0);
}

// Канон строки: пин на артикул самого слота хранится как 0 (inherit) — при чтении и перед записью.
export function canonicalUsage(u: UsageDraft, slot?: BomLine): UsageDraft {
  return slot && u.materialId > 0 && u.materialId === (slot.materialId ?? 0)
    ? { ...u, materialId: 0 }
    : u;
}

export const slotDraft = (rows: SlotRows | undefined, key: string): UsageDraft =>
  rows?.garment[0]?.draft ?? { ...blankDraft('', ''), bomLineKey: key };

// ПИН АРТИКУЛА КАК ПАТЧ СТРОКИ. Выбор артикула самого слота — это «пина нет» (0 = inherit).
//
// СМЕНА ПИНА НА КГ-СЛОТЕ СНИМАЕТ ЧИСЛО НОРМЫ (и провенанс вместе с ним). Кг-норма ЗАКОДИРОВАЛА в
// себе основу веса КОНКРЕТНОГО артикула (полная ширина × плотность, toBomUnit): маркер 2 м на
// артикуле 150 см × 200 г/м² записан как 0.6 кг, и после пина на 180 см × 250 г/м² строка
// продолжала бы обещать 0.6 при правильных 0.9. На слотах в метрах число НЕ трогается: длина от
// артикула не зависит. Сравниваются ЭФФЕКТИВНЫЕ артикулы.
//
// НИ В КОЕМ СЛУЧАЕ не «сбросить провенанс, оставив число»: марочное число содержит отходы ВНУТРИ,
// и, став manual, оно получило бы сверху процент раскроя слота — двойной учёт.
export function pinPatch(
  draft: UsageDraft,
  slot: BomLine,
  nextMaterialId: number,
): Partial<UsageDraft> {
  const next = nextMaterialId > 0 && nextMaterialId === (slot.materialId ?? 0) ? 0 : nextMaterialId;
  const patch: Partial<UsageDraft> = { materialId: next };
  const before = draft.materialId || slot.materialId || 0;
  const after = next || slot.materialId || 0;
  if (bomUnitKind(slot.unit?.trim() || '') === 'kg' && before !== after) {
    patch.consumption = '';
    patch.sizeConsumptions = [];
    Object.assign(patch, MANUAL_PROVENANCE);
  }
  return patch;
}

// ПАТЧ ПО СЛОТУ, А НЕ ПО ИНДЕКСУ, И БЕЗ ХОЛОСТЫХ СТРОК. index < 0 значит «найди строку изделия этого
// слота или заведи её»; строка рождается только если патч что-то меняет относительно пустой.
export function patchSlotRows(
  prev: UsageDraft[],
  bomLineKey: string,
  index: number,
  patch: Partial<UsageDraft>,
): UsageDraft[] {
  if (!bomLineKey) return prev;
  const at =
    index >= 0 ? index : prev.findIndex((u) => !u.pieceLineKey && u.bomLineKey === bomLineKey);
  if (at >= 0) return prev.map((u, i) => (i === at ? { ...u, ...patch } : u));
  const blank = { ...blankDraft('', ''), bomLineKey };
  const born = { ...blank, ...patch };
  if (JSON.stringify(born) === JSON.stringify(blank)) return prev;
  return [...prev, born];
}

// The write is a FULL REPLACE, identity is the durable pair (piece_line_key || '', bom_line_key).
export function usageKey(u: Pick<UsageDraft, 'pieceLineKey' | 'bomLineKey'>): string {
  return `${u.pieceLineKey || ''}\u0000${u.bomLineKey}`;
}

// ДУБЛИ СЧИТАЮТСЯ ПОШТУЧНО, А НЕ СХЛОПЫВАЮТСЯ В КЛЮЧ: сервер их СУММИРУЕТ, так что каждая влияет на
// деньги и обязана считаться отдельно. Сравнение внутри одного ключа — ПОЗИЦИОННОЕ.
export function changedLines(base: UsageDraft[], next: UsageDraft[]): number {
  const group = (rows: UsageDraft[]) => {
    const m = new Map<string, string[]>();
    for (const u of rows) {
      const k = usageKey(u);
      const list = m.get(k) ?? [];
      list.push(JSON.stringify(toWire(u)));
      m.set(k, list);
    }
    return m;
  };
  const before = group(base);
  const after = group(next);
  let n = 0;
  for (const [k, list] of after) {
    const prev = before.get(k) ?? [];
    for (let i = 0; i < list.length; i += 1) if (prev[i] !== list[i]) n += 1;
    if (prev.length > list.length) n += prev.length - list.length;
  }
  for (const [k, prev] of before) if (!after.has(k)) n += prev.length;
  return n;
}

// Строки рецепта, сгруппированные ПО СЛОТУ. Данные не меняются: строка изделия — пустой
// pieceLineKey, строка детали — непустой; сироты (деталь удалена) и строки без слота сюда не входят.
export function groupRowsBySlot(
  usages: UsageDraft[],
  pieceKeySet: ReadonlySet<string>,
): Map<string, SlotRows> {
  const m = new Map<string, SlotRows>();
  usages.forEach((draft, index) => {
    if (!draft.bomLineKey) return;
    if (draft.pieceLineKey && !pieceKeySet.has(draft.pieceLineKey)) return;
    const e = m.get(draft.bomLineKey) ?? { garment: [], pieces: [] };
    (draft.pieceLineKey ? e.pieces : e.garment).push({ draft, index });
    m.set(draft.bomLineKey, e);
  });
  return m;
}

// ── СЕМЕЙСТВО АРТИКУЛА И ЦВЕТ ──────────────────────────────────────────────────────────────────
//
// АВТО НЕ ИМЕЕТ ПРАВА ПОСТАВИТЬ ЧУЖОЙ АРТИКУЛ. Поэтому семейство — это НАСТОЯЩИЙ различитель, а не
// «тот же поставщик и класс»: у материала с кодом это код без цветового сегмента; без кода — тот же
// поставщик плюс то же название с вырезанными словами цвета. Пустой ответ = семейство не выводится,
// и такой материал авто не пинит никогда.

const lc = (s?: string) => (s ?? '').trim().toLowerCase();

// Слова цвета материала, по которым режется код или название: само слово цвета целиком, каждое его
// слово, трёхбуквенное сокращение (так цвет пишется в составленном коде, composeArticle) и пантон.
function colourWordsOf(m: common_Material): Set<string> {
  const out = new Set<string>();
  const colour = lc(m.color);
  if (colour) {
    out.add(colour.replace(/[^\p{L}\p{N}]/gu, ''));
    for (const w of colour.split(/[^\p{L}\p{N}]+/u)) if (w) out.add(w);
    const ab = colour.replace(/[^\p{L}]/gu, '').slice(0, 3);
    if (ab) out.add(ab);
  }
  const pan = canonicalPantone(m.pantone);
  if (pan) out.add(pan);
  return out;
}

export function articleFamily(m: common_Material): string {
  const words = colourWordsOf(m);
  const code = lc(m.code);
  if (code) {
    // Пантон в коде режется целиком ДО разбиения: «19-4005» иначе распался бы на два сегмента.
    let rest = code;
    for (const raw of [lc(m.pantone), lc(m.color)]) if (raw) rest = rest.split(raw).join(' ');
    const segs = rest
      .split(/[·|/_\-\s.,]+/u)
      .filter((x) => x && !words.has(x) && !words.has(canonicalPantone(x)));
    return segs.length > 0 ? `code:${segs.join('·')}` : '';
  }
  const supplier = lc(m.supplier);
  const name = lc(m.name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !words.has(w))
    .join(' ');
  return supplier && name ? `name:${supplier}|${name}` : '';
}

// Пантон канонически: регистр, всё кроме букв и цифр, хвост системы книги (TCX/TPX/TPG/TPM/C/U).
// Без цифры это не код, а слово («black») — такой «пантон» каналом пантона не считается.
function canonicalPantone(s?: string): string {
  const t = lc(s)
    .replace(/^pantone/, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/(tcx|tpx|tpg|tpm|c|u)$/, '');
  return /\d/.test(t) ? t : '';
}

function canonicalHex(s?: string): string {
  const t = lc(s).replace(/^#/, '');
  return /^[0-9a-f]{6}$/.test(t) ? t : '';
}

// Название цвета целиком: регистр и пробелы. Общее слово («dark», «blue») совпадением НЕ считается.
function canonicalLabel(s?: string): string {
  return lc(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Ключи цвета по каналам. Совпадение — равенство внутри ОДНОГО канала, никогда не общее слово. */
export type ColourKeys = { pantone: Set<string>; hex: Set<string>; label: Set<string> };

function keysOf(
  pantones: (string | undefined)[],
  hexes: (string | undefined)[],
  labels: (string | undefined)[],
): ColourKeys {
  const pick = (xs: (string | undefined)[], f: (s?: string) => string) =>
    new Set(xs.map(f).filter(Boolean));
  return {
    pantone: pick(pantones, canonicalPantone),
    hex: pick(hexes, canonicalHex),
    label: pick(labels, canonicalLabel),
  };
}

export function colourTokens(
  cw: common_AdminColorwayRef,
  colours?: readonly common_Color[],
): ColourKeys {
  const main = cw.colours?.[0];
  const dict = (colours ?? []).find((c) => c.code && c.code === cw.colorCode);
  return keysOf(
    [cw.pantone, main?.pantone],
    [main?.hex, cw.devHex, dict?.hex],
    [cw.devName, main?.label, dict?.name],
  );
}

// У материала каталога нет поля hex: «цвет» бывает словом, пантоном или «#RRGGBB», и каждый
// канал отберёт своё (canonicalPantone требует цифру, canonicalHex — ровно шесть hex-знаков).
export function materialTokens(m: common_Material): ColourKeys {
  return keysOf([m.pantone, m.color], [m.color], [m.color]);
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

export function coloursMatch(a: ColourKeys, b: ColourKeys): boolean {
  return intersects(a.pantone, b.pantone) || intersects(a.hex, b.hex) || intersects(a.label, b.label);
}

const emptyKeys = (k: ColourKeys) => k.pantone.size + k.hex.size + k.label.size === 0;

// ── ПЛАН ───────────────────────────────────────────────────────────────────────────────────────

export type AutoPlan = {
  /** Сколько ячеек заполнит кнопка: пины + нормы. АВТО трогает только артикулы и нормы. */
  n: number;
  pins: { key: string; patch: Partial<UsageDraft> }[];
  norms: { key: string; patch: Partial<UsageDraft> }[];
  /** Слоты, где каталог дал несколько артикулов в цвет колорвея: решает человек. `candidates` —
   *  materialId кандидатов, лучшие первыми (не больше 3): пикер ставит их первыми. */
  ambiguous: { key: string; count: number; candidates?: number[] }[];
  /** ВСЕГДА пусто: авто детали не заводит (Codex #5). Поле живёт, пока его читает матрица. */
  pieceAdds: readonly UsageDraft[];
};

export const EMPTY_PLAN: AutoPlan = { n: 0, pins: [], norms: [], ambiguous: [], pieceAdds: [] };

export function planAuto({
  colorway,
  cardSlots,
  rowsBySlot,
  materials,
  markers,
  otherColorways,
  bomItems,
  pieces,
  colours,
  proposals,
}: {
  colorway: common_AdminColorwayRef;
  cardSlots: BomLine[];
  rowsBySlot: Map<string, SlotRows>;
  materials: common_Material[];
  markers?: common_TechCardMarkerSummary[];
  /** Остальные ЖИВЫЕ колорвеи карточки — их СОХРАНЁННЫЕ рецепты (ступень «соседний колорвей»). */
  otherColorways: readonly common_AdminColorwayRef[];
  bomItems: BomLine[];
  pieces: RecipePiece[];
  /** Не используется для записи (оценка по площадям — не норма). Оставлено ради вызывающих. */
  estimateBySlot?: Map<string, common_TechCardSlotAreaEstimate>;
  colours?: readonly common_Color[];
  /** Не используется: авто детали не заводит. Оставлено ради вызывающих. */
  derivedPieces?: ReadonlyMap<string, readonly string[]>;
  /** Предложения матчера (colourway-material-match.ts `proposePins`) — ступень после нашей точной. */
  proposals?: readonly Proposal[];
}): AutoPlan {
  const colorwayId = colorway.colorwayId ?? 0;
  if (!colorwayId) return EMPTY_PLAN;
  const cwMarkers = markersOfColorway(markers, colorwayId);
  const cwTokens = colourTokens(colorway, colours);
  const siblingsSaved = otherColorways.map((cw) =>
    (cw.usages ?? []).map((u) => fromRead(u, bomItems, pieces)),
  );

  const pins: AutoPlan['pins'] = [];
  const norms: AutoPlan['norms'] = [];
  const ambiguous: AutoPlan['ambiguous'] = [];

  for (const slot of cardSlots) {
    const key = slot.lineKey ?? '';
    if (!key) continue;
    const rows = rowsBySlot.get(key);
    const garment = rows?.garment ?? [];
    let draft = slotDraft(rows, key);

    // 1. АРТИКУЛ: пина нет, у слота есть артикул BOM, и в каталоге ровно один артикул того же
    //    семейства и той же секции в цвет колорвея. Сам артикул BOM в цвет — пинить нечего.
    //    Кг-слот с уже стоящим числом не пинится: пин снял бы число (pinPatch), а авто не трогает
    //    того, что вписано (скаляр ИЛИ любое число по размеру). Семейство без различителя (нет
    //    кода, нет поставщика или названия) и колорвей без ключей цвета — не пинятся вовсе.
    const kgWithValue = bomUnitKind(slot.unit?.trim() || '') === 'kg' && hasValue(draft);
    const family = slot.material ? articleFamily(slot.material) : '';
    let oursDecided = false;
    if (!isPinned(draft, slot) && family && !emptyKeys(cwTokens) && !kgWithValue) {
      const matches = materials.filter(
        (m) =>
          !m.archived &&
          m.section === slot.section &&
          articleFamily(m) === family &&
          coloursMatch(materialTokens(m), cwTokens),
      );
      const defaultMatches = matches.some((m) => wireInt(m.id) === slot.materialId);
      if (defaultMatches) {
        oursDecided = true;
      } else if (matches.length === 1) {
        const patch = pinPatch(draft, slot, wireInt(matches[0].id));
        pins.push({ key, patch });
        draft = { ...draft, ...patch };
        oursDecided = true;
      } else if (matches.length > 1) {
        // Кандидаты: свои точные + предложения матчера, только живые валидные (есть в каталоге,
        // не в архиве, секция ЖИВОГО слота; предложение — ещё и того же семейства). Порядок — балл
        // матчера по убыванию, равный балл или без балла — по имени. `count` — до среза.
        const scoreOf = new Map<number, number>();
        for (const p of proposals ?? []) {
          if (p.lineKey !== key) continue;
          scoreOf.set(p.materialId, Math.max(scoreOf.get(p.materialId) ?? -1, p.score));
        }
        const native = new Set(matches.map((m) => wireInt(m.id)));
        const valid = [...new Set([...native, ...scoreOf.keys()])]
          .map((id) => materials.find((m) => wireInt(m.id) === id))
          .filter(
            (m): m is common_Material =>
              !!m &&
              !m.archived &&
              m.section === slot.section &&
              (native.has(wireInt(m.id)) || articleFamily(m) === family),
          );
        valid.sort((a, b) => {
          const sa = scoreOf.get(wireInt(a.id)) ?? -1;
          const sb = scoreOf.get(wireInt(b.id)) ?? -1;
          if (sa !== sb) return sb - sa;
          return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
        });
        ambiguous.push({
          key,
          count: valid.length,
          candidates: valid.slice(0, 3).map((m) => wireInt(m.id)),
        });
        oursDecided = true;
      }
    }

    // 1b. МАТЧЕР: наша точная ничего не нашла. Его `exact` шире нашего (цвет + секция), поэтому
    //     пин — только при том же непустом семействе, что у артикула слота. Остальное — человеку:
    //     `pick one of N` с кандидатами в пикере. Не-exact не пинится никогда.
    const slotProposals =
      !oursDecided && !isPinned(draft, slot) && !kgWithValue && proposals
        ? proposals.filter((p) => p.lineKey === key && p.materialId > 0)
        : [];
    if (slotProposals.length > 0) {
      const exact = slotProposals.find((p) => p.exact);
      const exactMaterial = exact
        ? materials.find((m) => wireInt(m.id) === exact.materialId && !m.archived)
        : undefined;
      // Секция — ЖИВОГО слота формы: матчер читает сохранённый BOM, и после несохранённой смены
      // секции артикул старой секции того же семейства иначе пинился бы.
      if (
        exact &&
        exactMaterial &&
        exactMaterial.section === slot.section &&
        family &&
        articleFamily(exactMaterial) === family
      ) {
        const patch = pinPatch(draft, slot, exact.materialId);
        pins.push({ key, patch });
        draft = { ...draft, ...patch };
      } else {
        // Подсказки пикеру, не пины: другое семейство в близкий цвет допустимо. Фильтр один —
        // артикул жив и в секции ЖИВОГО слота. Балл по убыванию, затем имя; count — до среза.
        const scoreOf = new Map<number, number>();
        for (const p of slotProposals) {
          scoreOf.set(p.materialId, Math.max(scoreOf.get(p.materialId) ?? -1, p.score));
        }
        const valid = [...scoreOf.keys()]
          .map((id) => materials.find((m) => wireInt(m.id) === id))
          .filter((m): m is common_Material => !!m && !m.archived && m.section === slot.section);
        valid.sort((a, b) => {
          const d = (scoreOf.get(wireInt(b.id)) ?? -1) - (scoreOf.get(wireInt(a.id)) ?? -1);
          if (d !== 0) return d;
          return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
        });
        if (valid.length > 0) {
          ambiguous.push({
            key,
            count: valid.length,
            candidates: valid.slice(0, 3).map((m) => wireInt(m.id)),
          });
        }
      }
    }

    // 2. НОРМА: у слота нет ни числа, ни второй строки. Лестница: назначенная норма-раскладка →
    //    тот же слот в соседнем колорвее с тем же артикулом. Больше источников нет: оценка по
    //    площадям (areaEstimates.perGarment) — СРЕДНЯЯ ПО СТИЛЮ НЕТТО-НИЖНЯЯ ГРАНИЦА, и по контракту
    //    прото нормой рецепта она не становится никогда. Нет источника — нет нормы: ячейка говорит
    //    `no norm`, DXF человек прикладывает сам через проверенный диалог по размерам под числом.
    if (garment.length <= 1 && !hasValue(draft) && effectiveMaterialId(draft, slot) > 0) {
      const unit = slot.unit?.trim() || '';
      let patch: Partial<UsageDraft> | null = null;

      // (a) ровно одна норма-раскладка этого колорвея на слот, её скаляр, ширина совпадает, набор
      //     деталей не менялся. Каталог ещё не приехал — ширины нет, сверять не с чем: пропуск.
      const lineNorms = markersForLine(cwMarkers, key).filter((m) => m.isNorm === true);
      if (lineNorms.length === 1 && materials.length > 0) {
        const norm = lineNorms[0];
        const { articleWidth, weightBasis } = resolveSlotArticle(draft, slot, materials);
        const cm = scalarNormRefusal(norm) ? null : consumptionCm(norm);
        const conv =
          cm != null ? toBomUnit(cm, unit, weightBasis.ok ? weightBasis.basis : undefined) : null;
        const artW = parseDecimalNumber(articleWidth);
        const normW = decNum(norm.fabricWidthCm);
        const widthOff =
          Number.isFinite(artW) && artW > 0 && normW > 0 && Math.abs(artW - normW) > 0.5;
        if (conv && conv.value > 0 && !widthOff && !pieceSetChanged(norm)) {
          patch = {
            consumption: String(conv.value),
            sizeConsumptions: [],
            ...markerNormProvenance([norm], norm.id ?? 0),
          };
        }
      }

      // (b) тот же слот в соседнем колорвее, тот же эффективный артикул, число есть — копия как есть.
      if (!patch) {
        const ownId = effectiveMaterialId(draft, slot);
        for (const saved of siblingsSaved) {
          const s = saved.find((u) => !u.pieceLineKey && u.bomLineKey === key);
          if (!s || !hasValue(s) || effectiveMaterialId(s, slot) !== ownId) continue;
          patch = {
            consumption: s.consumption,
            quantity: s.quantity,
            sizeConsumptions: s.sizeConsumptions.map((x) => ({ ...x })),
            consumptionSource: s.consumptionSource,
            wasteSelvedgePct: s.wasteSelvedgePct,
            wasteCutPct: s.wasteCutPct,
            normMarkerId: s.normMarkerId,
          };
          break;
        }
      }

      if (patch) norms.push({ key, patch });
    }
  }
  return { n: pins.length + norms.length, pins, norms, ambiguous, pieceAdds: [] };
}

/** План, приложенный к списку строк: сначала пины, потом нормы. Детали авто не заводит. */
export function applyPlanToUsages(prev: UsageDraft[], plan: AutoPlan): UsageDraft[] {
  let next = prev;
  for (const { key, patch } of plan.pins) next = patchSlotRows(next, key, -1, patch);
  for (const { key, patch } of plan.norms) next = patchSlotRows(next, key, -1, patch);
  return next;
}
