// Adapters between the nesting run (lib/nesting/types) and the persisted tech-card marker
// (common_TechCardMarker*). Main-thread-safe: imports only types.ts and generated API types,
// so it may live in the lazy nesting chunk AND be imported by costing/recipe code without
// dragging dxf-parser/clipper into the main bundle.
import type {
  common_TechCardMarker,
  common_TechCardMarkerLayout,
  common_TechCardMarkerSummary,
  googletype_Decimal,
} from 'api/proto-http/admin';
import type { NestConfig, NestResult, PieceDTO, RotationDeg, Unit } from 'lib/nesting/types';

// The BOM fabric line as the marker features need it — a projection of the card form's
// bomItems rows (strings exactly as the form holds them). `id` is the server PK: 0 means
// the row was added in the UI but the card was never saved — the backend cannot resolve
// its line_key yet, so a marker must not link to it.
export type MarkerBomLine = {
  id: number;
  lineKey: string;
  name: string;
  unit: string;
  fabricWidth: string;
  wastagePercent: string;
  // READ-ONLY enrichment from the card read (0259). effectiveFabricWidthCm is the FULL roll
  // width to prefill; selvedgeCm is the кромка per edge, snapshotted onto the marker so the
  // waste decomposition stays auditable after the material changes. '' = unknown.
  effectiveFabricWidthCm: string;
  selvedgeCm: string;
  // The BOM family this line belongs to, as a word the operator reads («подкладка»). '' when the
  // caller does not classify. Load-bearing rather than decorative: since a раскладка binds to any
  // roll-goods line, one card can hold «Cupro 90» as lining AND as pocket-bag cloth, and a select
  // showing the article name alone offers two identical options — while THIS select is the one
  // that decides which BOM line the measured length lands on.
  role?: string;
  // Что нужно, чтобы ответить «какое полотно судит раскладку на ЭТОЙ строке» — то есть чтобы
  // позвать markerScopeDirection (bom-purpose.ts, копия серверного MarkerFabricScope). Направление
  // нельзя взять с одной строки: назначение владеет несколькими артикулами и строгое побеждает, а
  // семпловая ярдажа в скоуп не входит вовсе. Раньше эти три поля в модалку не доезжали, и она
  // показывала направление, посчитанное ОДИН РАЗ на старте по группе DXF, — тогда как сохранить
  // оператор может на любую тканевую строку карточки, и скоуп у неё другой.
  purpose?: string;
  fabricDirection?: string;
  isSample?: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// Newest-first comparator shared by every «latest marker» pick — one clock, one rule
// (whole-second RFC3339 strings compare fine lexicographically; localeCompare keeps
// same-second ties deterministic).
export function newerMarker(
  a: common_TechCardMarkerSummary,
  b: common_TechCardMarkerSummary,
): number {
  return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
}

// Meaningful download name: SEASON-STYLE-размер-ткань-маркер.ext, empty segments omitted,
// path-hostile characters replaced. Cyrillic is kept as-is (владелец: не транслитерировать).
export function exportFileName(parts: Array<string | undefined>, ext: string): string {
  const clean = parts
    .map((p) => (p ?? '').trim().replace(/\.(dxf|pdf|svg)$/i, ''))
    .filter(Boolean)
    .map((p) => p.replace(/[\\/:*?"<>|#%\s]+/g, ' ').trim().replace(/\s+/g, '_'));
  return `${clean.join('-') || 'раскладка'}.${ext}`;
}

// google.type.Decimal encode/decode for marker figures (2 decimals is the storage scale).
export function dec(n: number): googletype_Decimal {
  return { value: String(r2(n)) };
}
export function decNum(d?: googletype_Decimal): number {
  const n = Number(d?.value ?? '');
  return Number.isFinite(n) ? n : 0;
}

// ── СОСТАВ раскладки (Ф2) ───────────────────────────────────────────────────────────────
//
// Маркер перестал быть «один размер × N комплектов» и стал СОСТАВОМ: размер → сколько ИЗДЕЛИЙ
// этого размера выкраивает один настил. Смешанный состав ложится плотнее однородного — мелкие
// детали одного размера садятся в межлекальные выпады другого, — и «размер + комплекты» такую
// раскладку выразить не мог вовсе.
//
// ЧИТАТЬ СОСТАВ РАЗРЕШЕНО ТОЛЬКО ЗДЕСЬ, и ветвится это чтение ПО ПОЛЮ, а не по номеру схемы.
// Версия блоба существует ради двух совсем других решений (подделка `flipped` и дедовщина
// направления ткани), и читатель, который переключался бы по ней, обязан был бы знать про версии,
// которых он больше никогда не увидит. Легаси-маркер — это тот, у кого в шапке лежит пара
// (size_id, sets) и нет состава; он читается как состав из одной строки, и вся остальная логика
// перестаёт различать эти два случая.
export type MarkerCompositionEntry = { sizeId: number; quantity: number };

// Состав как СПИСОК, отсортированный по size_id — тем же порядком, что канонизирует сервер
// (entity.SortMarkerComposition). Пустой список означает ровно «состав неизвестен» и никогда не
// «раскладка без состава»: состав есть у каждой раскладки, включая снятые до Ф2 (миграция 0273
// спроецировала легаси-строки в ту же форму). Пустота здесь — испорченная строка либо
// оптимистичный объект, ещё не съездивший на сервер, и оба обязаны читаться как НЕИЗВЕСТНО.
export function compositionOf(s: common_TechCardMarkerSummary): MarkerCompositionEntry[] {
  const wire = s.composition ?? [];
  if (wire.length > 0) {
    return wire
      .map((c) => ({ sizeId: Number(c.sizeId ?? 0), quantity: Number(c.quantity ?? 0) }))
      .filter((c) => c.sizeId > 0 && c.quantity > 0)
      .sort((a, b) => a.sizeId - b.sizeId);
  }
  // ЛЕГАСИ. Пара живёт в шапке до Ф2 и приезжает нулями на маркере с составом (proto3 не шлёт
  // умолчания), поэтому проверяются ОБА поля: «size_id есть, sets нет» — это не «один комплект»,
  // а неполные данные, и придумывать здесь единицу значит завысить норму на изделие во столько
  // раз, сколько изделий в настиле.
  const sizeId = Number(s.sizeId ?? 0);
  const sets = Number(s.sets ?? 0);
  if (sizeId > 0 && sets >= 1) return [{ sizeId, quantity: sets }];
  return [];
}

// Сколько ИЗДЕЛИЙ (не деталей!) выкраивает раскладка — делитель под расходом на единицу.
// 0 = неизвестно; арифметического умолчания у этого числа нет и быть не может.
//
// СНАЧАЛА СУММА СОСТАВА, и только потом wire-поле. Отказ (scalarNormRefusal) читает состав, и
// если бы делитель предпочитал totalUnits из шапки, испорченная строка могла бы описывать ДВЕ
// разные раскладки разом: состав говорит «3 изделия», шапка — «9», отказа нет, а расход посчитан
// не тем делителем. Сервер выводит оба числа из одного среза именно затем, чтобы они не могли
// разойтись, — читатель обязан сохранить эту связку, а не переоткрыть её.
export function totalUnitsOf(s: common_TechCardMarkerSummary): number {
  const sum = compositionOf(s).reduce((n, c) => n + c.quantity, 0);
  if (sum > 0) return sum;
  return Number(s.totalUnits ?? 0);
}

// ЛЕГАСИ-ПАРА (size_id, sets) ПОД СОСТАВ — то, что уезжает в ШАПКУ сохранения. Однородный состав
// и пара — один факт в двух кодировках, и сервер (dto.markerCompositionOfInsert) берёт пару только
// когда состава в блобе нет; смешанный шлёт нули, и это правильно — отдельного поля на вставке
// нет намеренно. Функция существует, чтобы это решение жило в одном месте и ПРОВЕРЯЛОСЬ зондом:
// пока пара собиралась выражением в модалке, её регресс (sets: 1 на смешанном) зонд поймать не мог.
export function legacyPairOf(composition: readonly MarkerCompositionEntry[]): {
  sizeId: number;
  sets: number;
} {
  if (composition.length === 1) return { sizeId: composition[0].sizeId, sets: composition[0].quantity };
  return { sizeId: 0, sets: 0 };
}

// ОТКАЗ ВЫДАТЬ СКАЛЯРНУЮ НОРМУ. '' = расход на изделие можно применять в рецепт; непустая
// строка — объяснение, которое обязано появиться ТАМ, ГДЕ СТОЯЛО БЫ ЧИСЛО.
//
// Слово принадлежит серверу (entity.MarkerScalarNormRefusal): он единственный, кто может
// отказать, потому что применение нормы — это клиентская запись в
// tech_card_colorway_usage.consumption с consumption_source='marker', и после неё число
// неотличимо от измеренного, а релизный снимок замораживает его навсегда.
//
// Локальные ветки ниже — не вторая политика, а страховка от МОЛЧАНИЯ: старый сервер, оптимистичный
// объект, испорченная строка. Ни одна из них не может противоречить серверу — они срабатывают
// только там, где сервер не сказал ничего.
export function scalarNormRefusal(s: common_TechCardMarkerSummary): string {
  const server = (s.scalarApplyRefusal ?? '').trim();
  if (server) return server;
  const comp = compositionOf(s);
  if (comp.length === 0) {
    return `у раскладки «${s.name ?? ''}» не читается состав: сколько изделий она выкраивает — неизвестно, и расход на изделие назвать нечем. Переоткройте карточку; если не помогло, пересохраните раскладку.`;
  }
  if (comp.length > 1) {
    return `раскладка «${s.name ?? ''}» снята на смешанном составе (${comp.length} размеров) — расход на изделие у неё СРЕДНИЙ по составу: мелкие размеры завышает, крупные занижает. В рецепт такое число не пишется.`;
  }
  return '';
}

// Fabric per ONE garment, cm. `null` = НЕ ВЫДАЁТСЯ, и это ответ, а не пробел.
//
// ЗДЕСЬ БЫЛА ДЫРА, СТОИВШАЯ ДЕНЕГ. Функция возвращала `usedLength / max(1, sets)`, а сервер с Ф2
// шлёт sets=0 на маркере с составом (proto3 роняет умолчание) И НАМЕРЕННО НЕ ШЛЁТ
// consumption_per_unit_cm на смешанном. Обе половины вместе давали `usedLength / 1` — весь настил
// как норму одного изделия, число в N раз завышенное и абсолютно правдоподобное на вид. Оно
// показывалось в списке маркеров и применялось в рецепт одной кнопкой.
//
// Поэтому: сперва ОТКАЗ, и только потом арифметика. Единственный сохранившийся расчёт —
// однородный состав, и он побайтово повторяет серверную формулу (used_length / total_units),
// то есть не может с ней разойтись; он остался ради строки, которая ещё не съездила на сервер.
export function consumptionCm(s: common_TechCardMarkerSummary): number | null {
  if (scalarNormRefusal(s)) return null;
  const derived = decNum(s.consumptionPerUnitCm);
  if (derived > 0) return derived;
  const units = totalUnitsOf(s);
  if (units < 1) return null;
  return r2(decNum(s.usedLengthCm) / units);
}

// Состав словами: «S×1 · M×2». Одна раскладка — одна подпись, и она же служит «размером» маркера
// в списках, где раньше стояло имя одного размера.
export function compositionLabel(
  comp: readonly MarkerCompositionEntry[],
  sizeName: (id: number) => string,
): string {
  if (comp.length === 0) return '';
  if (comp.length === 1 && comp[0].quantity === 1) return sizeName(comp[0].sizeId);
  return comp.map((c) => `${sizeName(c.sizeId)}×${c.quantity}`).join(' · ');
}

// Marker cm → the BOM line's unit. The unit is free text — convert ONLY what is
// unambiguous (design §3: не угадывать). null = the line's unit cannot take a layout.
export function toBomUnit(cm: number, unit?: string): { value: number; unit: string } | null {
  const u = (unit ?? '').trim().toLowerCase();
  // 3 decimals: tech_card_colorway_usage.consumption is DECIMAL(10,3) — r2 on metres
  // throws away a digit the column holds (4+ m lost per 1000 units).
  if (u === 'м' || u === 'm') return { value: r3(cm / 100), unit: u };
  if (u === 'см' || u === 'cm') return { value: r2(cm), unit: u };
  return null;
}

// Waste decomposition of a marker-measured norm, in percent OF THE PIECE AREA (0261) — the
// scale the wire and the costing display use. Both components are explanation, never a
// multiplier: the marker's own length already paid for them.
//
//   piece area   = efficiency × W × L        (W = cutting width, L = used length)
//   inter-piece  = W×L − piece area          → 1/efficiency − 1
//   кромка       = 2×selvedge × L            → 2×selvedge / (efficiency × W)
//
// null when the marker records no efficiency (a hand-built or imported layout): the norm is
// still marker-sourced — costing must still skip the gross-up — we just cannot say how the
// length splits, and inventing a split would be worse than leaving it blank.
export function markerWasteDecomposition(
  m: common_TechCardMarkerSummary,
): { selvedgePct: number; cutPct: number } | null {
  const eff = decNum(m.efficiencyPct) / 100;
  const w = decNum(m.fabricWidthCm);
  if (!(eff > 0) || !(w > 0)) return null;
  const selvedge = decNum(m.selvedgeCm);
  // Both components legitimately exceed 100% — the cut component is 1/efficiency − 1, so any
  // раскладка under 50% wastes more cloth than it turns into pieces. The server's ceiling is
  // 1000% (0263) and it REJECTS the whole recipe save above it, so clamp here rather than let a
  // nonsense width take the operator's save down with it.
  const clamp = (v: number) => (v < 0 ? 0 : v > 1000 ? 1000 : r2(v));
  return {
    selvedgePct: clamp(((2 * selvedge) / (eff * w)) * 100),
    cutPct: clamp((1 / eff - 1) * 100),
  };
}

export function markersForLine(
  markers: common_TechCardMarkerSummary[] | undefined,
  lineKey: string,
): common_TechCardMarkerSummary[] {
  if (!lineKey) return [];
  return (markers ?? []).filter((m) => (m.bomLineKey ?? '') === lineKey);
}

// Раскладки, относящиеся к ОДНОМУ колорвею: его собственные плюс общие.
//
// Раскладка меряется на КОНКРЕТНОМ полотне — колорвей называет артикул, у артикула своя ширина, —
// и длина, снятая на 140 см, к артикулу 150 см просто не относится. Предложить её всё равно
// значит выдать правдоподобное неверное число, а такие глазом не ловятся. Маркеры с colorway_id 0
// (унаследованные и те, где ширина у всех одна) остаются общими: отбросить их значило бы спрятать
// всё, что снято до 0264.
//
// Фильтр живёт ЗДЕСЬ и применяется на входе в редактор рецепта конкретного колорвея. Полоса
// расхода на вкладке костинга — карточная, не колорвейная, и фильтровать её этим нельзя.
export function markersOfColorway(
  markers: common_TechCardMarkerSummary[] | undefined,
  colorwayId: number,
): common_TechCardMarkerSummary[] {
  if (!colorwayId) return markers ?? [];
  return (markers ?? []).filter((m) => {
    const own = Number(m.colorwayId ?? 0);
    return own === 0 || own === colorwayId;
  });
}

// Какой из двух маркеров ЛУЧШЕ для данного колорвея: сперва принадлежность, потом дата.
//
// Одной фильтрации мало. Отобрав «свои плюс общие», выбирать между ними по updatedAt значит
// разрешить свежему ОБЩЕМУ маркеру перебить собственный маркер колорвея — а общий снят на
// дефолтной ширине слота, тогда как собственный снят на артикуле, который этот колорвей реально
// закупает. Именно эту подмену колонка colorway_id и заводилась предотвращать, и заметить её
// нечем: длина отличается ровно настолько, насколько отличаются ширины.
// НОРМА — ПЕРВЫЙ КЛЮЧ, и это не «ещё одна сортировка», а смена того, кто решает (Ф3.4). Пока
// ключей было два, норму выбирал КАЛЕНДАРЬ: любая свежая пробная раскладка перебивала ту, которую
// человек назначил нормировочной, — а назначение и есть высказывание «мерить по этой». Признак
// ставится отдельным RPC, так что перехватить норму пересохранением геометрии нельзя; здесь
// остаётся лишь не игнорировать назначенное.
//
// Дата остаётся ниже: две нормы в одном скоупе — состояние, которое сервер сообщает отдельно
// (norm_conflict), а не то, что клиент разрешает молчанием; до тех пор побеждает свежая.
export function betterMarker(colorwayId: number) {
  const own = (m: common_TechCardMarkerSummary) =>
    colorwayId && Number(m.colorwayId ?? 0) === colorwayId ? 0 : 1;
  const norm = (m: common_TechCardMarkerSummary) => (m.isNorm === true ? 0 : 1);
  return (a: common_TechCardMarkerSummary, b: common_TechCardMarkerSummary): number =>
    norm(a) - norm(b) || own(a) - own(b) || newerMarker(a, b);
}

// ── УСЛОВИЯ СЪЁМКИ (Ф3) ─────────────────────────────────────────────────────────────────
//
// Читаются ЗДЕСЬ и по ПОЛЮ, тем же правилом, что состав. Отсутствие любого условия — это
// «не записано», а не ноль: маркер без припуска и есть «СТАРАЯ НОРМА» — категория ПРОИЗВОДНАЯ,
// без своей колонки и без своего флага, потому что непомеченное само остаётся старым.
export type MarkerConditions = {
  seamAllowanceCm: number | null;
  contourAllowanceCm: number | null;
  contourLayer: string | null;
  grainLayer: string | null;
  allowFlip: boolean | null;
  /** false = условия не записаны вовсе ⇒ это «старая норма». */
  recorded: boolean;
};

export function conditionsOf(s?: common_TechCardMarkerSummary): MarkerConditions {
  const num = (d?: googletype_Decimal): number | null => {
    const raw = d?.value;
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const seam = num(s?.seamAllowanceCm);
  return {
    seamAllowanceCm: seam,
    contourAllowanceCm: num(s?.contourAllowanceCm),
    contourLayer: s?.contourLayer ?? null,
    grainLayer: s?.grainLayer ?? null,
    allowFlip: s?.allowFlip ?? null,
    // ПРИПУСК — ЕДИНСТВЕННЫЙ СВИДЕТЕЛЬ. Слой контура законно пуст (файл с одним слоем), долевая
    // законно пуста («не разворачивать»), переворот — булев и его умолчание неотличимо от
    // незаписанного. Только припуск записывается всегда, когда условия записывались вообще.
    recorded: seam != null,
  };
}

/** «Старая норма»: снята до того, как условия стали записываться. */
export function isLegacyNorm(s?: common_TechCardMarkerSummary): boolean {
  return !conditionsOf(s).recorded;
}

/** Набор деталей карточки изменился с момента съёмки. НЕИЗВЕСТНОСТЬ — НЕ ИЗМЕНЕНИЕ. */
export function pieceSetChanged(s?: common_TechCardMarkerSummary): boolean {
  return s?.pieceSetStatus === 'TECH_CARD_MARKER_PIECE_SET_STATUS_CHANGED';
}

// Лучший маркер на каждый размер для одной строки BOM — источник для применения по размерам.
//
// Размер маркера берётся ИЗ СОСТАВА, а не из легаси-поля size_id: с Ф2 сервер шлёт на маркере с
// составом size_id = 0, и прежний `m.sizeId ?? 0; if (!sid) continue` молча выбрасывал бы КАЖДЫЙ
// новый маркер — режим «по размерам» оставался бы вечно недоступным, и понять почему было бы
// нечем, потому что маркеры в списке при этом видны.
//
// В карту попадает ТОЛЬКО ОДНОРОДНАЯ раскладка. Смешанная не является нормой ни одного из своих
// размеров: её длина — общая на весь настил, а поделить её по размерам нечем до Ф2.4 (расход по
// площадям). Записать её под, скажем, самым крупным размером состава значило бы выдать среднее за
// измеренное — ровно та подмена, ради устранения которой Ф2 и заводилась.
export function latestPerSize(
  markers: common_TechCardMarkerSummary[],
  colorwayId = 0,
): Map<number, common_TechCardMarkerSummary> {
  const better = betterMarker(colorwayId);
  const bySize = new Map<number, common_TechCardMarkerSummary>();
  for (const m of markers) {
    const comp = compositionOf(m);
    if (comp.length !== 1) continue;
    const sid = comp[0].sizeId;
    const prev = bySize.get(sid);
    if (!prev || better(m, prev) < 0) bySize.set(sid, m);
  }
  return bySize;
}

// ── run → layout ────────────────────────────────────────────────────────────────────────

export function buildMarkerLayout(args: {
  pieces: PieceDTO[];
  // per-set quantity per piece id (the modal's sel state, WITHOUT the sets multiplier).
  perSetQty: Map<number, number>;
  // uploaded-file url by source label, provenance only.
  urlBySource: Map<string, string>;
  result: NestResult;
  unit: Exclude<Unit, 'auto'>;
  config: Pick<NestConfig, 'targetLengthCm' | 'rdpEpsCm' | 'timeBudgetMs'>;
  tol: number;
  tolChain: number;
  // Parse-time warnings (failed fetches, unit overrides, dropped loops) — they describe
  // the data the marker was BUILT from, so they must survive into the blob (a marker that
  // silently omits «файл не скачался» reads as a clean complete norm).
  parseWarnings?: string[];
  // Cut-piece identity per parsed piece id (schema v2): the resolved TechCardPiece.line_key,
  // so the marker survives a piece rename. Absent/'' = unresolved, and the reader falls back
  // to the block name saved on the piece.
  pieceLineKeyById?: Map<number, string>;
  // СОСТАВ раскладки (Ф2): сколько ИЗДЕЛИЙ каждого размера кладёт этот настил. Обязателен и
  // непуст — раскладка без состава не сохраняется вовсе, и сервер отказывает ей прямо
  // (ReasonCompositionMissing), потому что придуманный «1 комплект» завысил бы норму на изделие
  // ровно во столько раз, сколько изделий в настиле.
  composition: readonly MarkerCompositionEntry[];
  // Размер градации каждой РАЗОБРАННОЙ детали: id размера карточки, 0/нет = деталь не
  // градуируется (блок без размерного хвоста — такая кроится по одной на КАЖДОЕ изделие состава).
  sizeIdByPieceId?: ReadonlyMap<number, number>;
}): common_TechCardMarkerLayout {
  const { pieces, perSetQty, urlBySource, result, unit, config } = args;
  const used = new Set(result.placements.map((p) => p.pieceId));
  // Порядок состава — по size_id, тем же правилом, что канонизирует сервер. Он часть БАЙТОВ
  // блоба, и брать его от того, в каком порядке форма собрала строки, нельзя: пробник Ф0.5
  // сверяет «тот же вход ⇒ тот же блоб».
  //
  // ДУБЛИ РАЗМЕРА СЛИВАЮТСЯ СУММОЙ. Два упоминания одного size_id — это один размер, названный
  // дважды (файл пишет его двумя графиками: BP_M и SL_R_m), и сумма — единственное чтение такого
  // входа. Сервер дубль отвергает целиком («composition lists size N twice»), и правильно: он не
  // знает намерения. Писатель своё намерение знает — и обязан канонизировать СВОЙ вход, а не
  // доносить на него; блоб с гарантированным отказом хуже, чем отсутствие блоба.
  const qtyBySize = new Map<number, number>();
  for (const c of args.composition) {
    if (c.sizeId > 0 && c.quantity >= 1) {
      qtyBySize.set(c.sizeId, (qtyBySize.get(c.sizeId) ?? 0) + c.quantity);
    }
  }
  const composition = [...qtyBySize]
    .map(([sizeId, quantity]) => ({ sizeId, quantity }))
    .sort((a, b) => a.sizeId - b.sizeId);
  // КАКОЙ ФОРМОЙ ПИСАТЬ СОСТАВ — и почему однородный пишется ПО-СТАРОМУ.
  //
  // Состав из одного размера и легаси-пара (size_id, sets) — это ОДИН И ТОТ ЖЕ ФАКТ в двух
  // кодировках: сервер проецирует пару в состав {size_id, sets} на чтении (миграция 0273), так что
  // ниже по течению — в списке, в костинге, в latestPerSize — они уже неразличимы. Раз факт один,
  // выбор кодировки решается ценой ошибки, и она несимметрична:
  //
  //   • v4 на однородной раскладке МЕНЯЕТ БАЙТЫ блоба, которые не обязаны меняться, — то есть
  //     каждый пересохранённый старый маркер «дрожит» без единого содержательного отличия;
  //   • v4 требует сервера, который её понимает: развёрнутый на проде бэкенд отвергает
  //     schema_version > 3 целиком («not supported»), и клиент, штампующий 4 безусловно, ломает
  //     сохранение ЛЮБОЙ раскладки, включая те, что прекрасно выражались и раньше;
  //   • уникальность имени у легаси-строки — (карточка, размер, имя), у строки с составом —
  //     (карточка, имя). Безусловная v4 сузила бы её: две раскладки одного имени на разных
  //     размерах, законные сегодня, столкнулись бы на constraint — ПОСЛЕ оплаченного прогона.
  //
  // Поэтому состав уезжает в блоб ровно тогда, когда легаси-пара его выразить НЕ МОЖЕТ, — то есть
  // на смешанном настиле. Это не «отложить Ф2»: смешанный состав и есть то новое, ради чего она
  // заводилась, и он записывается полностью, вместе с размерами на деталях.
  const mixed = composition.length > 1;
  // Размер на детали — ТОЛЬКО в смешанной раскладке, и это не экономия, а договор. Сервер
  // отвергает деталь, чей size_id не назван в составе (формула дала бы ей ноль экземпляров), и
  // при пустом составе это КАЖДАЯ размеченная деталь. В однородной же раскладке ветка формулы
  // «деталь размеро-агностична» даёт quantity × total_units = quantity × sets — ровно прежний
  // ответ, без единого поля сверх того, что писалось до Ф2.
  const sizeOfPiece = (id: number): number | undefined => {
    if (!mixed) return undefined;
    const sid = args.sizeIdByPieceId?.get(id) ?? 0;
    return sid > 0 ? sid : undefined;
  };
  // v2 said "pieces carry block_name AND/OR piece_line_key" — never which — and was claimed only
  // when the blob really carried one of the two. That conditional claim is gone with v3, and the
  // reason it can go is the rule it always rested on: a READER BRANCHES ON THE FIELD IT NEEDS,
  // NEVER ON THE NUMBER. Markers written before the matching dialog existed carry block_name only,
  // and resolving them through an empty piece_line_key would lose the name they did save — so no
  // reader was ever entitled to infer a field's presence from the version, and none does.
  // v3 = the writer KNOWS THE FLIP POLICY: it derives its rotation set from the cloth's
  // направление (lib/nesting/types.ts allowedRotations), so it never lays a piece upside down on
  // cloth that forbids it, and its placements can express a mirror (`flipped`).
  //
  // ЧТО ВЕРСИЯ НА САМОМ ДЕЛЕ РЕШАЕТ НА СЕРВЕРЕ — и это НЕ то, что здесь было написано раньше.
  // Тут стояло «сервер судит повороты только начиная с v3» и «клиент, продолжающий писать v2,
  // оставил бы всю защиту мёртвой». Обе фразы неверны для развёрнутого бэкенда, и обе опасны: они
  // подсказывают следующему читателю, что номером версии можно управлять политикой.
  //
  //   • Правило про 180°/зеркало (ValidateMarkerFabricDirection) НЕ СМОТРИТ на версию пэйлоада
  //     вовсе. Оно отказывает по направлению ткани одинаково любому блобу.
  //   • Дедовщина (grandfathering) для старых раскладок ключуется НЕ пэйлоадом, а колонкой
  //     layout_schema_version уже лежащей в базе строки, и колонка эта — ПОКОЛЕНИЕ ПОЛИТИКИ,
  //     серверная константа, а не копия того, что прислал клиент. Ровно затем: копирование
  //     пэйлоада делало освобождение подделываемым в один запрос (создать чистый маркер с v1,
  //     следующим апдейтом дописать в него 180°).
  //   • Версия load-bearing РОВНО ДЛЯ ОДНОГО: FlipPredatesSchema. Зеркало в блобе, заявившем
  //     версию младше 3, — это невозможный пэйлоад (поля тогда не существовало), и он отвергается
  //     для КАЖДОГО маркера, привязанного к ткани или нет.
  //
  // Заявлять 3 безусловно всё равно правильно: этот писатель действительно умеет зеркало, и
  // именно это версия и означает. Просто цена ошибки тут не «защита умерла», а «зеркало не
  // сохранить».
  //
  // The version ladder stays cumulative and the identity rule above is unchanged: a reader still
  // branches on the FIELD it needs, never on the number.
  return {
    // 4 — как только в блобе есть состав или размер на детали; иначе прежняя 3. Версия НЕ решает
    // политику (см. простыню выше), но она обязана соответствовать содержимому: блоб с составом
    // под версией младше 4 сервер отвергает как невозможный пэйлоад
    // (entity.CompositionPredatesSchema), и правильно — это клиент, пишущий формат, которым не
    // владеет.
    schemaVersion: mixed ? 4 : 3,
    // undefined, а не []: ключа в JSON не появляется вовсе, и однородный блоб остаётся байт в
    // байт тем же, что писался до Ф2. Пустой состав в блобе — это законное «читай состав из
    // шапки» ({summary.size_id, summary.sets}), а не «раскладка без состава».
    composition: mixed
      ? composition.map((c) => ({
          sizeId: c.sizeId,
          quantity: c.quantity,
          // ПРОИЗВОДНАЯ ПОЛОВИНА СТРОКИ СОСТАВА В БЛОБ НЕ ПИШЕТСЯ. Сообщение одно на две
          // поверхности: в СВОДКЕ оно несёт пер-размерный расход и площадь, из которой он
          // посчитан (Ф2.4), в БЛОБЕ не должно нести ни того ни другого. Блоб — неизменяемая
          // история; замороженное в нём производное число переживёт длину, из которой выведено,
          // и станет неотличимо от измеренного. Сервер это поле всё равно обнуляет на входе
          // (dto.MarkerLayoutFactsFromPb), но полагаться на чужую уборку писателю не положено:
          // здесь undefined — ключа в JSON нет, и однородный блоб остаётся байт в байт прежним.
          consumptionPerUnitCm: undefined,
          areaPerGarmentCm2: undefined,
        }))
      : undefined,
    params: {
      unit,
      tolCm: args.tol,
      tolChainCm: args.tolChain,
      rdpEpsCm: config.rdpEpsCm,
      targetLengthCm: config.targetLengthCm ?? 0,
      timeBudgetS: Math.round(config.timeBudgetMs / 1000),
    },
    pieces: pieces
      .filter((p) => used.has(p.id))
      .map((p) => ({
        pieceId: p.id,
        name: p.name,
        source: p.source,
        sourceUrl: urlBySource.get(p.source) ?? '',
        quantity: Math.max(1, perSetQty.get(p.id) ?? 1),
        poly: p.poly.map((pt) => ({ xCm: r2(pt.x), yCm: r2(pt.y) })),
        bboxWCm: r2(p.bboxW),
        bboxHCm: r2(p.bboxH),
        areaCm2: r2(p.areaCm2),
        // v2 identity: the DXF block name as the file spells it, and the cut-piece it resolved
        // to. Both may be '' — a marker whose pieces are unresolved is still a valid norm, it
        // just displays by the name it saved.
        blockName: p.blockName ?? '',
        pieceLineKey: args.pieceLineKeyById?.get(p.id) ?? '',
        // Размер градации ЭТОГО контура (схема 4). undefined — «деталь не градуируется», и это
        // ответ, а не пробел: по формуле такая деталь кроится по одной на каждое изделие всего
        // состава. Именно undefined, а не 0, чтобы ключа в JSON не появлялось: однородный блоб
        // обязан остаться байт в байт прежним.
        sizeId: sizeOfPiece(p.id),
      })),
    placements: result.placements.map((pl) => ({
      pieceId: pl.pieceId,
      instance: pl.instance,
      rotDeg: pl.rot,
      xCm: r2(pl.x),
      yCm: r2(pl.y),
      // ЗЕРКАЛО, схема 3. Договор целиком живёт в lib/nesting/types.ts:
      //   placed(p) = R(rot) · M^flipped · p + (x, y),  M: (x, y) ↦ (−x, y)
      // Здесь переезжает только БУЛЕВО ЗНАЧЕНИЕ — ни координаты, ни поворот от зеркала не
      // зависят, потому что отражение применяется ДО поворота и в собственной системе детали.
      //
      // Пишется ВСЕГДА, а не только когда true. Блоб — единственная запись раскладки, и `false`
      // в нём значит «клиент знал про зеркало и эта деталь не отражена», тогда как отсутствие
      // ключа значит «писал клиент, который про зеркало не знал». Различать их нужно ровно
      // потому, что версия 3 заявлена безусловно (см. выше): читатель ветвится по ПОЛЮ, а не по
      // номеру, и молчаливый пропуск здесь превратил бы каждую зеркальную деталь в обычную при
      // первом же переоткрытии — тот самый брак, ради которого поле и заводили.
      flipped: pl.flipped === true,
    })),
    warnings: [...(args.parseWarnings ?? []), ...result.warnings],
  };
}

// ── stored marker → view model ──────────────────────────────────────────────────────────

const ROTS: RotationDeg[] = [0, 90, 180, 270];

export function markerToView(marker: common_TechCardMarker): {
  pieces: PieceDTO[];
  result: NestResult;
  widthCm: number;
  targetCm?: number;
  // Состав раскладки и размер каждой детали — прочитанные ПО ПОЛЮ, один раз, здесь.
  composition: MarkerCompositionEntry[];
  totalUnits: number;
  sizeIdByPieceId: Map<number, number>;
} {
  // Generated types spell every key as required-but-undefined, so a bare {} does not
  // assign; the cast is safe because every property is `| undefined`.
  const s = (marker.summary ?? {}) as common_TechCardMarkerSummary;
  const l = (marker.layout ?? {}) as common_TechCardMarkerLayout;
  // СОСТАВ ЧИТАЕТСЯ ИЗ БЛОБА, А ЕСЛИ ЕГО ТАМ НЕТ — ИЗ ШАПКИ. Это одна ветка на поле, а не две
  // семантики: пустой composition у блоба означает «легаси, состав в шапке», и compositionOf
  // достаёт оттуда ту же самую форму — одну строку {size_id, sets}. Ниже по коду разницы уже нет.
  const blob = (l.composition ?? [])
    .map((c) => ({ sizeId: Number(c.sizeId ?? 0), quantity: Number(c.quantity ?? 0) }))
    .filter((c) => c.sizeId > 0 && c.quantity > 0)
    .sort((a, b) => a.sizeId - b.sizeId);
  const composition = blob.length > 0 ? blob : compositionOf(s);
  const totalUnits = composition.reduce((n, c) => n + c.quantity, 0) || totalUnitsOf(s);
  const sizeIdByPieceId = new Map<number, number>();
  for (const p of l.pieces ?? []) {
    const sid = Number(p.sizeId ?? 0);
    if (sid > 0) sizeIdByPieceId.set(p.pieceId ?? 0, sid);
  }
  const pieces: PieceDTO[] = (l.pieces ?? []).map((p) => ({
    id: p.pieceId ?? 0,
    name: p.name || `деталь ${p.pieceId ?? 0}`,
    // v1 blobs have no block_name; '' keeps the round-trip honest instead of re-deriving one
    // from the display name (which may already be the synthetic «деталь N»).
    blockName: p.blockName || '',
    source: p.source || '',
    poly: (p.poly ?? []).map((pt) => ({ x: pt.xCm ?? 0, y: pt.yCm ?? 0 })),
    bboxW: p.bboxWCm ?? 0,
    bboxH: p.bboxHCm ?? 0,
    areaCm2: p.areaCm2 ?? 0,
  }));
  const result: NestResult = {
    placements: (l.placements ?? []).map((pl) => ({
      pieceId: pl.pieceId ?? 0,
      instance: pl.instance ?? 0,
      rot: (ROTS.includes((pl.rotDeg ?? 0) as RotationDeg) ? pl.rotDeg ?? 0 : 0) as RotationDeg,
      x: pl.xCm ?? 0,
      y: pl.yCm ?? 0,
      // Обратная сторона записи выше. Отсутствие ключа (блоб схемы 1/2, сохранённый до Ф1) —
      // это ОТВЕТ «не отражено», а не пробел: зеркала тогда не существовало, выразить его было
      // нечем. Поэтому `=== true`, а не `??`-цепочка к какому-нибудь умолчанию: единственный
      // источник зеркальности — этот флаг, и выводить её из чего-то ещё (из чётности instance,
      // из имени детали) запрещено договором в types.ts.
      flipped: pl.flipped === true,
    })),
    usedLengthCm: decNum(s.usedLengthCm),
    efficiency: decNum(s.efficiencyPct) / 100,
    placedCount: s.placedCount ?? (l.placements ?? []).length,
    totalCount: s.totalCount ?? (l.placements ?? []).length,
    // A STORED marker is a layout, not a run: nothing about it is unplaced (a marker whose
    // pieces did not all fit was never savable — the save gate требует placed === total),
    // nobody cancelled it, and it carries no telemetry. Stating that here rather than
    // leaving the fields optional keeps the reader from having to ask which case it holds.
    unplaced: [],
    generation: 0,
    elapsedMs: 0,
    cancelled: false,
    warnings: l.warnings ?? [],
  };
  const target = l.params?.targetLengthCm ?? 0;
  return {
    pieces,
    result,
    widthCm: decNum(s.fabricWidthCm) || 140,
    targetCm: target > 0 ? target : undefined,
    composition,
    totalUnits,
    sizeIdByPieceId,
  };
}
