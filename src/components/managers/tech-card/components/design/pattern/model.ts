import type {
  GetDesignBandResponse,
  common_DesignAsset,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';

import { ASSETS_PER_CARD_MAX, ASSET_PATTERN, shelfOf } from '../assets/model';
import { cardOutputRows } from '../bench-kinds';

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
 * ⚠ ПОСЛЕДНЯЯ ФРАЗА ПОЧИНЕНА ВМЕСТЕ С J-12, И ЕЩЁ РАЗ — С ШАГОМ ТКАНЕЙ (STEP 3, 2026-09-26). Она
 * звала «посмотреть на 3×3 выше», потом — на «лицо карточки», и оба раза на орган, которого на
 * экране уже нет: строка ВИДИМАЯ, и указатель в пустоту читается как поломка экрана. Теперь плитка
 * ткани стоит в карусели LAST FABRICS, и её лицо замощено 2×2 (`TiledFace`) — стык проходит по его
 * середине. Слово «tile» заменено на «fabric»: свотч слота — тоже ткань, а не только плитка
 * из фотографии.
 */
export const SEAM_WORDS =
  'the server measured this fabric’s join and found it visible — a border round the edge, or two ' +
  'sides that do not meet. The picture arrived and is saved, and it was paid for; what it will do ' +
  'is show a seam every repeat when the cloth is laid out. Its tile in LAST FABRICS lays it out ' +
  'four times, so the join runs through the middle — look there, and zoom in, before you use it ' +
  'for a slot.';

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
    'a fabric is extracted from one photograph, and this run named none. Put one into the cell of ' +
    'IMAGE TO FABRIC — from the library or from the clipboard.',
  one_source_picture:
    'a fabric is extracted from EXACTLY one photograph — two swatches glued together cannot be ' +
    'made to join to themselves. Leave one in the cell.',
  /* ─── три отказа свотча слота (режим `swatch`, STEP 3) ─── */
  no_colour:
    'a swatch is dyed from the colour it is given, and this run carried none. Pick a Pantone on ' +
    'the row and generate again.',
  one_texture_picture:
    'a swatch takes at most ONE texture picture — the weave and the surface are read from it, ' +
    'never its colour. Leave one texture on the row.',
  foreign_bom_line:
    'the slot this swatch was asked for is not a BOM line of this card any more — it was deleted ' +
    'or the card changed under the screen. Reload the card, then make the swatch on the slot as ' +
    'it stands now.',
  /* ─── полка полна: отказ двери ДО денег и посадка `done` с этим кодом ПОСЛЕ (след ряда) ─── */
  library_full:
    'the card holds as many assets as it may, so there is no place on it for a new fabric. Delete ' +
    'a fabric in LAST FABRICS below or in the CLOTHS grid of FABRIC RENDER, then generate again.',
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

/* ТИП `PatternGate` СНЕСЁН ВМЕСТЕ С ПОЛЕМ `door` (r3c). Он был `Gate & { door?: 'picture' | 'name' }`
   — «какая дверь чинит этот отказ», — и читала его ПОЛОСА ЗАМКА над рядом GENERATE. Полосы нет с
   круга F (`LockLine`/`focusName`/`openSlot` сняты), а единственный сегодняшний читатель ворот,
   `GenerateRow`, объявлен на общем `Gate` и берёт из него `ok`/`reason`. Поле, которое никто не
   читает, — это не «задел»: оно заставляет каждую новую ветку отказа выбирать значение, за
   которое некому спросить, и первая же выбравшая неверно об этом не узнает. Ворота этого экрана
   возвращают теперь ровно `Gate`, как у соседей. */

/* ═══ `patternTwin` СНЕСЁН: ДВОЙНИК ИМЕНИ ИЩЕТСЯ ПО ВСЕЙ ПОЛКЕ ТКАНЕЙ (ревью m-1) ═══════════════
   Он искал совпадение только среди паттернов, а карусель LAST FABRICS и сетка CLOTHS рисуют
   `fabric` и `pattern` одним рядом, и промпт рендера цитирует ткань по имени. Замена —
   `clothTwin` в `slot-fabrics.ts` (минт имени свотча и совет при переименовании на плитке);
   второго правила «какое имя занято» рядом с ним держать незачем. */

/* ═══ `patternGate` И ЦВЕТ «НИЧЕЙ ПАРЫ» СНЕСЕНЫ ВМЕСТЕ С ЭКРАНОМ, КОТОРЫЙ ИХ ЧИТАЛ (STEP 3) ════════
   Здесь стояли ворота прежнего экрана (источник · ИМЯ · двойник имени) и четыре органа цвета
   плитки — `PatternColour`, `patternColourRecipe`, `patternColourKey`, `recentPatternColours`
   (владелец, r2 §26: «цвет, который ни к чему не обязывает»). Экран шага переписан владельцем же
   (2026-09-26): цвет теперь СВОЙСТВО ПАРЫ (колорвей, слот), имя минтится, а не набирается, и у
   обоих прогонов свои ворота — `swatchGate` и `imageGate` в `slot-fabrics.ts`. Читателей у
   снесённого не осталось ни одного; держать их «на будущее» значило бы держать второе правило
   рядом с первым. */

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
 * ткани (`rename` на её плитке в карусели LAST FABRICS) и нижняя половина ячейки IMAGE TO FABRIC
 * (`+ tile from gallery` — снимок, который УЖЕ плитка, встаёт на полку как есть, без прогона).
 * Легаси-дверь `keep` в полосе «made earlier, not kept» снята вместе с полосой (STEP 3): у шага одна
 * история — карусель, а упёршийся в `library_full` прогон теперь не пускают ворота (`swatchGate`,
 * `imageGate`), вместо того чтобы подбирать его сиротой после оплаты.
 */
export function patternAssets(band: GetDesignBandResponse): common_DesignAsset[] {
  return (band.assets ?? []).filter((a) => shelfOf(a.kind ?? '') === ASSET_PATTERN);
}

/** Есть ли ещё место на полке. Потолок серверный и считается по ВСЕЙ карточке, не по полке. */
export function shelfIsFull(band: GetDesignBandResponse): boolean {
  return (band.assets ?? []).length >= ASSETS_PER_CARD_MAX;
}

/* `nextPatternName` («pattern N») и `assetOfMedia` СНЕСЕНЫ: первое заменено минтом имён шага
   (`mintSlotName` / `mintFabricName`, `slot-fabrics.ts`), второе читала только полоса «made
   earlier, not kept», которой больше нет (одна история на шаге — карусель LAST FABRICS). */

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
