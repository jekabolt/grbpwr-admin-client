import type { common_TechCardColorwayUsage } from 'api/proto-http/admin';

import {
  blankDraft,
  fromRead,
  savableUsage,
  toWire,
  type UsageDraft,
} from '../colorway-usage-wire';
import { wireInt } from '../wire-int';
import { detailIdentity, normText, type ConstructionDraft } from './head/construction-draft-model';

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

/**
 * Один слот, носящий один цвет. `slot` — ИМЯ, свёртка которого — привязка слота, пока его не правили.
 *
 * `lineKey` — ключ строки карточки, на ряду которой слот ПРАВИЛИ на экране (`patchRow`,
 * `colourway-rows.ts`). С ним слот держится за строку, а не за имя: переименование строки в MATERIAL
 * SLOTS не уводит уже выбранный цвет в «not on the card», а удаление строки не уводит его на
 * одноимённую соседку — такой слот стоит «not on the card». У слотов, пришедших от модели, его нет.
 */
export type ProposedSlotColour = {
  slot: string;
  pantone: string;
  hex: string;
  colour: string;
  lineKey?: string;
};

/**
 * Один предложенный колорвей — ровно то, что нужно вкладке COLORWAYS, и ничего сверх.
 *
 * `id` = ПОКОЛЕНИЕ ОТВЕТА + свёрнутое имя (`cw:<поколение>:<имя>`). Имя — а не позиция: внутри
 * одного ответа позиционный ключ переехал бы на соседа, как только одно предложение подтвердили и
 * оно ушло. Поколение — потому что вердикт живёт дольше своего ответа: `setProposals` бережёт
 * `confirmed` (он называет настоящий продукт), и `rosso` СЛЕДУЮЩЕГО прогона с ключом `cw:rosso`
 * унаследовал бы чужой «подтверждён» и спрятался, ни разу не показанный (ревью Codex O-44, MAJOR 4).
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
 * КЛЮЧ УЗНАВАНИЯ ИМЕНИ — буквы и цифры ЛЮБОГО алфавита (`detailIdentity`, O-33). Одна свёртка на
 * весь блок: личность предложения, привязка слота модели к строке карточки (`proposalRows`).
 *
 * ⚠ НЕ `foldToken`. Та держит только латиницу: «подкладка» и «шерсть» сворачивались в одну пустоту,
 * а «молния 5мм» и «люверс 5мм» — в одно «5». Для латиницы это та же свёртка («Nylon Twill 180 GSM» =
 * «nylon twill 180gsm»); имя из одних знаков держится своим нормализованным текстом.
 */
export function nameKey(name?: string | null): string {
  return detailIdentity(name);
}

/**
 * ПОКОЛЕНИЕ ОТВЕТА, КОГДА ПИСАТЕЛЬ ЕГО НЕ НАЗВАЛ — метка САМОГО ОБЪЕКТА разобранного ответа.
 *
 * Ответ разбирается один раз и применяется один раз (`takeParked` отдаёт его ровно одному органу),
 * поэтому объект черновика и есть поколение: тот же объект — та же метка (повторный разбор того же
 * ответа не плодит новых личностей), новый ответ — новая. Счётчик поверх часов: две метки в одну
 * миллисекунду не совпадут. Предложения и вердикты живут в памяти вкладки, не в хранилище, —
 * уникальности в пределах вкладки достаточно.
 */
const answerTags = new WeakMap<object, string>();
let answerSeq = 0;
function answerTag(draft: object): string {
  let tag = answerTags.get(draft);
  if (!tag) {
    tag = `${Date.now().toString(36)}${(++answerSeq).toString(36)}`;
    answerTags.set(draft, tag);
  }
  return tag;
}

/**
 * Разбор списка. Пустое имя И пустые слоты — не предложение вовсе (сервер такие уже выбросил;
 * повтор здесь стоит нуля и закрывает случай «старый сохранённый прогон, разобранный на повторе»).
 *
 * `generation` — личность ответа, если писатель её знает (ключ идемпотентности прогона, id строки
 * реестра); без неё — метка объекта ответа (`answerTag`).
 *
 * ⚠ СЛОТЫ НЕ СХЛОПЫВАЮТСЯ ПО ИМЕНИ (ревью Codex O-44, MAJOR 6). Две «zip» у модели — это две молнии
 * для двух одноимённых строк карточки, и `proposalRows` сажает каждую на следующую свободную строку
 * с тем же именем. Схлопнутая здесь вторая пропадала до того, как привязка могла её увидеть, — а
 * латинская свёртка вдобавок схлопывала любые два кириллических имени в одно.
 */
export function proposedColourways(
  draft: ConstructionDraft | null,
  generation?: string,
): ProposedColourway[] {
  if (!draft) return [];
  const gen = normText(generation) || answerTag(draft);
  const out: ProposedColourway[] = [];
  const seen = new Set<string>();
  for (const c of draft.colourways ?? []) {
    const name = normText(c.name);
    const slots: ProposedSlotColour[] = [];
    for (const s of c.slots ?? []) {
      const slot = normText(s.slot);
      if (!slot) continue;
      slots.push({
        slot,
        pantone: normText(s.pantone),
        hex: normText(s.hex),
        colour: normText(s.colour),
      });
    }
    if (!name && slots.length === 0) continue;
    // Два одноимённых предложения в одном ответе — состояние ненормальное (сервер схлопывает), но
    // выразимое сохранённым прогоном, и одинаковый ключ у двух карточек React потерял бы одну из них.
    const base = `cw:${gen}:${nameKey(name) || 'unnamed'}`;
    let id = base;
    let n = 2;
    while (seen.has(id)) id = `${base}:${n++}`;
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

/**
 * Слот, привязанный к строке СОХРАНЁННОЙ карточки. Привязку считает `proposalRows`
 * (`colourway-rows.ts`): ряды там — слоты карточки, а не слоты ответа, и привязка идёт по строке,
 * которую сервер уже знает, а не по форме (довод — в шапке того файла).
 */
export type BoundSlot = ProposedSlotColour & {
  /** Пусто — слота с таким именем на СОХРАНЁННОЙ карточке нет; строка рецепта не родится. */
  bomLineKey: string;
};

/* ─── СТРОКИ РЕЦЕПТА ───────────────────────────────────────────────────────────────────────── */

/** Строка BOM или деталь кроя перечитанной карточки: серверный id (с провода) и ключ строки. */
type Keyed = { id?: unknown; lineKey?: string };

/**
 * Строки BOM и детали перечитанной карточки — в том виде, в каком их берёт чтение рецепта вкладки
 * (`fromRead`): id прочитан с провода (`wireInt`), строка без ключа адреса не даёт.
 */
function refsOf(rows: readonly Keyed[] | null | undefined): { id: number; lineKey: string }[] {
  const out: { id: number; lineKey: string }[] = [];
  for (const r of rows ?? []) {
    const lineKey = (r.lineKey ?? '').trim();
    if (lineKey) out.push({ id: wireInt(r.id), lineKey });
  }
  return out;
}

/**
 * ═══ РЕЦЕПТ КОЛОРВЕЯ = ПЕРЕЧИТАННЫЙ РЕЦЕПТ + ЦВЕТА СЛОТОВ, ОТПРАВЛЕННЫЙ ТАК, КАК ОТПРАВИЛА БЫ ВКЛАДКА ═
 *
 * `UpdateColorwayRecipe` — ПОЛНАЯ ЗАМЕНА строк. Между `CreateColorway` и этой записью сохранённый ряд
 * уже стоит на экране с живой `open ›`, и вкладка COLORWAYS (или соседний человек) успевает записать
 * в тот же колорвей пин артикула, норму, размеры, назначение ткани на деталь. Запись из одних строк
 * предложения стёрла бы их при честно совпавшем замке (ревью Codex O-44, BLOCKER), поэтому основа
 * записи — ПЕРЕЧИТАННЫЙ рецепт этого колорвея. Основа и замок взяты ОДНИМ чтением: запись, успевшая
 * между чтением и заменой, даст 409, а не молчаливую потерю.
 *
 * ВЕСЬ ПУТЬ — ВКЛАДОЧНЫЙ, ТЕМИ ЖЕ ФУНКЦИЯМИ (`colorway-usage-wire.ts`; ревью Codex O-44, второй круг,
 * MAJOR 1). Каждая сохранённая строка читается в черновик (`fromRead`); цвет слота садится в черновик
 * — `color`/`pantone` строк уровня изделия (без детали) покрашенных слотов, а у слота без такой
 * строки она рождается так же, как рождает её вкладка (`blankDraft` с адресом слота); на провод уходит
 * ровно то, что вкладка отправила бы своим сохранением: `savableUsage` отсекает строку без разрешимого
 * `bom_line_key` (адресовать её нечем, и полная замена уронила бы весь рецепт) и пустую строку
 * изделия, и только потом — `toWire`. Строки деталей, чужие слоты, нормы и пины не трогаются.
 *
 * Строк уровня изделия у слота бывает несколько (одна пуговица на планке, другая на манжете —
 * сервер держит их по `placement`); цвет слота садится на каждую: предложение говорит про СЛОТ.
 */
export function recipeForColourway(
  existing: readonly common_TechCardColorwayUsage[] | null | undefined,
  bound: readonly BoundSlot[],
  card: { bomItems?: readonly Keyed[] | null; pieces?: readonly Keyed[] | null } | null | undefined,
): common_TechCardColorwayUsage[] {
  const bomItems = refsOf(card?.bomItems);
  const pieces = refsOf(card?.pieces);
  const drafts: UsageDraft[] = (existing ?? []).map((u) => fromRead(u, bomItems, pieces));
  for (const s of bound) {
    if (!s.bomLineKey) continue;
    let carried = false;
    drafts.forEach((d, i) => {
      if (d.bomLineKey !== s.bomLineKey || d.pieceLineKey) return;
      drafts[i] = { ...d, color: s.colour, pantone: s.pantone };
      carried = true;
    });
    if (!carried)
      drafts.push({
        ...blankDraft('', ''),
        bomLineKey: s.bomLineKey,
        color: s.colour,
        pantone: s.pantone,
      });
  }
  return drafts.filter(savableUsage).map(toWire);
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
  /**
   * Карточка прочитана — до этого «слотов нет» значит «ещё не знаем», а не «нет». Необязателен:
   * окно рождения (`createRefusal`) берёт отсюда только общие ворота и рецепта не пишет вовсе.
   */
  cardRead?: boolean;
  /** Слотов на СОХРАНЁННОЙ карточке — отличает «слотов нет» от «ни один не покрашен». */
  cardSlotCount?: number;
  /** Рядов, которые уедут в рецепт: слот сохранённой карточки, у которого есть цвет (`recipeSlots`). */
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
  if (!i.dictionaryHasAny)
    return 'no colours in the dictionary yet — add them under settings › colors';
  if (!i.dictionaryHasColours)
    return 'every colour in the dictionary is archived — un-archive one under settings › colors';
  if (i.dirty) return 'save the card first — the colourway binds to saved slots';
  if (!i.colorCode) return 'pick the dictionary colour — a colourway is a product and needs one';
  if (!i.codeKnown) return 'that colour is gone from the dictionary — pick another';
  if (!i.codeChoosable) return 'that colour has been archived — pick one still in the dictionary';
  if (i.usedCodes.has(i.colorCode)) return 'this colour is already on the style';
  if (i.cardRead === false) return 'reading the card…';
  // Два тупика, и лечатся они по-разному: слотов на сохранённой карточке нет вовсе (сохранить
  // карточку со слотами) — или слоты есть, но ни один не покрашен (выбрать цвет здесь же, в ряду).
  if (i.boundCount === 0 && !i.cardSlotCount) return 'none of these slots is on the saved card yet';
  if (i.boundCount === 0) return 'give at least one slot on the card a colour';
  return null;
}
