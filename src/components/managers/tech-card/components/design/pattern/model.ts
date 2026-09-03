import type {
  GetDesignBandResponse,
  common_DesignAsset,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';

import { ASSETS_PER_CARD_MAX, ASSET_PATTERN, shelfOf } from '../assets/model';
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
    'library, from the clipboard, or one of this card’s cloths.',
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
 * ЧЕГО НЕ ХВАТАЕТ, ЧТОБЫ НАЖАТЬ GENERATE.
 *
 * ДЕНЕГ В ЭТИХ ВОРОТАХ НЕТ ВОВСЕ, И У ДВУХ СОСЕДЕЙ ТОЖЕ. Здесь стоял отказ по исчерпанному
 * дневному потолку; потолок снесён с обеих сторон провода («убери потолок»), и ворота, которые
 * читали бы его остатки, отказывали бы по факту, которого больше не бывает.
 *
 * ЧИСЛО КАРТИНОК ПРОВЕРЯЕТСЯ ЗДЕСЬ, ХОТЯ ЕГО ПРОВЕРЯЕТ И СЕРВЕР. Это не дубль правила: сервер
 * отвечает `one_source_picture` бесплатно, ДО резервации, — но отвечает он по сети и с задержкой,
 * а человек тем временем уже нажал кнопку с надписью «это стоит денег». Клиентская проверка не
 * заменяет серверную и ничего не гарантирует; она только не даёт нажать заведомо мёртвое.
 */
export function patternGate(band: GetDesignBandResponse, sourceMediaId: number): Gate {
  if (!sourceMediaId || sourceMediaId <= 0) {
    return {
      ok: false,
      reason:
        'no picture is attached — a repeating tile is made out of exactly one picture. Attach one ' +
        'above: from the library, from the clipboard, or one of this card’s cloths',
    };
  }
  return { ok: true };
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
 * ЭТА ВКЛАДКА И ЕСТЬ ТОТ ПИСАТЕЛЬ. Дверь «keep as cloth» зовёт `UpsertDesignAsset` с
 * `kind = pattern`, `media_id` плитки и `repeat_mm` ТОГО ПРОГОНА, который её сделал, — контракт
 * `DesignPatternParams` прямо говорит, что ассет наследует это число, «чтобы „сгенерировано при
 * 120 мм“ и „положено при 120 мм“ остались одним утверждением об одной ткани, а не двумя, которые
 * разъезжаются».
 *
 * НИЧЕГО НЕ ЗАВОДИТСЯ САМО. Прогон закончился — плитка лежит в ленте и НЕ на полке; на полку её
 * кладёт человек. Автоматическая запись сделала бы каждый эксперимент фактом о стиле, а полка
 * карточки ограничена сорока строками.
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
