import type { common_TechCardColorwayUsage } from 'api/proto-http/admin';
import { decimalToInput, inputToDecimal } from 'utils/decimal';

import { wireInt } from './wire-int';

/**
 * ═══ СТРОКА РЕЦЕПТА КОЛОРВЕЯ — ЧТЕНИЕ, ПРОВОД И «ЧТО УЕДЕТ»: ОДНИ ПРАВИЛА НА ДВУХ ПИСАТЕЛЕЙ ══════
 *
 * Рецепт колорвея пишут двое: вкладка COLORWAYS (`colorway-recipe.tsx`) и подтверждение колорвея,
 * предложенного черновиком студии (`design/colourway-proposals.tsx`, ревью Codex O-44). Запись —
 * ПОЛНАЯ ЗАМЕНА строк, поэтому оба обязаны отправлять одно и то же: как строка читается
 * (`fromRead`), как уходит на провод (`toWire`), какая строка не уходит вовсе (`savableUsage`) и с
 * чего начинается новая (`blankDraft`). Всё это перенесено сюда из вкладки ДОСЛОВНО: второе
 * описание любого из этих правил разошлось бы с первым молча, и расхождение стоило бы чужих строк
 * рецепта при полной замене.
 */

/** Строка BOM так, как её видит чтение рецепта: серверный id и ключ строки. */
export type UsageBomRef = { id?: number; lineKey?: string };
/** Деталь кроя так, как её видит чтение рецепта: серверный id и ключ детали. */
export type UsagePieceRef = { id: number; lineKey: string };

export type UsageDraft = {
  bomLineKey: string;
  materialId: number;
  // placement/color/pantone predate article pinning and are round-tripped for legacy rows only —
  // no input renders them: the colour/pantone live on the effective article, the "where" on the
  // piece link. placement is still primed to the piece name on add for the PDF and legacy readers.
  placement: string;
  color: string;
  pantone: string;
  consumption: string;
  quantity: string;
  // preserved verbatim across the full-replace so a save never drops per-size grading / piece links.
  sizeConsumptions: { sizeId?: number; consumption?: string }[];
  pieceLineKey: string;
  // display-only (server-computed, stripped without costing:read).
  lineTotal: string;
  // Wastage provenance (0261). 'marker' = the norm came from a saved раскладка and its measured
  // length ALREADY contains the cutting waste, so costing must not gross it up again; '' =
  // typed by hand and the article's wastage_percent applies as before. The two pcts are the
  // display decomposition of a marker norm's waste (кромка / межлекальные выпады) and are NEVER
  // multiplied into a cost — they only explain where the length went.
  //
  // `undefined` is a THIRD state and not the same as '': it means this draft does not know the
  // provenance, and the field must then be OMITTED on the wire so the store carries the stored
  // triple forward. It arises only from a staged draft persisted by a build that predates these
  // fields — asserting '' there would silently downgrade every marker row to manual on restore.
  consumptionSource: string | undefined;
  wasteSelvedgePct: string;
  wasteCutPct: string;
  // Ф6.8 ШТАМП НОРМЫ: из КАКОЙ раскладки применён этот расход. `undefined` — то же ТРЕТЬЕ
  // состояние, что у consumptionSource выше, и по той же причине: «черновик не знает» обязано
  // ОПУСКАТЬ поле на проводе, чтобы полная замена строк не стёрла аудит, который этот клиент
  // просто не читал. 0 — явное «штампа нет» (пер-размерная норма, см. marker-apply).
  normMarkerId: number | undefined;
  // ПОКАЗ ТОЛЬКО. Серверная отметка «когда норму применили»: клиент её НЕ ШЛЁТ НИКОГДА, ровно
  // как labDipSubmittedAt и lineTotal. Нужна ей одна вещь — сравниться с updatedAt раскладки и
  // сказать, не перемеряли ли ту после применения.
  normAppliedAt: string | undefined;
};

// The provenance triple travels together: a norm is either marker-measured (with its
// decomposition) or hand-typed (with none). Retyping a number by hand makes it manual — leaving
// it marked «marker» would keep costing from applying the article's wastage to a figure that no
// longer contains any.
//
// normMarkerId (Ф6.8) НАРОЧНО НЕ ВХОДИТ В ЭТУ ТРОЙКУ. Демотацию в ручной режим сервер трактует
// сам: пришедший consumption_source='' снимает и штамп, и его дату. Дублировать здесь нулём
// значило бы завести второе место, которое обязано согласоваться с первым, — а строке нужно
// ровно обратное: пусть решает одна сторона.
export const MANUAL_PROVENANCE = {
  consumptionSource: '',
  wasteSelvedgePct: '',
  wasteCutPct: '',
} as const;

// Resolve a stored usage into a draft. bom_line_key is the durable ref; fall back to resolving the
// server bom_item_id against the saved BOM lines so a legacy usage still points at the right line.
export function fromRead(
  u: common_TechCardColorwayUsage,
  bomItems: readonly UsageBomRef[],
  pieces: readonly UsagePieceRef[],
): UsageDraft {
  const bomItemId = wireInt(u.bomItemId);
  const byId = bomItemId ? bomItems.find((b) => b.id === bomItemId)?.lineKey : undefined;
  const piecesById = new Map(pieces.filter((piece) => piece.id).map((piece) => [piece.id, piece]));
  return {
    bomLineKey: u.bomLineKey || byId || '',
    materialId: wireInt(u.materialId),
    placement: u.placement || '',
    color: u.color || '',
    pantone: u.pantone || '',
    consumption: decimalToInput(u.consumption),
    quantity: decimalToInput(u.quantity),
    sizeConsumptions: (u.sizeConsumptions ?? []).map((s) => ({
      sizeId: s.sizeId,
      consumption: decimalToInput(s.consumption),
    })),
    pieceLineKey: u.pieceLineKey || piecesById.get(wireInt(u.pieceId))?.lineKey || '',
    lineTotal: decimalToInput(u.lineTotal),
    // The server normalises '' to 'manual', so a row this client has saved once reads back as
    // 'manual' while a hand edit writes ''. Both mean the same thing, and leaving them distinct
    // made a no-op edit (type 1.5 over 1.5) differ from its baseline signature and claim a
    // staged change that does not exist. Normalise on the way IN, one spelling from here on.
    consumptionSource: u.consumptionSource === 'manual' ? '' : u.consumptionSource || '',
    wasteSelvedgePct: decimalToInput(u.wasteSelvedgePct),
    wasteCutPct: decimalToInput(u.wasteCutPct),
    // Ф6.8, ОБА ДОСЛОВНО. Штамп не нормализуется в 0: отсутствие поля — это «сервер ничего не
    // сказал», и ровно оно обязано вернуться на провод отсутствием, иначе полная замена строк
    // сотрёт чужой аудит. Отметка времени читается только чтобы её показать.
    normMarkerId: u.normMarkerId,
    normAppliedAt: u.normAppliedAt,
  };
}

export function toWire(d: UsageDraft): common_TechCardColorwayUsage {
  return {
    // durable ref (§2.3); the server resolves it to the real FK — positional index/id not sent.
    bomLineKey: d.bomLineKey || '',
    bomItemIndex: undefined,
    bomItemId: undefined,
    // Presence is intentional: 0 clears a pin and means “inherit the slot default”. Omitting this
    // on a full-replace write would preserve an old pin server-side instead of round-tripping the
    // editor's current state.
    materialId: d.materialId || 0,
    placement: d.placement.trim(),
    color: d.color.trim(),
    pantone: d.pantone.trim(),
    consumption: inputToDecimal(d.consumption),
    quantity: inputToDecimal(d.quantity),
    // ПУСТАЯ ЯЧЕЙКА РАЗМЕРА — ЭТО «НОРМЫ НЕТ», А НЕ ПОВОД УРОНИТЬ СОХРАНЕНИЕ. Раньше строка
    // отправлялась с consumption=undefined, и сервер отвечал «consumption must be a non-negative
    // number» на ВЕСЬ рецепт — то есть стёртая ячейка на одной ткани хоронила сохранение колорвея
    // целиком, причём сообщением, в котором не видно ни размера, ни слота. С приходом «по выкройкам»
    // пер-размерные строки становятся обычным делом, а «стереть ячейку и передумать» — обычным
    // жестом. Не отправить строку значит сказать ровно то, что оператор сделал: у этого размера
    // нормы нет (план подставит скаляр, если он есть, и честно откажет, если нет).
    sizeConsumptions: (d.sizeConsumptions ?? [])
      .filter((s) => s.sizeId && (s.consumption ?? '').trim() !== '')
      .map((s) => ({ sizeId: s.sizeId, consumption: inputToDecimal(s.consumption) })),
    pieceLineKey: d.pieceLineKey || '',
    pieceId: undefined,
    pieceIndex: undefined,
    // Wastage provenance (0261). Sent VERBATIM, including undefined: presence is what tells the
    // store «write what I say» instead of «preserve what you stored», so '' is a deliberate
    // reset to manual and undefined is «I don't know, keep yours». JSON.stringify drops the key
    // for undefined, which is exactly the carry-forward the store expects from a stale client —
    // and a draft restored from a pre-0261 snapshot IS one.
    consumptionSource: d.consumptionSource,
    wasteSelvedgePct: inputToDecimal(d.wasteSelvedgePct),
    wasteCutPct: inputToDecimal(d.wasteCutPct),
    // Ф6.8 ШТАМП НОРМЫ — ТОЧНО ТА ЖЕ ДИСЦИПЛИНА, ЧТО У consumptionSource ВЫШЕ, И ПО ТОЙ ЖЕ
    // ПРИЧИНЕ: дословно, включая undefined. JSON.stringify выбрасывает ключ со значением
    // undefined, и сервер читает ОТСУТСТВИЕ как «сохрани что было», а явный 0 — как «сними
    // штамп». Черновик, восстановленный из снимка сборки, которая про штамп не знала, — это
    // ровно тот случай, ради которого различие и заведено: подставить сюда 0 значило бы стереть
    // аудит применения на первом же сохранении соседнего поля.
    normMarkerId: d.normMarkerId,
    // output-only — never sent
    lineTotal: undefined,
    sizeRunTotal: undefined,
    // Отметку применения ставит СЕРВЕР и только при смене пары (источник, раскладка). Прислать
    // её отсюда значило бы обновлять её на каждом сохранении рецепта — то есть ГАСИТЬ индикатор
    // расхождения правкой любого соседнего поля.
    normAppliedAt: undefined,
  };
}

// ПУСТАЯ ВО ВСЕХ ПОЛЯХ СТРОКА «НА ИЗДЕЛИЕ» — ЭТО НЕ СТРОКА. Ни расхода, ни количества, ни одной
// непустой ячейки размера, ни пина артикула: сохранять её значит завести на сервере запись, которая
// ничего не утверждает, но участвует в суммировании строк слота и в счётчиках экрана.
//
// Такая строка РОЖДАЕТСЯ ЗАКОННО и живёт на экране: нажатие «по размерам» на пустой карточке
// открывает сетку из пустых клеток — в неё сейчас будут печатать, и не дать ей появиться значило
// бы, что кнопка ничего не делает. Но до провода она доехать не имеет права, поэтому фильтр стоит
// на выходе (savableUsage), а не на входе.
//
// СТРОКА ДЕТАЛИ ПУСТОЙ НЕ БЫВАЕТ НИКОГДА, и это не оговорка, а весь смысл решения владельца
// (2026-08-10): её содержание — сама привязка «эта деталь кроится из этой ткани», а чисел она не
// несёт ПО УСТРОЙСТВУ. Посчитать её пустой значило бы, что каждое «назначить детали» тихо
// выбрасывается при сохранении, — то есть ровно тот дефект, из-за которого владелец назначил ткань
// девяти деталям и не увидел ничего.
function isBlankUsage(u: UsageDraft): boolean {
  if (u.pieceLineKey) return false;
  return (
    !u.consumption.trim() &&
    !u.quantity.trim() &&
    !u.sizeConsumptions.some((s) => (s.consumption ?? '').trim()) &&
    !u.materialId &&
    // ЛЕГАСИ-ПОЛЯ ТОЖЕ СОДЕРЖИМОЕ, и это не педантизм: строка, у которой заполнено только
    // размещение или цвет/пантон, — это то, что человек однажды напечатал, а «пустая» строка
    // отсюда уезжает не в никуда, а под нож полной замены. Новую строку это не воскрешает:
    // patchGarmentSlot рождает её с пустым placement (изделие одно, подставлять туда нечего),
    // так что проверка «ничего не изменилось» по-прежнему ловит холостое нажатие.
    !u.placement.trim() &&
    !u.color.trim() &&
    !u.pantone.trim()
  );
}

// ЧТО ВООБЩЕ УЕДЕТ НА СЕРВЕР. Одно правило на два места — на сам список записи и на счётчик правок:
// разойдись они, карточка либо обещала бы сохранить то, что выбросит, либо вечно висела бы
// «staged» из-за строки, которую всё равно не отправляет.
//
// Строка без bom_line_key не отправляется, потому что отправить её НЕЧЕМ: полная замена
// валидирует каждую строку, а неразрешимая ссылка роняет весь рецепт. Это НЕ безобидно — такая
// строка на сервере есть, и сохранение её удалит; экран обязан сказать это вслух (см. раздел
// «строки без слота»), а не тихо считать её сохранённой.
export function savableUsage(u: UsageDraft): boolean {
  return !!u.bomLineKey && !isBlankUsage(u);
}

// A fresh usage for a piece that has none yet: no fabric, its placement primed to the piece name so
// the PDF and legacy readers still get a human label the moment a fabric is picked.
export function blankDraft(pieceLineKey: string, placement: string): UsageDraft {
  return {
    bomLineKey: '',
    materialId: 0,
    placement,
    color: '',
    pantone: '',
    consumption: '',
    quantity: '',
    sizeConsumptions: [],
    pieceLineKey,
    lineTotal: '',
    ...MANUAL_PROVENANCE,
    // Новая строка ничего ниоткуда не применяла, и сказать это можно ЯВНО: сохранять здесь нечего
    // (на сервере такой строки ещё нет), а 0 читается тем же правилом, что и везде, — «штампа нет».
    normMarkerId: 0,
    normAppliedAt: undefined,
  };
}
