import type { common_TechCardColorwayUsage } from 'api/proto-http/admin';

import {
  foldToken,
  normText,
  type ConstructionDraft,
} from './head/construction-draft-model';

/**
 * ПРЕДЛОЖЕННЫЕ КОЛОРВЕИ — РАЗБОР, ПРИВЯЗКА И ВОРОТА, БЕЗ ЕДИНОЙ СТРОКИ ЭКРАНА (B-25 круга 20).
 *
 * Владелец, дословно: «я хочу что бы DRAFT OF THE CONSTRUCTION могло предложить мне создать
 * несколько колорвеев и это было отдельным блоком где мы могли бы выбрать какие цвета по пантонам
 * может что-то еще и что бы если мы вконфирмили этот колорвей появлялся далее уже во вкладке
 * колорвей».
 *
 * ═══ ЧЕМ ЭТОТ БЛОК ОТЛИЧАЕТСЯ ОТ ВСЕГО ОСТАЛЬНОГО ЧЕРНОВИКА ═════════════════════════════════
 *
 * Всё прочее, что предлагает черновик, — это ЗНАЧЕНИЕ ПОЛЯ ФОРМЫ, и с круга 20 оно пишется само
 * (B-14), потому что откат такой записи — это возврат пустоты. Колорвей — НЕ значение поля.
 * Подтверждение колорвея создаёт ПРОДУКТ на сервере: `CreateColorway` немедленен, не сохраняется
 * вместе с карточкой и не откатывается сохранением. Поэтому здесь клик остаётся, и он
 * единственный на весь круг: «сам заполняет» кончается ровно там, где начинается запись, которую
 * нельзя отменить формой.
 *
 * ⚠ ВСЕ ПРОВЕРКИ СОДЕРЖИМОГО СДЕЛАЛ СЕРВЕР. Код цвета сложен на словарь, дубли схлопнуты, hex
 * проверен регуляркой, пустые и безымянные обработаны, потолки применены. Здесь — только то,
 * чего сервер знать не мог: ЧТО СТОИТ НА ЭТОЙ КАРТОЧКЕ ПРЯМО СЕЙЧАС (какие слоты сохранены,
 * какие коды уже заняты) и ЧТО ЧЕЛОВЕК ПОПРАВИЛ РУКАМИ.
 */

/* ─── ФОРМА ПРЕДЛОЖЕНИЯ ────────────────────────────────────────────────────────────────────── */

/** Один слот, носящий один цвет. `slot` — ИМЯ, свёртка которого и есть вся привязка. */
export type ProposedSlotColour = {
  slot: string;
  pantone: string;
  hex: string;
  colour: string;
};

/**
 * Один предложенный колорвей — ровно то, что нужно вкладке COLORWAYS, и ничего сверх.
 *
 * `id` выведен из СОДЕРЖИМОГО, а не из позиции: список пере-разбирается на каждом ответе, и
 * позиционный ключ переехал бы на соседа, как только одно предложение подтвердили и оно ушло в
 * квитанцию. Тот же закон, что у личности строки предложения.
 */
export type ProposedColourway = {
  id: string;
  name: string;
  colorCode: string;
  pantone: string;
  hex: string;
  slots: ProposedSlotColour[];
};

/**
 * Разбор списка. Пустое имя И пустые слоты — не предложение вовсе (сервер такие уже выбросил;
 * повтор здесь стоит нуля и закрывает случай «старый сохранённый прогон, разобранный на повторе»).
 */
export function proposedColourways(draft: ConstructionDraft | null): ProposedColourway[] {
  const out: ProposedColourway[] = [];
  const seen = new Set<string>();
  for (const c of draft?.colourways ?? []) {
    const name = normText(c.name);
    const slots: ProposedSlotColour[] = [];
    const seenSlot = new Set<string>();
    for (const s of c.slots ?? []) {
      const slot = normText(s.slot);
      if (!slot) continue;
      const fold = foldToken(slot);
      if (seenSlot.has(fold)) continue;
      seenSlot.add(fold);
      slots.push({
        slot,
        pantone: normText(s.pantone),
        hex: normText(s.hex),
        colour: normText(s.colour),
      });
    }
    if (!name && slots.length === 0) continue;
    // Личность: свёрнутое имя, а при столкновении — с хвостом порядкового номера. Два
    // одноимённых предложения — это состояние ненормальное (сервер схлопывает), но выразимое
    // сохранённым прогоном, и одинаковый ключ у двух карточек React потерял бы одну из них.
    let id = `cw:${foldToken(name) || 'unnamed'}`;
    let n = 2;
    while (seen.has(id)) id = `cw:${foldToken(name) || 'unnamed'}:${n++}`;
    seen.add(id);
    out.push({
      id,
      name,
      colorCode: normText(c.colorCode),
      pantone: normText(c.pantone),
      hex: normText(c.hex),
      slots,
    });
  }
  return out;
}

/* ─── ПРИВЯЗКА СЛОТА К СОХРАНЁННОЙ СТРОКЕ ──────────────────────────────────────────────────── */

/** Строка спецификации так, как её знает СОХРАНЁННАЯ карточка: имя и durable-ключ. */
export type SavedSlot = { name?: string; lineKey?: string };

export type BoundSlot = ProposedSlotColour & {
  /** Пусто — слота с таким именем на СОХРАНЁННОЙ карточке нет; строка рецепта не родится. */
  bomLineKey: string;
};

/**
 * ПРИВЯЗКА ИДЁТ ПО СВЁРНУТОМУ ИМЕНИ И ПО СОХРАНЁННОЙ КАРТОЧКЕ, А НЕ ПО ФОРМЕ.
 *
 * Два раза «а не»:
 *   · не по позиции и не по id — сервер называет слот ИМЕНЕМ, тем же, на которое таблица слотов
 *     дедуплицируется, поэтому колорвей, предложенный в одном ответе со своими слотами,
 *     привязывается и к ним, и к одноимённым, набранным руками;
 *   · не по ФОРМЕ — рецепт ссылается на `bom_line_key` строки, КОТОРУЮ СЕРВЕР УЖЕ ЗНАЕТ.
 *     Строка, рождённая черновиком минуту назад и ещё не сохранённая, ключ имеет, но на сервере
 *     её нет: рецепт с таким ключом сервер отверг бы целиком. Ворота ниже требуют чистой формы
 *     ровно ради этого, а привязка читает сохранённую карточку, чтобы это было ВИДНО ГЛАЗАМИ,
 *     а не выяснялось отказом.
 */
export function bindSlots(slots: ProposedSlotColour[], saved: SavedSlot[]): BoundSlot[] {
  const byFold = new Map<string, string>();
  for (const line of saved) {
    const fold = foldToken(line.name);
    const key = (line.lineKey ?? '').trim();
    if (!fold || !key) continue;
    // Первая строка с этим именем побеждает — тот же порядок, каким её видит человек в таблице.
    if (!byFold.has(fold)) byFold.set(fold, key);
  }
  return slots.map((s) => ({ ...s, bomLineKey: byFold.get(foldToken(s.slot)) ?? '' }));
}

/* ─── СТРОКИ РЕЦЕПТА ───────────────────────────────────────────────────────────────────────── */

/**
 * СТРОКИ РЕЦЕПТА ДЛЯ СВЕЖЕГО КОЛОРВЕЯ — И СЛОВО «СВЕЖЕГО» ЗДЕСЬ НЕСУЩЕЕ.
 *
 * `UpdateColorwayRecipe` — ПОЛНАЯ ЗАМЕНА, и у полной замены есть дорогая тонкость: поля,
 * объявленные `optional` (`materialId`, `consumptionSource`, `normMarkerId`), при ОТСУТСТВИИ
 * читаются сервером как «сохрани что было», а при явном значении — как «запиши это». Редактор
 * рецепта возит их дословно ровно поэтому: он правит строки, у которых есть прошлое.
 *
 * У колорвея, созданного секунду назад, прошлого НЕТ — рецепт пуст, сохранять нечего. Поэтому
 * здесь они не посылаются вовсе: это не упрощение чужого правила, а тот же самый ответ на другой
 * вопрос. Из этого же следует, чего здесь нет и не должно быть: НОРМЫ. Расход — свойство
 * изделия, его ставит технолог на вкладке; предложение цвета, привёзшее с собой выдуманный
 * метраж, стало бы себестоимостью, которой никто не считал.
 *
 * `placement` пуст намеренно: он сверяется (trim+lower) с `TechCardOperation.placement`, и
 * выдуманное здесь слово встало бы ложной связью с операцией.
 */
export function usagesForColourway(bound: BoundSlot[]): common_TechCardColorwayUsage[] {
  return bound
    .filter((s) => !!s.bomLineKey)
    .map((s) => ({
      bomLineKey: s.bomLineKey,
      bomItemIndex: undefined,
      bomItemId: undefined,
      placement: '',
      color: s.colour,
      pantone: s.pantone,
      consumption: undefined,
      quantity: undefined,
      sizeConsumptions: [],
      // Строка уровня ИЗДЕЛИЯ: пустой ключ детали — это и есть «носитель нормы слота», а не
      // назначение материала на деталь кроя.
      pieceLineKey: '',
      pieceId: undefined,
      pieceIndex: undefined,
      wasteSelvedgePct: undefined,
      wasteCutPct: undefined,
      // output-only — сервер считает их сам
      lineTotal: undefined,
      sizeRunTotal: undefined,
      normAppliedAt: undefined,
    }));
}

/* ─── ВОРОТА ПОДТВЕРЖДЕНИЯ ─────────────────────────────────────────────────────────────────── */

export type ConfirmGateInput = {
  readOnly: boolean;
  /** Форма грязная — карточка ещё не сохранена. */
  dirty: boolean;
  colorCode: string;
  usedCodes: Set<string>;
  /** Словарь несёт ХОТЬ ЧТО-ТО — включая архивное. Отличает «цветов нет» от «все сняты». */
  dictionaryHasAny: boolean;
  /** Есть цвет, который МОЖНО ВЫБРАТЬ (живой либо удержанный живым предложением). */
  dictionaryHasColours: boolean;
  /** Код есть в словаре и НЕ снят в архив — то есть им можно красить новое. Пустой код — не спор. */
  codeChoosable: boolean;
  /** Код вообще известен словарю (архивный — известен; удалённый — нет). */
  codeKnown: boolean;
  boundCount: number;
};

/**
 * ОДИН ОТКАЗ, СЛОВАМИ, И ПОРЯДОК ЭТИХ ОТКАЗОВ — ТОЖЕ РЕШЕНИЕ: сперва то, что человек не может
 * исправить в этом блоке (права, словарь), потом то, что может (сохранить, выбрать код).
 *
 * ⚠ «СНАЧАЛА СОХРАНИТЕ КАРТОЧКУ» — ЭТО НЕ ОСТОРОЖНОСТЬ, А ДВЕ ПРИЧИНЫ РАЗОМ. Рецепт ссылается на
 * `bom_line_key` строк, которых на сервере ещё нет (слот, только что заполненный черновиком), —
 * это первая. Запись рецепта двигает `tech_card.lock_version`, против которого сохранение
 * карточки делает CAS, — и несохранённое тело карточки после этого получило бы 409 на СВОЁМ
 * сохранении: человек нажал «confirm», а сломалось «save». Это вторая, и она хуже первой.
 *
 * ⚠ «СВЕРЕН СЕРВЕРОМ» — ЭТО ПРОШЕДШЕЕ ВРЕМЯ, И ДВЕ СТУПЕНИ НИЖЕ ИМЕННО ПРО НЕГО. `color_code`
 * проверен словарём В МОМЕНТ ПРОГОНА (так его и описывает `DesignColourwayProposal`), а живёт
 * предложение в сторе сколько угодно долго: цвет успевают снять в архив или удалить. Пропустить
 * такой код значило бы завести ПРОДУКТ под снятым цветом — ровно то, что архив и закрывает, — и
 * ворота у кнопки прогона стоят здесь по тому же доводу, что у соседа в `pattern-library`. Экран
 * при этом код ПОКАЗЫВАЕТ (пункт `(archived)` / `(not in the dictionary)`): отказ обязан называть
 * то, что человек видит, иначе он спорит с пустым местом.
 */
export function confirmRefusal(i: ConfirmGateInput): string | null {
  if (i.readOnly) return 'this card is read-only';
  // Два РАЗНЫХ тупика, и лекарства у них противоположные. Пустой словарь лечится заведением
  // цветов; словарь, где все цвета сняты в архив, лечится их возвратом — и старый общий текст
  // отправлял человека заводить то, что у него уже есть, в полном списке.
  if (!i.dictionaryHasAny) return 'no colours in the dictionary yet — add them under settings › colors';
  if (!i.dictionaryHasColours) return 'every colour in the dictionary is archived — un-archive one under settings › colors';
  if (i.dirty) return 'save the card first — the colourway binds to saved slots';
  if (!i.colorCode) return 'pick the dictionary colour — a colourway is a product and needs one';
  if (!i.codeKnown) return 'that colour is gone from the dictionary — pick another';
  if (!i.codeChoosable) return 'that colour has been archived — pick one still in the dictionary';
  if (i.usedCodes.has(i.colorCode)) return 'this colour is already on the style';
  if (i.boundCount === 0) return 'none of these slots is on the saved card yet';
  return null;
}
