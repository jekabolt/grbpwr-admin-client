import {
  common_MaterialUnit,
  common_ProductionRunCutReceipt,
  common_ProductionRunLay,
  common_ProductionRunStatus,
  common_TechCard,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { bomUnitKind } from 'components/managers/tech-card/components/nesting/marker-io';
import { wireInt } from 'components/managers/tech-card/components/schema';
import { MATERIAL_UNIT_LABEL, layActualQty } from '../components/useLays';

// ТКАНЬ НА РЕАЛЬНО ВЫКРОЕННОЕ ИЗДЕЛИЕ (Ф4) — арифметика ОДНИМ модулем на оба экрана шага 3
// (карточка настила и приёмка кроя). Две копии формулы на двух экранах разошлись бы, и разошлись
// молча, поэтому здесь считается всё, а экраны только показывают; причины отказа возвращаются
// ДАННЫМИ, и ни один отказ не подставляет ноль.
//
// ДВА РАЗНЫХ показателя, и путать их нельзя:
//   факт полотна ÷ Σ выкроено         — сколько ткани стоил КРОЙ (брак кроя внутри: ткань на него
//                                       потрачена);
//   факт полотна ÷ Σ принято в пошив  — сколько ткани стоило ГОДНОЕ изделие;
//   их разница                        — цена брака кроя в ткани.
//
// ЭТО НЕ ПЕРЕСКАЗ ДРЕЙФА. У настила уже есть actualDriftPercent — факт против ГЕОМЕТРИЧЕСКОГО
// плана настила, с одним владельцем на сервере. Здесь другая пара чисел: факт НА ИЗДЕЛИЕ против
// НОРМЫ на изделие из рецептуры. Оба процента законны одновременно и отвечают на разные вопросы.
//
// cutting_coefficient артикула сюда НЕ входит намеренно: на пути настилов коэффициент сознательно
// не применяется (иначе его калибровка по настилам стала бы круговой — решение повторено в
// бекенде трижды), и норма здесь гроссится только процентом раскроя слота, только для источников
// без отходов внутри (см. compareToNorm).
//
// ЗНАМЕНАТЕЛЕМ НЕ БЫВАЮТ: coveredQty и плановое composition × слои (это ПЛАН, и наивная сумма
// врёт на face_to_face), а также receivedQty строки прогона (другой ключ и другое событие — сдача
// готовых после пошива, а не годное кроя). Знаменатель — только строки приёмки кроя.

// ── ЕДИНИЦЫ ФАКТА ────────────────────────────────────────────────────────────────────────
//
// Факт сводится к ДВУМ базовым величинам: длина (м) и вес (кг). Всё остальное (м², шт, пары,
// нераспознанное) показывается «как есть» и ни с чем не сравнивается и не складывается между
// настилами, кроме случая буквально одинаковой единицы. Перевод веса в длину НЕ делается: бекенд
// трижды отказывается (LayDriftReasonUnitNotLength) — нужен вопрос про ширину и плотность, а это
// другой вопрос с другим владельцем.
export type ClothKind = 'length' | 'mass';

const LENGTH_TO_M: Partial<Record<common_MaterialUnit, number>> = {
  MATERIAL_UNIT_M: 1,
  MATERIAL_UNIT_CM: 0.01,
  MATERIAL_UNIT_MM: 0.001,
};
const MASS_TO_KG: Partial<Record<common_MaterialUnit, number>> = {
  MATERIAL_UNIT_KG: 1,
  MATERIAL_UNIT_G: 0.001,
};

export const KIND_UNIT: Record<ClothKind, string> = { length: 'm', mass: 'kg' };

// Подпись сырой (несводимой) единицы. UNKNOWN — «единицу не распознали», а не «единицы нет», но в
// позицию «X {ед}/изд» полная фраза не встаёт, поэтому короткое «ед.?» с длинным объяснением у
// вызывающего, когда оно нужно.
const rawUnitLabel = (uom?: common_MaterialUnit): string =>
  !uom || uom === 'MATERIAL_UNIT_UNKNOWN' ? 'unit?' : MATERIAL_UNIT_LABEL[uom] ?? 'unit?';

type NormalizedFact =
  | { kind: ClothKind; qty: number }
  | { kind: null; qty: number; uom: common_MaterialUnit };

function normalizeFact(qty: number, uom?: common_MaterialUnit): NormalizedFact {
  const toM = uom ? LENGTH_TO_M[uom] : undefined;
  if (toM != null) return { kind: 'length', qty: qty * toM };
  const toKg = uom ? MASS_TO_KG[uom] : undefined;
  if (toKg != null) return { kind: 'mass', qty: qty * toKg };
  return { kind: null, qty, uom: uom ?? 'MATERIAL_UNIT_UNKNOWN' };
}

// ── ВХОДЫ ────────────────────────────────────────────────────────────────────────────────

export type LayClothInput = {
  /** Как настил называется в отказах агрегата («замера нет у …»). */
  title: string;
  /** null — замер не внесён. Ноль сервер не хранит вовсе (chk_prlay_actual_qty > 0: «ноль — это
   *  не измерение»), поэтому неоднозначности «ноль или пусто» здесь нет по построению. */
  fact: { qty: number; uom?: common_MaterialUnit } | null;
  /** Размеры, которые настил РЕЖЕТ: объединение markerComposition его секций (qty > 0). Только
   *  МНОЖЕСТВО — количества composition × слои сюда не входят, это план, врущий на face_to_face. */
  composedSizes: number[];
  /** Строки приёмки ЭТОГО настила. Присутствие строки = «посчитали»; пустая клетка ≠ ноль. */
  receipts: { sizeId: number; cut: number; accepted: number }[];
};

/** Провод → вход. Обе стороны join'а (настил и его строки приёмки) через wireInt: int64 едет строкой. */
export function layClothInput(
  lay: common_ProductionRunLay,
  receipts: common_ProductionRunCutReceipt[],
  title: string,
): LayClothInput {
  const raw = layActualQty(lay);
  const sizes = new Set<number>();
  for (const s of lay.sections ?? [])
    for (const e of s.markerComposition ?? [])
      if (wireInt(e.sizeId) > 0 && wireInt(e.qty) > 0) sizes.add(wireInt(e.sizeId));
  return {
    title,
    fact: raw === '' ? null : { qty: Number(raw), uom: lay.actualUom },
    composedSizes: [...sizes],
    receipts: receipts.map((r) => ({
      sizeId: wireInt(r.sizeId),
      cut: wireInt(r.cutQty),
      accepted: wireInt(r.acceptedQty),
    })),
  };
}

// Запись факта настила закрыта СТАТУСОМ ПАРТИИ (SaveProductionRunLay отказывает), и это ШИРЕ
// isRunLocked ровно на CANCELLED. Приёмка кроя гейта не имеет и вносима даже на отменённой —
// значит на закрытой партии знаменатель ещё уточняют, а невнесённый числитель не внести уже
// НИКОГДА. Это надо говорить вслух, иначе оператор ищет кнопку, которой нет.
export const isLayFactFrozen = (s?: common_ProductionRunStatus): boolean =>
  s === 'PRODUCTION_RUN_STATUS_RECEIVED' ||
  s === 'PRODUCTION_RUN_STATUS_CLOSED' ||
  s === 'PRODUCTION_RUN_STATUS_CANCELLED';

// ── РЕЗУЛЬТАТ ────────────────────────────────────────────────────────────────────────────

export type ClothRefusal =
  /** Замера нет (у всех или у части настилов). Агрегат по паре при ЛЮБОМ настиле без замера
   *  отказывает целиком: второй настил пары часто кроит добор — крошечный cutQty при реальном
   *  полотне, — и смешанный агрегат (часть с фактом, часть без) дал бы число ни о чём. */
  | { kind: 'no-fact'; frozen: boolean; lays: string[] }
  /** Замеры пары в несводимых единицах — складывать нельзя. */
  | { kind: 'mixed-units'; units: string[] }
  /** Ни одной строки приёмки. factTotal при отказе известен и возвращается: «полотно потрачено,
   *  а кроя нет» — это содержание отказа, а не декор. */
  | { kind: 'no-receipts'; factTotal: number; unitLabel: string }
  /** Строки есть, Σвыкроено = 0 — выкроенное СТОИТ НУЛЁМ, но «посчитанный ноль» этим не доказан:
   *  cut_qty NOT NULL, пустое поле формы сериализуется нулём, и сохранённая строка не различает
   *  «посчитали, вышло 0» и «не заполнили». Текст отказа обязан признавать обе причины. */
  | { kind: 'zero-cut'; factTotal: number; unitLabel: string };

export type ClothPerUnit =
  | {
      ok: true;
      /** 'length' → метры, 'mass' → кг; null — единица несводимая, показывается как есть. */
      kind: ClothKind | null;
      unitLabel: string;
      factTotal: number;
      cutTotal: number;
      acceptedTotal: number;
      /** факт ÷ Σвыкроено — сколько ткани стоил КРОЙ. */
      perCut: number;
      /** факт ÷ Σпринято; null при Σпринято = 0 — не делится. «Посчитанный ноль годных» при этом
       *  не утверждается: нулём приезжает и незаполненная приёмка (accepted_qty NOT NULL). */
      perAccepted: number | null;
      /** Цена брака кроя в ткани НА ГОДНОЕ изделие; только когда 0 < принято < выкроено. */
      scrapPerGood: number | null;
      /** Σпринято > Σвыкроено — невозможное состояние данных: принять в пошив больше, чем выкроили,
       *  нельзя. Число «на годное» при этом показывается, но вызывающий ОБЯЗАН назвать аномалию
       *  рядом с ним: никакая другая строка её не красит (цепочка чисел приёмки отмечает только
       *  принято < выкроено). */
      acceptedOverCut: boolean;
      /** Настилов в агрегате. >1 — вызывающий обязан нести оговорку про ДОБОР: настил, кроивший
       *  замену бракованных панелей (а не новые комплекты), раздувает знаменатель, и «на изделие»
       *  вместе с процентом к норме ЗАНИЖЕНЫ. Признака добора в данных нет — посчитать правильно
       *  нельзя, а угадывать по соотношению нельзя тем более: эвристика ошибалась бы молча,
       *  оговорка — нет. */
      layCount: number;
      /** Больше одного размера в составе — число есть, но это СРЕДНЕЕ ПО СОСТАВУ. */
      mixed: boolean;
      /** Размеры состава без строк приёмки: знаменатель занижен → perCut ЗАВЫШЕН и будет
       *  уменьшаться по мере ввода. Направление ошибки обязано называться вместе с числом. */
      missingSizes: number[];
      /** Настилы агрегата вовсе без строк приёмки (их состав уже в missingSizes, но настил без
       *  секций иначе занижал бы знаменатель невидимо). */
      unreportedLays: string[];
      /**
       * СТРОКИ приёмки (настил + размер), где выкроено > 0, а принято РОВНО 0. Именно отдельные
       * строки, а не сумма на размер: у пары из двух настилов одного размера «принято 50» первого
       * настила прятало бы незаполненную строку второго — сумма по размеру положительна, признак
       * гаснет, и агрегат объявлял бы завышенную «цену брака» без всякой оговорки. Колонка
       * `accepted_qty` — NOT NULL DEFAULT 0: сохранённая строка с незаполненной приёмкой
       * возвращается нулём, неотличимым от посчитанного («пусто ≠ ноль» живёт только на
       * несохранённом черновике). Значит «принято меньше выкроенного» имеет ДВЕ причины — брак
       * кроя и недозаполненную приёмку, — данные их не различают, и число показывается только с
       * оговоркой, называющей И размер, И настил: на паре из нескольких настилов без имени настила
       * оператору негде искать незаполненную строку.
       */
      acceptedZeroRows: { lay: string; sizeId: number }[];
      /** Σвыкроено по размерам — веса для взвешенной нормы (compareToNorm). */
      cutBySize: { sizeId: number; cut: number }[];
    }
  | { ok: false; refusal: ClothRefusal };

// Один вызов на настил И на пару: агрегат — это тот же расчёт по списку из N настилов ОДНОЙ пары
// (колорвей, слот). Внутри слота настилы суммируются; МЕЖДУ слотами не складывается ничего и
// никогда — изделию нужны все его слои, и «ткань на изделие» без имени слота — бессмысленный
// вопрос (ловушка описана в шапке cut-receipts.tsx). Ответственность не смешивать слоты лежит на
// вызывающем: сюда законно приходят только настилы одной пары.
export function clothPerUnit(lays: LayClothInput[], frozen: boolean): ClothPerUnit {
  const withoutFact = lays.filter((l) => !l.fact);
  if (lays.length === 0 || withoutFact.length > 0) {
    return {
      ok: false,
      refusal: { kind: 'no-fact', frozen, lays: withoutFact.map((l) => l.title) },
    };
  }

  const normalized = lays.map((l) => normalizeFact(l.fact!.qty, l.fact!.uom));
  // Сводимость: одна ВЕЛИЧИНА (длина/вес) или буквально одна и та же сырая единица. м+см — одна
  // длина; кг+м — не складывается; шт+шт — складывается как есть.
  const kindKeys = new Set(normalized.map((f) => (f.kind === null ? `raw:${f.uom}` : f.kind)));
  if (kindKeys.size > 1) {
    // Имена — базовые величины («м», «кг») и сырые единицы как есть: отказ обязан назвать, ЧТО
    // именно не сводится, а не просто отказать.
    const units = [
      ...new Set(
        normalized.map((f, i) => (f.kind ? KIND_UNIT[f.kind] : rawUnitLabel(lays[i].fact!.uom))),
      ),
    ];
    return { ok: false, refusal: { kind: 'mixed-units', units } };
  }

  const kind = normalized[0].kind;
  const unitLabel = kind ? KIND_UNIT[kind] : rawUnitLabel(lays[0].fact!.uom);
  const factTotal = normalized.reduce((s, f) => s + f.qty, 0);

  const rows = lays.flatMap((l) => l.receipts);
  if (rows.length === 0)
    return { ok: false, refusal: { kind: 'no-receipts', factTotal, unitLabel } };
  const cutTotal = rows.reduce((s, r) => s + r.cut, 0);
  const acceptedTotal = rows.reduce((s, r) => s + r.accepted, 0);
  if (cutTotal === 0) return { ok: false, refusal: { kind: 'zero-cut', factTotal, unitLabel } };

  const cutBySizeMap = new Map<number, number>();
  for (const r of rows) {
    cutBySizeMap.set(r.sizeId, (cutBySizeMap.get(r.sizeId) ?? 0) + r.cut);
  }
  // По ОТДЕЛЬНЫМ строкам, не по сумме на размер (см. комментарий у поля): filter возвращает новый
  // массив, sort по нему не трогает входные receipts.
  const acceptedZeroRows = lays.flatMap((l) =>
    l.receipts
      .filter((r) => r.cut > 0 && r.accepted === 0)
      .sort((a, b) => a.sizeId - b.sizeId)
      .map((r) => ({ lay: l.title, sizeId: r.sizeId })),
  );

  const missing = new Set<number>();
  const unreportedLays: string[] = [];
  const allSizes = new Set<number>(cutBySizeMap.keys());
  for (const l of lays) {
    const reported = new Set(l.receipts.map((r) => r.sizeId));
    for (const s of l.composedSizes) {
      allSizes.add(s);
      if (!reported.has(s)) missing.add(s);
    }
    if (l.receipts.length === 0) unreportedLays.push(l.title);
  }

  const perCut = factTotal / cutTotal;
  const perAccepted = acceptedTotal > 0 ? factTotal / acceptedTotal : null;
  return {
    ok: true,
    kind,
    unitLabel,
    factTotal,
    cutTotal,
    acceptedTotal,
    perCut,
    perAccepted,
    // Разница показывается только когда оба знаменателя положительны И принято МЕНЬШЕ выкроенного:
    // «принято больше, чем выкроено» — аномалия данных, её называет ОТДЕЛЬНЫЙ признак
    // acceptedOverCut (никакая другая строка её не красит — цепочка чисел отмечает лишь принято <
    // выкроено), а отрицательная «цена брака» была бы вторым, врущим пересказом той же аномалии.
    scrapPerGood: perAccepted != null && acceptedTotal < cutTotal ? perAccepted - perCut : null,
    acceptedOverCut: acceptedTotal > cutTotal,
    layCount: lays.length,
    mixed: allSizes.size > 1,
    missingSizes: [...missing].sort((a, b) => a - b),
    unreportedLays,
    acceptedZeroRows,
    cutBySize: [...cutBySizeMap].map(([sizeId, cut]) => ({ sizeId, cut })),
  };
}

// ── СРАВНЕНИЕ С НОРМОЙ — самое тонкое место ─────────────────────────────────────────────
//
// Факт включает ВСЕ реальные отходы (это полотно, реально настеленное), поэтому сравнивать его
// можно только с нормой, которая отходы тоже содержит. Правило ровно то, по которому живёт
// костинг (wastageApplies):
//   * источник 'marker' — отходы уже ВНУТРИ измеренной длины → норма берётся КАК ЕСТЬ;
//   * 'manual' / '' / 'dxf' (и любой неизвестный источник — консервативно, как manual) — норма
//     без отходов кроя → догроссить процентом раскроя слота × (1 + %/100); процента нет →
//     сравнения НЕТ: netto против факта всегда выглядит провалом, и этот «провал» был бы
//     свойством отсутствующего процента, а не производства.
//
// Норма на настил всегда ВЗВЕШЕННАЯ: Σ норма(размер) × выкроено(размер) ÷ Σ выкроено — по тем
// размерам, по которым отчитались. Сравнение смешанного настила с нормой одного размера врёт
// всегда, когда состав не однороден; на однородном взвешивание вырождается в норму этого размера.

/** Одна строка рецептуры пары, уже без провода: скаляр «на изделие» и/или пер-размерные нормы. */
export type UsageNormRow = {
  scalar: number | null;
  perSize: { sizeId: number; consumption: number }[];
  /** consumptionSource: '' | 'manual' | 'marker' | 'dxf' (trim+lower уже сделаны). */
  source: string;
};

// ── С КАКОЙ КАРТОЧКИ ВЗЯТА НОРМА: ревизия прогона или живая ─────────────────────────────
//
// Прогон, привязанный к релизу, обязан мериться нормой ТОГО снапшота, по которому создан: живую
// карточку правят дальше, и исторический прогон иначе судился бы нормой, изменённой ПОСЛЕ его
// создания, — вплоть до ложного «единицы не сходятся», когда слоту сменили единицу. Кто решает,
// какую карточку читать, — вызывающий (useRunNormCard, тот же порядок, что у печати в
// tech-card/print-page.tsx); здесь ответ только ЕДЕТ рядом с числом, потому что подпись сравнения
// обязана говорить, с чем сравнивали.
export type NormCardBasis =
  | { kind: 'release'; releaseNumber: number }
  | { kind: 'live' }
  /** ТРЕТЬЕ состояние, не «нет релиза» и не «есть»: релиз у прогона записан, а снапшот не
   *  прочитался (или релиз принадлежит другой карте) — сравнение идёт с ЖИВОЙ карточкой, и
   *  молчаливый фолбэк выдал бы её за замороженную ревизию. releaseNumber = 0, когда сам релиз
   *  не прочитался и номера взять негде. */
  | { kind: 'live-broken-snapshot'; releaseNumber: number };

/** Подпись «с чем сравнивали» — одна на оба экрана шага 3, рядом с числом или отказом. */
export function normBasisText(basis?: NormCardBasis): string {
  if (!basis) return '';
  if (basis.kind === 'release')
    return `norm from revision #${basis.releaseNumber || '?'}, the one the run was created from`;
  if (basis.kind === 'live-broken-snapshot')
    return `the run has revision #${basis.releaseNumber || '?'}, but its snapshot didn't read (or the revision doesn't belong to this card) — the comparison is against the LIVE card, not a frozen revision`;
  return 'norm from the live card — the run is not linked to a revision';
}

export type NormInput = {
  /** Пустой список = нормы на пару в рецептуре нет. */
  usageRows: UsageNormRow[];
  /** Единица строки BOM слота (свободный текст) — в ней записана норма. */
  slotUnit: string;
  /** Процент раскроя слота (wastage_percent); null — не задан. */
  wastagePct: number | null;
  /** С какой карточки всё выше прочитано — снапшот ревизии прогона или живая. */
  basis: NormCardBasis;
};

const dec = (d?: googletype_Decimal): number | null => {
  const n = Number(d?.value);
  return d?.value && Number.isFinite(n) ? n : null;
};

const SOURCE_LABEL: Record<string, string> = {
  manual: 'by hand',
  marker: 'from the marker',
  dxf: 'from the patterns',
};
const sourceLabelOf = (s: string) => SOURCE_LABEL[s] ?? s;

/**
 * Норма пары (колорвей, слот) из карточки. Соединение — тем же ключом, что у настила: bomLineKey
 * (предпочтительно, стабильный) с фолбэком на bomItemId; строки рецептуры без данных о расходе
 * (ни скаляра, ни пер-размерных) не считаются нормой.
 *
 * СТРОКИ, ПРИВЯЗАННЫЕ К ДЕТАЛИ (pieceId / pieceLineKey / pieceIndex), НЕ УЧАСТВУЮТ — зеркало
 * серверного правила (T8, entity.IsPieceMaterialAssignment): расход — свойство ИЗДЕЛИЯ, строка
 * детали лишь назначает ей материал, и легаси-число на ней не прибавляется к норме. Оставшихся
 * строк изделия может быть несколько — они суммируются, каждая гроссится по СВОЕМУ источнику.
 */
export function pairNormInput(
  techCard: common_TechCard,
  colorwayId: number,
  bomLineKey: string,
  bomItemId: number,
  // Обязателен: вызывающий УЖЕ решил, какую карточку передать (снапшот ревизии прогона или
  // живую — useRunNormCard), и умолчание «живая» здесь позволило бы протащить снапшот без
  // подписи, которая и отличает ревизию от живой карты.
  basis: NormCardBasis,
): NormInput {
  const cw = (techCard.colorways ?? []).find((c) => wireInt(c.colorwayId) === colorwayId);
  const usageRows: UsageNormRow[] = (cw?.usages ?? [])
    .filter((u) => {
      // Назначение материала детали, не норма: любое из трёх представлений привязки к детали
      // (pieceIndex — explicit presence, 0 — настоящая деталь).
      const pieceBound = wireInt(u.pieceId) > 0 || !!u.pieceLineKey || u.pieceIndex != null;
      if (pieceBound) return false;
      const byKey = !!bomLineKey && u.bomLineKey === bomLineKey;
      const byId = bomItemId > 0 && wireInt(u.bomItemId) === bomItemId;
      return byKey || byId;
    })
    .map((u) => ({
      scalar: dec(u.consumption),
      perSize: (u.sizeConsumptions ?? []).flatMap((sc) => {
        const v = dec(sc.consumption);
        const s = wireInt(sc.sizeId);
        return v != null && s > 0 ? [{ sizeId: s, consumption: v }] : [];
      }),
      source: (u.consumptionSource ?? '').trim().toLowerCase(),
    }))
    .filter((r) => r.scalar != null || r.perSize.length > 0);

  const bom = (techCard.techCard?.bomItems ?? []).find(
    (b) =>
      (!!bomLineKey && b.lineKey === bomLineKey) || (bomItemId > 0 && wireInt(b.id) === bomItemId),
  );
  return { usageRows, slotUnit: bom?.unit ?? '', wastagePct: dec(bom?.wastagePercent), basis };
}

export type NormRefusal =
  /** Факт не в длине и не в весе — сравнивать нечем (число при этом показывается). */
  | { kind: 'fact-unit'; unitLabel: string }
  | { kind: 'no-usage' }
  | { kind: 'no-size-norm'; sizeIds: number[] }
  | { kind: 'no-wastage'; sourceLabel: string }
  | { kind: 'zero-norm' }
  /** Приёмка заведомо неполна: есть размеры состава без строк и/или настил вовсе без строк.
   *  Знаменатель занижен, «на изделие» завышено — само число живёт со своим предупреждением (это
   *  настоящее отношение, просто предварительное), а процент к норме — ВЕРДИКТ, и вердикт по
   *  неполным данным хуже отсутствия вердикта: «+900%» после ввода второго размера стал бы «0%». */
  | { kind: 'incomplete-receipts'; sizeIds: number[]; lays: string[] }
  /** Тех-карта НЕ ЗАГРУЗИЛАСЬ (запрос упал). Это не «ещё читается» (то — norm === undefined и
   *  молчание) и не «нормы нет» — карточку не удалось спросить, и молчание здесь выглядело бы как
   *  вечная загрузка. */
  | { kind: 'card-failed' }
  /** normUnitKnown=false — единицу слота вообще не умеем читать; true — умеем, но величины разные
   *  (например факт в кг, норма в м) — НЕ конвертируем. */
  | { kind: 'unit-mismatch'; factUnit: string; normUnit: string; normUnitKnown: boolean };

export type NormComparison =
  | {
      ok: true;
      /** Взвешенная норма на изделие, в базовой единице величины факта (м или кг). */
      normPerUnit: number;
      unitLabel: string;
      /** (факт-на-крой ÷ норма − 1) × 100. Плюс — расход выше нормы, то есть потеря. */
      deltaPct: number;
      grossed: boolean;
      /** Догроссена только ЧАСТЬ суммы: рядом со слагаемым 'marker' (отходы уже внутри, взято как
       *  есть) стоят слагаемые без отходов. Подпись обязана говорить, что процент начислен НЕ на
       *  всю норму — общая фраза «догроссена процентом» читалась бы как (0.6 + 0.4) × 1.1, тогда
       *  как посчитано 0.6 + 0.4 × 1.1. */
      partlyGrossed: boolean;
      wastagePct: number | null;
      sourceLabel: string;
      /** Норма взвешена по >1 размеру (смешанный отчитанный состав). */
      weighted: boolean;
      /** С чем сравнивали: ревизия прогона или живая карточка (см. NormCardBasis). */
      basis: NormCardBasis;
    }
  /** basis отсутствует ровно в одном отказе — 'card-failed': карточку не удалось спросить, и
   *  утверждать, КАКАЯ это была бы карточка, нечем. Все отказы compareToNorm его несут. */
  | { ok: false; refusal: NormRefusal; basis?: NormCardBasis };

// Обёртка пришивает basis ко ВСЕМ исходам разом: девять точек return внутри не могут забыть его
// поодиночке, а подпись «с чем сравнивали» нужна и отказу (отказ «нормы на пару нет» без неё не
// говорит, в ЧЬЕЙ рецептуре нормы нет — ревизии или живой карты).
export function compareToNorm(
  per: Extract<ClothPerUnit, { ok: true }>,
  norm: NormInput,
): NormComparison {
  return { ...compareToNormBare(per, norm), basis: norm.basis };
}

type NormComparisonBare =
  | Omit<Extract<NormComparison, { ok: true }>, 'basis'>
  | { ok: false; refusal: NormRefusal };

function compareToNormBare(
  per: Extract<ClothPerUnit, { ok: true }>,
  norm: NormInput,
): NormComparisonBare {
  if (per.kind == null)
    return { ok: false, refusal: { kind: 'fact-unit', unitLabel: per.unitLabel } };
  if (norm.usageRows.length === 0) return { ok: false, refusal: { kind: 'no-usage' } };

  // Единица нормы — единица строки BOM; словарь ровно тот, которым норму ПИШУТ (bomUnitKind, одно
  // зеркало серверных синонимов на всех). 'm'/'cm' — длина, 'kg' — вес, null — не умеем.
  const slotKind = bomUnitKind(norm.slotUnit);
  if (slotKind == null) {
    return {
      ok: false,
      refusal: {
        kind: 'unit-mismatch',
        factUnit: per.unitLabel,
        normUnit: norm.slotUnit,
        normUnitKnown: false,
      },
    };
  }
  const normKind: ClothKind = slotKind === 'kg' ? 'mass' : 'length';
  if (normKind !== per.kind) {
    return {
      ok: false,
      refusal: {
        kind: 'unit-mismatch',
        factUnit: per.unitLabel,
        normUnit: norm.slotUnit,
        normUnitKnown: true,
      },
    };
  }

  // Вердикт по заведомо неполной приёмке НЕ ПУБЛИКУЕТСЯ: знаменатель занижен, и красный процент
  // кричал бы громче любой оговорки рядом. Отказ стоит ПОСЛЕ структурных (no-usage, единицы) —
  // те не лечатся вводом, и обещать «появится после ввода» при отсутствующей норме было бы ложью.
  if (per.missingSizes.length > 0 || per.unreportedLays.length > 0) {
    return {
      ok: false,
      refusal: {
        kind: 'incomplete-receipts',
        sizeIds: per.missingSizes,
        lays: per.unreportedLays,
      },
    };
  }

  // Веса — только размеры с выкроенным > 0: нулевое выкроено ничего не весит (посчитан этот ноль
  // или не заполнен — весов он не даёт), и норма на него не нужна (нулевой вес не тянет в отказ
  // «нет нормы для размера»).
  const weights = per.cutBySize.filter((w) => w.cut > 0);
  const missing: number[] = [];
  const sources = new Set<string>();
  let grossed = false;
  let weightedSum = 0;
  let weightSum = 0;
  for (const w of weights) {
    let total = 0;
    let found = false;
    for (const row of norm.usageRows) {
      // Пер-размерная норма, иначе скаляр «на изделие» — порядок источников тот же, что в
      // рецептуре; строка, не отвечающая за этот размер ничем, просто молчит.
      const perSize = row.perSize.find((p) => p.sizeId === w.sizeId);
      const base = perSize ? perSize.consumption : row.scalar;
      if (base == null) continue;
      found = true;
      const src = row.source === '' ? 'manual' : row.source;
      sources.add(src);
      if (src === 'marker') {
        total += base;
      } else {
        if (norm.wastagePct == null) {
          return { ok: false, refusal: { kind: 'no-wastage', sourceLabel: sourceLabelOf(src) } };
        }
        grossed = true;
        total += base * (1 + norm.wastagePct / 100);
      }
    }
    if (!found) {
      missing.push(w.sizeId);
      continue;
    }
    weightedSum += total * w.cut;
    weightSum += w.cut;
  }
  if (missing.length > 0) return { ok: false, refusal: { kind: 'no-size-norm', sizeIds: missing } };

  const inSlotUnits = weightedSum / weightSum;
  const normPerUnit = slotKind === 'cm' ? inSlotUnits / 100 : inSlotUnits;
  if (!(normPerUnit > 0)) return { ok: false, refusal: { kind: 'zero-norm' } };

  return {
    ok: true,
    normPerUnit,
    unitLabel: KIND_UNIT[per.kind],
    deltaPct: (per.perCut / normPerUnit - 1) * 100,
    grossed,
    partlyGrossed: grossed && sources.has('marker'),
    wastagePct: norm.wastagePct,
    sourceLabel: [...sources].map(sourceLabelOf).join(' + '),
    weighted: weights.length > 1,
  };
}

// ── ОТЧЁТ ЦЕЛИКОМ — то, что экраны получают одним значением ─────────────────────────────

export type ClothReport = { perUnit: ClothPerUnit; norm: NormComparison | null };

/**
 * norm === undefined значит «карточка ещё не приехала» — сравнение молчит, а НЕ отказывает:
 * отказ «нормы нет» на недогруженной карточке был бы ложью. 'card-failed' — карточка не приехала
 * и УЖЕ НЕ ЕДЕТ (запрос упал): здесь молчать нельзя, оно неотличимо от вечной загрузки, поэтому
 * ошибка называется словами. Отказ по-настоящему отсутствующей нормы приходит из compareToNorm,
 * когда карточка есть.
 */
export function buildClothReport(
  lays: LayClothInput[],
  frozen: boolean,
  norm?: NormInput | 'card-failed',
): ClothReport {
  const perUnit = clothPerUnit(lays, frozen);
  if (!perUnit.ok || !norm) return { perUnit, norm: null };
  return {
    perUnit,
    norm:
      norm === 'card-failed'
        ? { ok: false, refusal: { kind: 'card-failed' } }
        : compareToNorm(perUnit, norm),
  };
}

// ── ФОРМАТ И СЛОВА — одни на оба экрана, чтобы отказ назывался одинаково ────────────────

/** DECIMAL-хвосты не показываются, значение не округляется дальше тысячных (колонка норм — 10,3). */
export const fmtQty = (n: number): string => String(Number(n.toFixed(3)));

/** Классификация по УЖЕ ОКРУГЛЁННОМУ числу — тот же приём, что DriftRow: «+0.0%» не бывает. */
export function fmtDeltaPct(n: number): { text: string; over: boolean } {
  const shown = Number(n.toFixed(1));
  const sign = shown > 0 ? '+' : shown < 0 ? '−' : '';
  return { text: `${sign}${Math.abs(shown).toFixed(1)}%`, over: shown > 0 };
}

/** Длинное объяснение необратимости — одно на все места, где о ней приходится говорить. */
export const FROZEN_FACT_NOTE =
  "recording the consumption actual is closed by the run status, while the cut receipt stays editable even on a closed run: the denominator is still being refined, but the numerator will never appear — “per garment” for this lay will never be computed.";

export function clothRefusalText(r: ClothRefusal, ctx: { pair?: boolean } = {}): string {
  switch (r.kind) {
    case 'no-fact': {
      if (ctx.pair) {
        return `not computed: there is no cloth measurement for “${r.lays.join('”, “')}” — an aggregate over part of the pair's lays would give a number about nothing${
          r.frozen ? '; recording the actual is closed by the run status, and that will no longer change' : ''
        }`;
      }
      return r.frozen
        ? "the cloth measurement isn't entered — and can't be entered any more: recording the actual is closed by the run status"
        : "the cloth measurement isn't entered";
    }
    case 'mixed-units':
      return `measurements in units that don't reconcile (${r.units.join(', ')}) — cloth in different units can't be added up`;
    case 'no-receipts':
      return ctx.pair
        ? "the cutting for the pair's lays isn't reported — there is nothing to divide by"
        : "the cutting for this lay isn't reported — there is nothing to divide by";
    case 'zero-cut':
      // «Посчитанный ноль» не утверждается: пустое поле формы уезжает нулём (cut_qty NOT NULL), и
      // сохранённая строка не различает «посчитали, вышло 0» и «не заполнили».
      return "cut stands at zero — cloth was spent, no garments recorded; whether that is a counted zero or an unfilled field, the saved row doesn't distinguish";
  }
}

export function normRefusalText(r: NormRefusal, sizeLabel: (id: number) => string): string {
  switch (r.kind) {
    case 'fact-unit':
      return `the actual is neither length nor mass (“${r.unitLabel}”) — it isn't compared with the norm`;
    case 'no-usage':
      return 'the recipe has no norm for the pair (colourway · slot) — there is nothing to compare with';
    case 'no-size-norm':
      return `the recipe has no norm for the sizes: ${r.sizeIds.map(sizeLabel).join(', ')}`;
    case 'no-wastage':
      return `the norm (${r.sourceLabel}) is without cutting waste, and the slot's wastage percent is not set: net against the actual always looks like a failure, and that would be a property of the empty percent, not of production`;
    case 'zero-norm':
      return 'the norm is zero — the comparison is undefined';
    case 'incomplete-receipts': {
      const parts = [
        r.sizeIds.length > 0 ? `no rows for the sizes: ${r.sizeIds.map(sizeLabel).join(', ')}` : '',
        r.lays.length > 0 ? `lay not reported: “${r.lays.join('”, “')}”` : '',
      ]
        .filter(Boolean)
        .join('; ');
      return `the receipt is incomplete (${parts}) — the denominator is understated, and there is nothing to compare with the norm yet: a verdict on incomplete data is worse than no verdict, the percent will appear once it's entered`;
    }
    case 'card-failed':
      return "the tech card didn't load — there is nowhere to take the norm from; refresh the page";
    case 'unit-mismatch':
      // Пустая единица слота — своё сообщение со своей починкой: единица нормы = единица слота,
      // и только (тем же правилом живёт тех-карта — фолбэка в единицу артикула нет нигде).
      // Починка называется адресно: заполнить единицу на вкладке BOM, а не менять что-то здесь.
      return r.normUnitKnown
        ? `the actual is in ${r.factUnit}, the slot norm is in “${r.normUnit}” — not convertible: the conversion needs the cloth's width and density, which is a different question with a different owner`
        : r.normUnit
          ? `the slot's norm unit (“${r.normUnit}”) accepts neither length nor mass — the comparison is undefined`
          : "the BOM slot has no unit filled in — the norm lives in the slot's unit, and there is nothing to compare it in; fill the unit in on the tech card's BOM tab";
  }
}
