import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignAsset,
  common_DesignColourRecipe,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';

import { ASSETS_PER_CARD_MAX, ASSET_PATTERN, assetLabel, shelfOf } from '../assets/model';
import { cardOutputRows } from '../bench-kinds';
import type { Gate } from '../render';

/**
 * ═══ ЧТО ТАКОЕ ПРОГОН РОДА `pattern`, И ЧЕМ ОН НЕ ПОХОЖ НА ДВУХ СОСЕДЕЙ ═══════════════════════
 *
 * Владелец (K-13): «заапдоудить картинку и где мы через gpt image 2 сделаем из нее повторяемый
 * паттерн … и прикинуть размер этого паттерна руками увеличить или уменьшить».
 *
 * НА ПРОВОДЕ ЭТО РОВНО ТРИ ФАКТА, и все три названы контрактом:
 *   · `kind = "pattern"` у прогона;
 *   · `params.extra_input_media_ids` — РОВНО ОДНА картинка (сервер отказывает `one_source_picture`
 *     на любое другое число, до резервации денег);
 *   · `params.pattern.repeat_mm` — раппорт целыми миллиметрами, 0 = не назван.
 * Выход один, и он объявлен `kind = "pattern"`. Контракт объясняет, почему у плитки СВОЁ имя, а не
 * заимствованное: назвавшись флэтом, она стала бы выбираемой в слот верстака («перед изделия» —
 * квадрат ткани), а назвавшись рендером — удовлетворила бы ворота «3D нужен фабрик-рендер».
 *
 * ПОЭТОМУ ЭТОТ МОДУЛЬ НЕ ЗОВЁТ `outputsOfKind` ИЗ `render/model.ts`. Та функция сужена типом до
 * `'render' | 'threed'`, и расширять её — правка чужого файла. Правило чтения повторено здесь
 * ОДИН В ОДИН и намеренно: род читается С ПРОГОНА (`picture.kind` — открытая строка, чей
 * производственный словарь этот бандл никогда не видел), скрытые плиты выбрасываются, и всякий
 * читатель обязан помнить, что полоса привозит ОДНУ СТРАНИЦУ ленты, а не всю историю карточки.
 */

/** Род прогона и род плиты. Одно слово, объявленное один раз. */
export const PATTERN = 'pattern';

/** Потолок раппорта — зеркало серверного (`ASSET_REPEAT_MAX`), чтобы отказ приходил без сети. */
export const REPEAT_MAX = 2000;

/**
 * ЛЕНТА ГОВОРИТ ТО, ЧТО ЕЙ СКАЗАЛ ПРОГОН. Родовое поле плиты (`picture.kind`) читается только как
 * подтверждение: прогон рода `pattern` не может отдать ничего, кроме плитки, а вот старая плита из
 * ручной загрузки объявляет себя чем угодно.
 *
 * ═══ ПЛИТКИ ВСЕЙ КАРТОЧКИ, А НЕ ЭТОЙ СТРАНИЦЫ ЛЕНТЫ (H-9) ════════════════════════════════════
 *
 * Абзац выше — про ЧТЕНИЕ рода, и он в силе. Изменился ОХВАТ. Тот же дефект, что владелец поймал
 * на рендерах, стоял и здесь: страница ленты — двенадцать строк, и плитка, чей прогон вытеснен
 * новыми, пропадала со своего же экрана и из сегмента PATTERNS в ARTIFACTS вместе с ней. Хуже, чем
 * у рендеров: у плитки прогона ОДИН выход, поэтому вытеснение прогона — это ровно пропажа плитки.
 *
 * `cardOutputRows` (`../bench-kinds`) — общий читатель на три экрана, и здесь он зовётся ПО ТОЙ ЖЕ
 * причине, по которой этот модуль не звал `outputsOfKind`: у того тип сужен до `'render' |
 * 'threed'`, а этот говорит на общей оси представлений и рода `pattern` не боится. `null` — сервер
 * старше поля, и тогда работает обход страницы ниже, слово в слово прежний.
 *
 * ⚠ ЧЕГО СТОИТ ПЛИТКА, ЧЕЙ ПРОГОН ВНЕ СТРАНИЦЫ. Экран рядом с плиткой читает С ПРОГОНА раппорт
 * (`repeatOfRun`) и измеренный шов (`seamWarningOf`, он живёт на ПОПЫТКАХ прогона). Общий читатель
 * подставляет настоящий прогон всюду, где он на странице, и только для по-настоящему выпавших
 * отдаёт штамп из четырёх фактов — там раппорт прочтётся как «не назван», а шов промолчит. Это
 * ухудшение против НИЧЕГО: сегодня такой плитки на экране нет вовсе.
 */
export function patternOutputs(
  band: GetDesignBandResponse,
): { picture: common_DesignPicture; run: common_DesignRun }[] {
  const whole = cardOutputRows(band, PATTERN);
  if (whole) return whole;

  const out: { picture: common_DesignPicture; run: common_DesignRun }[] = [];
  for (const run of band.runs ?? []) {
    if ((run.kind ?? '').trim().toLowerCase() !== PATTERN) continue;
    for (const picture of run.pictures ?? []) {
      if (picture.hiddenAt) continue;
      if ((picture.id ?? 0) <= 0) continue;
      out.push({ picture, run });
    }
  }
  // Новейшая плитка первой: ленты полосы уже приходят новейшим прогоном вперёд, но у одного
  // прогона выход один, так что порядок прогонов и есть порядок плиток.
  return out;
}

/** Прогоны плиток этой страницы ленты — включая живые и павшие, у которых плиты нет вовсе. */
export function patternRuns(band: GetDesignBandResponse): common_DesignRun[] {
  return (band.runs ?? []).filter((r) => (r.kind ?? '').trim().toLowerCase() === PATTERN);
}

/* ─────────────────────────── плохой стык ─────────────────────────── */

/**
 * ═══ `pattern_not_seamless` — ЭТО ПРЕДУПРЕЖДЕНИЕ, А НЕ ОТКАЗ, И РАЗНИЦА НЕСУЩАЯ ════════════════
 *
 * Картинка ДОСТАВЛЕНА и сохранена; сервер отдельно померил её стык (и рамку по краю) и нашёл шов
 * видимым. Прогон при этом `done`, деньги списаны, плитка лежит в ленте.
 *
 * КОД ЖИВЁТ НА ПОПЫТКЕ (`run.attempts[].error_code`), А НЕ НА ПРОГОНЕ, и читать надо именно
 * попытки: `run.error_code` заполняется у ПАВШЕГО прогона, а этот не пал. Читатель, глядящий
 * только на прогон (как `runOutcomeNote` в `generation/run-state.ts`), увидит голое `done` и не
 * скажет об измеренном шве ни слова — то есть человек заплатит за плитку, которая не тайлится, и
 * узнает об этом от фабрики.
 *
 * `run.errorCode` ВСЁ РАВНО ПРОВЕРЯЕТСЯ ВТОРЫМ. Это не подстраховка «на всякий случай»: тот же
 * токен на павшем прогоне означал бы, что стык померили и на этом остановились, и промолчать о
 * нём было бы той же потерей под другим именем.
 */
export const SEAM_CODE = 'pattern_not_seamless';

export function seamWarningOf(run?: common_DesignRun | null): boolean {
  if (!run) return false;
  const attempts = run.attempts ?? [];
  if (attempts.some((a) => (a.errorCode ?? '').trim().toLowerCase() === SEAM_CODE)) return true;
  return (run.errorCode ?? '').trim().toLowerCase() === SEAM_CODE;
}

/**
 * ЧТО ЭТО ЗНАЧИТ ДЛЯ ЧЕЛОВЕКА — одним абзацем, у самой плитки.
 *
 * Написано ДЛЯ ТЕХНОЛОГА, а не про наш измеритель: «сервер померил» — это наша половина, а его
 * половина — «шов будет виден на настиле» и «посмотрите сами». Последнее сказано не из вежливости:
 * сервер ловит плитку, которая НЕ заворачивается, и рамку по краю, но не ловит ту, которая
 * заворачивается и всё равно заметно повторяется. Это судит глаз, и только глаз.
 *
 * ⚠ ПОСЛЕДНЯЯ ФРАЗА ПОЧИНЕНА ВМЕСТЕ С J-12, И ЭТО НЕ КОСМЕТИКА. Она звала «посмотреть на 3×3
 * выше» — на сцену снесённого блока TILES. Строка ВИДИМАЯ (подсказка пилюли и тело предупреждения),
 * и указатель на орган, которого нет, читается как поломка экрана. Теперь она называет то, что
 * есть: лицо карточки замощено 2×2, и стык проходит по её середине.
 */
export const SEAM_WORDS =
  'the server measured this tile’s join and found it visible — a border round the edge, or two ' +
  'sides that do not meet. The picture arrived and is saved, and it was paid for; what it will do ' +
  'is show a seam every repeat when the cloth is laid out. The card’s face lays the tile out four ' +
  'times, so the join runs through its middle — look there, and zoom in, before you use it.';

/* ─────────────────────────── отказы, которые обязан рисовать экран ─────────────────────────── */

/**
 * ═══ ОТКАЗ ПОКАЗЫВАЕТСЯ ДОСЛОВНО. ЭТО НЕ СЛОВАРЬ ПЕРЕВОДА ════════════════════════════════════
 *
 * Правило волны: слова сервера печатаются как есть, нашим текстом не подменяются. Особенно это
 * про отказ БЕЗ КЛЮЧА — он называет ПЕРЕМЕННУЮ ОКРУЖЕНИЯ, и переписанный своими словами («the
 * generator is not configured») он теряет ровно то единственное, ради чего его стоит читать.
 *
 * Поэтому здесь не перевод, а ПРИПИСКА: что человеку с этим делать. Она встаёт РЯДОМ с дословной
 * строкой сервера, ниже её, и никогда вместо неё. Токен, которого здесь нет, — это отказ без
 * приписки, и он всё равно читается: дословная строка на экране в любом случае.
 */
export const REFUSAL_ADVICE: Record<string, string> = {
  no_source_picture:
    'a tile is made out of one picture, and this run named none. Attach a picture above — from the ' +
    'library or from the clipboard.',
  one_source_picture:
    'a tile is made out of EXACTLY one picture — two swatches glued together cannot be made to ' +
    'join to themselves. Leave one attached above.',
  provider_model_retired:
    'the image model this route was pointed at no longer exists at the provider. Nothing on this ' +
    'card can fix that: the model is server configuration, and somebody has to point it at a live one.',
};

/** Приписка к дословному отказу, или пусто. Ищет токен ВНУТРИ сообщения: gateway заворачивает его. */
export function refusalAdvice(message: string): string {
  const text = (message ?? '').toLowerCase();
  for (const [token, advice] of Object.entries(REFUSAL_ADVICE)) {
    if (text.includes(token)) return advice;
  }
  return '';
}

/* ─────────────────────────── ворота ─────────────────────────── */

/**
 * THE GATE'S REFUSAL PLUS THE DOOR THAT FIXES IT. `Gate` is the band's shared shape (the generate
 * row reads `ok`/`reason`); `door` is this screen's own addition, read by the lock bar above the
 * row to draw the ONE door that repairs the refusal — the source slot for `picture`, the name
 * field for `name`. A refusal is only ever spoken as a visible bar with a door, never as a
 * button's `title` alone (SPEC §8).
 */
export type PatternGate = Gate & { door?: 'picture' | 'name' };

/**
 * A TILE ON THIS CARD THAT ALREADY CARRIES THIS NAME — case-insensitively, because the person who
 * will look for the tile by eye reads «Chevron» and «chevron» as one word. `skipAssetId` lets a
 * rename skip the tile being renamed.
 */
export function patternTwin(
  band: GetDesignBandResponse,
  name: string,
  skipAssetId = 0,
): common_DesignAsset | undefined {
  const key = (name ?? '').trim().toLowerCase();
  if (!key) return undefined;
  return patternAssets(band).find(
    (a) => (a.id ?? 0) !== skipAssetId && assetLabel(a).trim().toLowerCase() === key,
  );
}

/**
 * ЧЕГО НЕ ХВАТАЕТ, ЧТОБЫ НАЖАТЬ GENERATE — три отказа, в порядке проверки и словами макета.
 *
 *   1. источник: ровно одна картинка (`a repeating tile is made out of exactly one picture`);
 *   2. имя пустое — имя ОБЯЗАТЕЛЬНО и не уезжает к модели: это то, по чему плитку найдут
 *      (`a pattern is found by its name · give it one`);
 *   3. тёзка на полке без регистра (`a pattern called "…" already stands here`).
 *
 * `name` необязателен в подписи ради читателей, которым известен только источник (рельс: там
 * отказ по имени «own» и цепь не запирает); экран передаёт его всегда.
 *
 * ДЕНЕГ В ЭТИХ ВОРОТАХ НЕТ ВОВСЕ, И У ДВУХ СОСЕДЕЙ ТОЖЕ. Здесь стоял отказ по исчерпанному
 * дневному потолку; потолок снесён с обеих сторон провода («убери потолок»), и ворота, которые
 * читали бы его остатки, отказывали бы по факту, которого больше не бывает. ПОЛКА В 40 АССЕТОВ
 * ВОРОТАМИ ТОЖЕ НЕ СЧИТАЕТСЯ: прогон идёт и оплачивается, а плитка падает в «made earlier, not
 * kept», где `keep it` гаснет под своей полосой.
 *
 * ЧИСЛО КАРТИНОК ПРОВЕРЯЕТСЯ ЗДЕСЬ, ХОТЯ ЕГО ПРОВЕРЯЕТ И СЕРВЕР. Это не дубль правила: сервер
 * отвечает `one_source_picture` бесплатно, ДО резервации, — но отвечает он по сети и с задержкой,
 * а человек тем временем уже нажал кнопку с надписью «это стоит денег». Клиентская проверка не
 * заменяет серверную и ничего не гарантирует; она только не даёт нажать заведомо мёртвое.
 */
export function patternGate(
  band: GetDesignBandResponse,
  sourceMediaId: number,
  name?: string,
): PatternGate {
  if (!sourceMediaId || sourceMediaId <= 0) {
    return {
      ok: false,
      reason: 'a repeating tile is made out of exactly one picture',
      door: 'picture',
    };
  }
  if (name !== undefined) {
    const nm = name.trim();
    if (!nm) {
      return { ok: false, reason: 'a pattern is found by its name · give it one', door: 'name' };
    }
    const twin = patternTwin(band, nm);
    if (twin) {
      return {
        ok: false,
        reason: `a pattern called "${assetLabel(twin)}" already stands here`,
        door: 'name',
      };
    }
  }
  return { ok: true };
}

/* ─────────────────────────── цвет, который уезжает к модели ─────────────────────────── */

/** The paintable hex of a colourway, or '' when its development record names none. */
export function colourwayHex(ref?: common_AdminColorwayRef | null): string {
  const hex = (ref?.devHex ?? '').trim();
  return /^#?[0-9a-f]{6}$/i.test(hex) ? (hex.startsWith('#') ? hex : `#${hex}`) : '';
}

/**
 * ═══ ЦВЕТ ПЛИТКИ НИ К ЧЕМУ НЕ ОБЯЗЫВАЕТ (владелец, r2 §26) ═════════════════════════════════════
 *
 * Владелец: «выбор цвета, который нас ни к чему не обязывает». Раньше цвет ПЛИТКИ выбирался из
 * КОЛОРВЕЕВ карточки — то есть, чтобы покрасить пробную плитку, надо было сначала завести колорвей,
 * а на момент первых генераций колорвеев у карточки обычно нет вовсе (тот же довод, по которому
 * плитка не привязывается к колорвею при создании, E-1). Цвет теперь — ПАРА СТРОК, ничья: код
 * (пантон или что набрали) и его экранный hex. Ничего на карточке от этого выбора не заводится и
 * ничего не меняется — он живёт ровно один прогон.
 */
export type PatternColour = {
  /** Ссылка, как её назвал человек: пантон `18-1248 TCX` или свой номер красильни. */
  code: string;
  /** ЭКРАННЫЙ hex — чтобы плитку было видно. Может быть пустым: пантон — это код, а не пиксели. */
  hex: string;
};

/**
 * THE COLOUR AS THE RUN CARRIES IT — `params.colour`, the SAME field the render and the recolour
 * state theirs in. The server writes it into every kind's prompt without looking at the kind
 * (`designgen/snapshot.go`: `if c := p.Colour; c != nil { write("colour", colourStatement(c)) }`),
 * and its phrase is `colourway ROSSO — the exact value is #8d3a33`; with no hex the code alone
 * still travels. Nothing else of the recipe is stated: a tile has no cloth list and no colour
 * maps, and an empty list here is an empty list on the wire, not a second spelling.
 *
 * ⚠ ПРИБЛИЗИТЕЛЬНЫЙ HEX В ПЛАТНЫЙ ПРОМПТ НЕ УЕЗЖАЕТ. Свотчи пантонов в этом клиенте — экранное
 * приближение, и так сказано у самого списка (`pantone-swatches.ts`); серверная фраза при этом
 * читается как «the EXACT value is #…». Поэтому hex едет только тогда, когда он настоящий — то
 * есть пришёл с прошлого прогона, где его уже кто-то заявил, — а выбранный по коду пантон едет
 * ОДНИМ КОДОМ. Пустой hex сервер переживает: он печатает то, что названо.
 */
export function patternColourRecipe(colour: PatternColour): common_DesignColourRecipe {
  return {
    source: '',
    code: colour.code.trim(),
    hex: colour.hex.trim(),
    words: '',
    fabricMediaId: 0,
    fabrics: [],
    colourMaps: [],
  };
}

/** Ключ цвета для сравнения и дедупликации: код важнее hex, регистр не значит ничего. */
export function patternColourKey(colour: PatternColour): string {
  return (colour.code.trim() || colour.hex.trim()).toLowerCase();
}

/**
 * ═══ НЕДАВНИЕ ЦВЕТА — ИЗ ПРОГОНОВ ЭТОЙ КАРТОЧКИ, А НЕ ИЗ НАСТРОЙКИ ════════════════════════════
 *
 * Владелец: «история использованных последних цветов при генерации». История цвета УЖЕ существует
 * на проводе и ничего заводить под неё не надо: `params.colour` замораживается на прогоне (то же
 * поле читает `render/drafts.ts`, когда засевает рецепт колорвея). Читаются прогоны рода
 * `pattern` ЭТОЙ карточки, новейшие первыми (`band.runs` приходит новейшим вперёд), одинаковые
 * цвета схлопываются, и берётся не больше `max` — ряд историей быть должен, а не свалкой.
 *
 * ⚠ ПРЕДЕЛ ЧЕСТНЫЙ: `band.runs` — ПЕРВАЯ СТРАНИЦА ленты, а не вся история карточки. Цвет, чей
 * прогон с неё уже свалился, в ряду не появится, и это ухудшение против ничего: сегодня ряда нет.
 */
export function recentPatternColours(band: GetDesignBandResponse, max = 6): PatternColour[] {
  const out: PatternColour[] = [];
  const seen = new Set<string>();
  for (const run of patternRuns(band)) {
    const c = run.params?.colour;
    if (!c) continue;
    const colour: PatternColour = { code: (c.code ?? '').trim(), hex: (c.hex ?? '').trim() };
    if (!colour.code && !colour.hex) continue;
    const key = patternColourKey(colour);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(colour);
    if (out.length >= max) break;
  }
  return out;
}

/** Живые колорвеи карточки для выбора цвета и привязки; архивный — только пока он уже выбран. */
export function pickableColourways(
  refs: readonly common_AdminColorwayRef[] | undefined,
  keepId: number,
  archived: (ref: common_AdminColorwayRef) => boolean,
): common_AdminColorwayRef[] {
  return (refs ?? []).filter((c) => {
    const cid = c.colorwayId ?? 0;
    if (cid <= 0) return false;
    return !archived(c) || cid === keepId;
  });
}

/* ─────────────────────────── плитка как ассет карточки ─────────────────────────── */

/**
 * ═══ ПЛИТКА, ОСТАВЛЕННАЯ НА КАРТОЧКЕ, — ЭТО АССЕТ РОДА `pattern` (K-13, ХВОСТ) ════════════════
 *
 * Владелец: «если мы заполнили новую вкладку и выбрали артефакт из паттернмейкера то cloth не надо
 * заполнять». Дословно это про ФАБРИК РЕНДЕР: он берёт ткань не из воздуха, а с ПОЛКИ карточки —
 * `clothShelf` (`../assets/model`) уже читает ДВЕ полки, `fabric` и `pattern`, и ряд CLOTHS в
 * `render/palette.tsx` уже рисует паттерн чипом с раппортом. То есть мост между двумя вкладками
 * УЖЕ ПОСТРОЕН — не хватало ровно писателя: паттерн-ассет нечем было завести после сноса секции
 * ASSETS (Y-11), и `render-input-strip.tsx` честно пишет об этом на экране.
 *
 * ═══ ⚠ ПИСАТЕЛЬ — СЕРВЕР, И ЭТО ИСПРАВЛЕНИЕ ЛОЖНОГО АБЗАЦА (круг 19) ═════════════════════════
 *
 * Здесь стояло: «НИЧЕГО НЕ ЗАВОДИТСЯ САМО. Прогон закончился — плитка лежит в ленте и НЕ на
 * полке; на полку её кладёт человек. Автоматическая запись сделала бы каждый эксперимент фактом
 * о стиле». Это НЕВЕРНО на `origin/beta` и неверно с круга 15: `keepPatternTx`
 * (`internal/store/design/assets.go:167`) заводит строку полки В ТОЙ ЖЕ транзакции, что закрывает
 * прогон (`queue.go:897`), из замороженного `params.pattern.name` и живой `run.colorway_id`.
 * Абзац был написан до этой правки и пережил её молча — а вместе с ним и словарь («keep», «kept»,
 * «not kept»), из-за которого владелец вообще спросил, как паттерны сохраняются.
 *
 * ЧТО ПРИ ЭТОМ ОСТАЛОСЬ ВЕРНЫМ. Опасение «каждый эксперимент становится фактом о стиле» не
 * выдумано: полка карточки и правда ограничена (`ASSETS_PER_CARD_MAX`), и упёршийся прогон
 * возвращает `library_full`. Ответ на него теперь другой и стоит на своём месте — `delete` на
 * лице плитки, а не отсутствие записи.
 *
 * `UpsertDesignAsset` С КЛИЕНТА ОСТАЛСЯ ДВУМЯ ГЛАГОЛАМИ, И ОБА — НЕ «СОХРАНИТЬ»: переименование
 * плитки (`rename` на её лице) и легаси-дверь `keep` в полосе «made earlier, not kept», которая
 * подбирает ровно два рода сирот — прогоны без имени в `params` (заморожены до круга 15) и
 * прогоны, упёршиеся в `library_full`. Обе зовут `kind = pattern`, `media_id` плитки и
 * `repeat_mm` ТОГО ПРОГОНА, который её сделал: контракт `DesignPatternParams` прямо говорит, что
 * ассет наследует это число, «чтобы „сгенерировано при 120 мм“ и „положено при 120 мм“ остались
 * одним утверждением об одной ткани, а не двумя, которые разъезжаются».
 */
export function patternAssets(band: GetDesignBandResponse): common_DesignAsset[] {
  return (band.assets ?? []).filter((a) => shelfOf(a.kind ?? '') === ASSET_PATTERN);
}

/** Эта плитка уже лежит на полке? Ищем по медиа: ассет держит `media_id`, а не `picture_id`. */
export function assetOfMedia(
  band: GetDesignBandResponse,
  mediaId: number,
): common_DesignAsset | undefined {
  if (!mediaId) return undefined;
  return patternAssets(band).find((a) => (a.mediaId ?? 0) === mediaId);
}

/** Есть ли ещё место на полке. Потолок серверный и считается по ВСЕЙ карточке, не по полке. */
export function shelfIsFull(band: GetDesignBandResponse): boolean {
  return (band.assets ?? []).length >= ASSETS_PER_CARD_MAX;
}

/**
 * ИМЯ НОВОГО ПАТТЕРНА. Сервер обязывает имя быть непустым и коротким, а промпт ЦИТИРУЕТ ассет по
 * имени — значит «IMG_4471» здесь недопустимо. Считаем по занятым именам, а не по длине полки:
 * удалённый «pattern 2» освобождает своё слово, а занятое чужой строкой не переиспользуется.
 */
export function nextPatternName(band: GetDesignBandResponse): string {
  const taken = new Set(
    (band.assets ?? []).map((a) => (a.name ?? '').trim().toLowerCase()).filter(Boolean),
  );
  for (let n = 1; n <= ASSETS_PER_CARD_MAX + 1; n += 1) {
    if (!taken.has(`pattern ${n}`)) return `pattern ${n}`;
  }
  return `pattern ${(band.assets ?? []).length + 1}`;
}

/* ─────────────────────────── раппорт ─────────────────────────── */

/**
 * РАППОРТ, ПРИВЕДЁННЫЙ К ТОМУ, ЧТО ПРИМЕТ ПРОВОД: целое число миллиметров, 0..REPEAT_MAX.
 * Мусор («12.5», «large», «-4») превращается в 0 — «не назван», единственное честное прочтение.
 */
export function normaliseRepeat(raw: string | number | undefined): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(REPEAT_MAX, Math.round(n));
}

/** Раппорт, при котором СДЕЛАН этот прогон. 0 = прогон его не называл, и выдумывать нечего. */
export function repeatOfRun(run?: common_DesignRun | null): number {
  return normaliseRepeat(run?.params?.pattern?.repeatMm ?? 0);
}

/** Адрес картинки плиты: полный кадр для сцены, миниатюра — для ряда. */
export const pictureFull = (p?: common_DesignPicture | null): string =>
  p?.media?.media?.fullSize?.mediaUrl || p?.media?.media?.thumbnail?.mediaUrl || '';

export const pictureThumb = (p?: common_DesignPicture | null): string =>
  p?.media?.media?.thumbnail?.mediaUrl || p?.media?.media?.fullSize?.mediaUrl || '';
