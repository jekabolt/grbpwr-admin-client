// ИСТОРИЯ ЖЕСТОВ — чистая половина отмены. Глубина здесь БОЛЬШЕ ОДНОЙ: ⌘Z несколько раз подряд,
// ⇧⌘Z обратно.
//
// ОТМЕНА ЗДЕСЬ — ИНВЕРСИЯ ЖЕСТА, А НЕ СНИМОК ФОРМЫ. Снимки отвергнуты в том числе потому, что
// «undo возвращает больше, чем жест»: человек создал шаг, дописал в него заметку, нажал ⌘Z — и
// снимок унёс бы и заметку. Инверсия отменяет ровно то, что жест сделал, и ничего больше. Правки
// ПОЛЕЙ шага в историю не попадают вовсе: у текстового поля есть родная отмена браузера, и
// перехват ⌘Z в поле её убил бы.
//
// ДВА РОДА ЗАПИСЕЙ, ДВА ХРАНИЛИЩА, И СМЕШИВАТЬ ИХ В ОДНОЙ ЗАПИСИ ЗАПРЕЩЕНО:
//
//   род        что инвертирует                         где правда
//   ────────── ─────────────────────────────────────── ────────────────────────────────────────
//   append     удаление строки + возврат assemblyCleared  форма (RHF)
//   dissolve   два setValue назад                         форма (RHF)
//   move       возврат оверрайдов раскладки               localStorage, презентация
//
// Запись, трогающая оба хранилища сразу, означала бы, что отмена ПЕРЕСТАНОВКИ правит форму, — то
// есть перетаскивание ноды начинает просить сохранение. Раскладка мимо RHF — инвариант с Ф3, и
// история не имеет права его сломать.
//
// ОТСЮДА ЖЕ ПО-РОДОВОЙ ГЕЙТ ЗАМОРОЗКИ: на выпущенной карточке (R10) раскладывать МОЖНО, править
// нельзя. Значит отмена рода `move` обязана работать на frozen, а формовая — отказывать словами.
// Скопом резать нельзя: это ровно та ошибка, из-за которой владелец не мог вернуть подвинутый
// блок на выпущенной карточке.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ЧИСТЫЙ МОДУЛЬ. Тест-раннера у клиента нет, а ошибки этой арифметики тихие и
// разрушительные:
//
//   • ЗАПИСЬ, НЕ ДОЖДАВШАЯСЯ id. `append()` из RHF ничего не возвращает, а `fields` в замыкании
//     мутатора — снимок ДО вставки: `fields[at]?.id` там всегда `undefined`. Записанный синхронно
//     `fieldId` навсегда не совпадёт ни с чем, guard будет вечно отказывать, и отмена окажется
//     мёртвой кнопкой, которая при этом выглядит живой.
//   • GUARD, КОТОРЫЙ РЕШИЛИ НЕ ПИСАТЬ. Индекс сам по себе ничего не удостоверяет: после
//     перестановки строк `removeOperation(index)` удалит ЧУЖОЙ шаг — молча и без единого следа.
//     Поэтому формовая запись держит `fieldId` строки (RHF выдаёт новые id при ресете формы после
//     save), и сверка идёт по нему, а индекс остаётся только адресом. Записи рода `move` от
//     ресета формы не зависят вовсе — они ключуются кодом узла или детали.
//
// Ни React, ни DOM: на вход — история и текущий массив строк, на выход — новая история и ответ
// «да/нет». Проба — `scripts/last-mutation-probe.mjs`.

/** Минимум, который модулю нужен от строки `useFieldArray`: её устойчивый идентификатор. */
export type FieldRow = { id: string };

/** Точка раскладки в координатах мира схемы. */
export type Pos = { x: number; y: number };

/**
 * Одна правка ручной раскладки. `at: null` — СНЯТЬ оверрайд, а не поставить нулевую позицию:
 * ноды, которую человек никогда не двигал, в хранилище нет вовсе, и её место считает
 * авто-раскладка. Отмена первого перетаскивания обязана вернуть именно это состояние, иначе нода
 * навсегда останется приколоченной там, где её однажды поставила инверсия.
 */
export type PosEdit = { key: string; at: Pos | null };

/**
 * Состоявшийся жест, который ⌘Z умеет обратить, а ⇧⌘Z — повторить.
 *
 * `label` — имя жеста ЧЕЛОВЕЧЕСКИМИ словами, посчитанное в момент записи, а не при показе: к
 * моменту показа узла уже может не быть (его растворили), а чип обязан называть то, что отменяет.
 *
 * `TRow` — строка формы, как её принимает `append`. Модуль о ней ничего не знает и знать не
 * должен: он только возит её от жеста к его повтору.
 */
export type HistoryEntry<TRow = unknown> =
  | {
      kind: 'move';
      /** Что подать в `restore`, чтобы вернуть раскладку к состоянию ДО жеста. */
      back: PosEdit[];
      /** …и что подать, чтобы повторить жест. Обе половины считает писатель предпочтений. */
      forward: PosEdit[];
      label: string;
    }
  | {
      kind: 'append';
      index: number;
      fieldId: string;
      /** Строка, которую жест дописал. Нужна повтору: ⇧⌘Z дописывает ЕЁ ЖЕ, а не пустую. */
      row: TRow;
      label: string;
      /**
       * Значение `assemblyCleared` ДО жеста — есть только у жеста, который этот флаг ПЕРЕЗАПИСАЛ
       * (`appendStep` с узлом гасит намерение «снять разметку»). Инверсия обязана вернуть и его:
       * сценарий «снял разметку → сшил → ⌘Z» без отката флага молча терял намерение снятия, и
       * следующее сохранение не доносило его до сервера.
       */
      clearedBefore?: boolean;
    }
  | {
      kind: 'dissolve';
      index: number;
      fieldId: string;
      /** Значения ДО обнуления — их и возвращает отмена. */
      unitKey: string;
      unitName: string;
      label: string;
    };

/** Две стопки: чем дальше в конце, тем свежее. Вершина обеих — последний элемент. */
export type History<TRow = unknown> = {
  undo: HistoryEntry<TRow>[];
  redo: HistoryEntry<TRow>[];
};

/**
 * Потолок глубины. Не ради памяти: «отменить всё до начала сессии» — обещание, которого система не
 * держит после save (формовые записи там умирают все разом), и давать его не надо.
 */
export const HISTORY_DEPTH = 50;

export function emptyHistory<TRow = unknown>(): History<TRow> {
  return { undo: [], redo: [] };
}

/** Срезать самое СТАРОЕ: вытесняется дно стопки, а не вершина. */
function trim<TRow>(stack: HistoryEntry<TRow>[]): HistoryEntry<TRow>[] {
  return stack.length > HISTORY_DEPTH ? stack.slice(stack.length - HISTORY_DEPTH) : stack;
}

/** Запись рода `move` живёт в презентации, всё остальное — в форме. Разделение несущее. */
export function isFormEntry<TRow>(e: HistoryEntry<TRow>): boolean {
  return e.kind !== 'move';
}

/**
 * НОВЫЙ ЖЕСТ. Гасит стопку возврата: после нового жеста «вперёд» ведёт уже не туда, откуда ушли, и
 * ⇧⌘Z повторил бы работу поверх изменившегося ряда строк.
 */
export function record<TRow>(h: History<TRow>, e: HistoryEntry<TRow>): History<TRow> {
  return { undo: trim([...h.undo, e]), redo: [] };
}

/**
 * Вернуть запись в стопку отмены, НЕ ТРОГАЯ стопку возврата. Нужно ровно повтору создания: он
 * ходит через `append`, а значит новый `fieldId` приезжает только вторым тактом, и запись
 * возвращается на место позже самого жеста.
 */
export function pushUndo<TRow>(h: History<TRow>, e: HistoryEntry<TRow>): History<TRow> {
  return { undo: trim([...h.undo, e]), redo: h.redo };
}

export function peekUndo<TRow>(h: History<TRow>): HistoryEntry<TRow> | null {
  return h.undo.length ? h.undo[h.undo.length - 1] : null;
}

export function peekRedo<TRow>(h: History<TRow>): HistoryEntry<TRow> | null {
  return h.redo.length ? h.redo[h.redo.length - 1] : null;
}

/** Шаг назад состоялся: вершина отмены переезжает в стопку возврата. */
export function undoStep<TRow>(h: History<TRow>): History<TRow> {
  const e = peekUndo(h);
  if (!e) return h;
  return { undo: h.undo.slice(0, -1), redo: trim([...h.redo, e]) };
}

/** Шаг вперёд состоялся: вершина возврата переезжает обратно в отмену. */
export function redoStep<TRow>(h: History<TRow>): History<TRow> {
  const e = peekRedo(h);
  if (!e) return h;
  return { undo: trim([...h.undo, e]), redo: h.redo.slice(0, -1) };
}

/** Снять вершину возврата, никуда её не кладя (повтор создания вернёт её сам, вторым тактом). */
export function dropRedoTop<TRow>(h: History<TRow>): History<TRow> {
  return h.redo.length ? { undo: h.undo, redo: h.redo.slice(0, -1) } : h;
}

/**
 * СМЕРТЬ ФОРМОВЫХ ЗАПИСЕЙ, ЖИЗНЬ РАСКЛАДОЧНЫХ. Это и есть все десять точек сброса разом: массив
 * поехал (перестановка, удаление, генератор), в доке начали печатать, карточку выпустили, закрыли
 * фулскрин. Раскладка ни одним из этих событий не затронута — её записи обязаны пережить все.
 *
 * Возвращает ТОТ ЖЕ объект, когда сбрасывать нечего: точку сброса №8 дёргает каждый `focusin` в
 * доке, и новая история на каждое касание поля означала бы ре-рендер редактора на каждое касание.
 */
export function dropForm<TRow>(h: History<TRow>): History<TRow> {
  const undo = h.undo.filter((e) => !isFormEntry(e));
  const redo = h.redo.filter((e) => !isFormEntry(e));
  if (undo.length === h.undo.length && redo.length === h.redo.length) return h;
  return { undo, redo };
}

/**
 * Обратное: сброс РАСКЛАДКИ («reset layout», единственное подтверждение в системе — R8) уносит все
 * ручные позиции сразу. Отмена одного давнего перетаскивания после него вернула бы ОДНУ ноду в
 * место, которого на экране больше нигде нет, — это не «отменил», а «поломал заново».
 */
export function dropMove<TRow>(h: History<TRow>): History<TRow> {
  const undo = h.undo.filter(isFormEntry);
  const redo = h.redo.filter(isFormEntry);
  if (undo.length === h.undo.length && redo.length === h.redo.length) return h;
  return { undo, redo };
}

/**
 * Полузапись append: `fieldId` ещё не известен.
 *
 * Живёт ровно один такт — от вызова мутатора до ближайшего эффекта на `[fields]`, где RHF уже
 * отдал новую строку с настоящим id. `expectedLength` — сверка того, что дозаполняется ИМЕННО тот
 * append: между мутатором и эффектом мог успеть пройти чужой апдейт (генератор заменил весь
 * список), и дозаполнить в этом случае значило бы записать id постороннего шага.
 *
 * `redone` — этот append есть ПОВТОР (⇧⌘Z), и его запись обязана лечь в стопку отмены, не гася
 * стопку возврата: иначе ⇧⌘Z, нажатое трижды, вернуло бы только один жест.
 */
export type PendingAppend<TRow = unknown> = {
  kind: 'append';
  index: number;
  expectedLength: number;
  row: TRow;
  label: string;
  /** См. `HistoryEntry.clearedBefore`: снимается в мутаторе, вторым тактом только переносится. */
  clearedBefore?: boolean;
  redone?: boolean;
};

/** Подпись жеста создания. Номер ЭКРАННЫЙ — `(i + 1) * 10`, как на рельсе и в боксах. */
export function appendLabel(index: number): string {
  return `create step ${(index + 1) * 10}`;
}

/** Подпись жеста растворения. */
export function dissolveLabel(unitKey: string): string {
  return `dissolve ▣ ${unitKey}`;
}

/**
 * Подпись жеста раскладки. СЧЁТОМ, а не именем ноды: мультидраг и стрелки двигают сколько угодно
 * нод сразу, и «move ▣ SHELL» у жеста из четырёх нод было бы прямой неправдой.
 */
export function moveLabel(count: number): string {
  return `move ${count} ${count === 1 ? 'node' : 'nodes'}`;
}

/**
 * Дозаполнить полузапись по свежему массиву строк.
 *
 * `null` — «этот append дозаполнить нечем»: длина массива не та, которую жест обещал, или строки
 * по адресу нет вовсе. Вызывающий обязан прочитать `null` как ОТКАЗ ОТ ЗАПИСИ, а не как «попробую
 * в следующий раз»: протухшая полузапись переживёт чужую мутацию и дозаполнится идентификатором
 * шага, которого никто не создавал.
 */
export function resolvePending<TRow>(
  p: PendingAppend<TRow>,
  fields: FieldRow[],
): HistoryEntry<TRow> | null {
  if (fields.length !== p.expectedLength) return null;
  const id = fields[p.index]?.id;
  if (!id) return null;
  return {
    kind: 'append',
    index: p.index,
    fieldId: id,
    row: p.row,
    label: p.label,
    ...(p.clearedBefore !== undefined ? { clearedBefore: p.clearedBefore } : {}),
  };
}

/**
 * Можно ли ещё обратить записанный жест.
 *
 * ГЛАВНАЯ ПРОВЕРКА — ТОЖДЕСТВО СТРОКИ, а не её наличие. `fields[index].id` меняется у RHF при
 * каждом ресете формы (то есть после каждого успешного save) и при `replace()` — и отмена, судящая
 * по индексу, после сохранения удалила бы шаг из СОХРАНЁННОЙ карточки, а после перестановки —
 * чужой шаг из текущей.
 *
 * Для растворения к тождеству добавляется вопрос «узел всё ещё растворён»: если после записи шагу
 * вернули выход руками или новым жестом, возвращать старый код поверх — значит переписать работу,
 * а не отменить свою.
 *
 * Раскладка не спрашивается ни о чём: она не адресуется индексом строки и ресет формы её не
 * касается. Ноды, которой больше нет, отмена не найдёт — оверрайд без ноды никого не двигает.
 */
export function canUndo<TRow>(
  rec: HistoryEntry<TRow>,
  fields: FieldRow[],
  getOutputUnitKey: (index: number) => string,
): boolean {
  if (rec.kind === 'move') return true;
  if (rec.index < 0) return false;
  if (fields[rec.index]?.id !== rec.fieldId) return false;
  if (rec.kind === 'append') return true;
  return getOutputUnitKey(rec.index).trim() === '';
}

/**
 * Можно ли повторить отменённый жест (⇧⌘Z).
 *
 * У создания щит ДРУГОЙ, и это не небрежность: отменённой строки в форме больше нет, тождества по
 * `fieldId` спрашивать не у чего. Создание всегда дописывает В КОНЕЦ, поэтому единственное, что
 * удостоверяет «ряд строк тот же, что был сразу после отмены», — длина, равная адресу записи.
 * Разошлась длина — значит между ⌘Z и ⇧⌘Z массив трогали, и повтор дописал бы строку не туда.
 *
 * У растворения — зеркало щита отмены: узел на месте и это ТОТ ЖЕ код. Иначе ⇧⌘Z растворил бы
 * узел, которого запись не растворяла.
 */
export function canRedo<TRow>(
  rec: HistoryEntry<TRow>,
  fields: FieldRow[],
  getOutputUnitKey: (index: number) => string,
): boolean {
  if (rec.kind === 'move') return true;
  if (rec.index < 0) return false;
  if (rec.kind === 'append') return fields.length === rec.index;
  if (fields[rec.index]?.id !== rec.fieldId) return false;
  return getOutputUnitKey(rec.index).trim() === rec.unitKey;
}

/**
 * Подпись чипа отмены. Чип обязан НАЗЫВАТЬ жест: «undo» в одиночку не отличает «сейчас исчезнет
 * созданный шаг» от «сейчас вернётся растворённый узел», а цена у этих двух разная.
 */
export function undoTitle<TRow>(rec: HistoryEntry<TRow> | null): string {
  return rec ? `undo — ${rec.label}` : 'nothing to undo';
}

/** То же для возврата. */
export function redoTitle<TRow>(rec: HistoryEntry<TRow> | null): string {
  return rec ? `redo — ${rec.label}` : 'nothing to redo';
}
