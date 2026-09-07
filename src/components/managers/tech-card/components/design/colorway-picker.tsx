import type { GetDesignBandResponse, common_AdminColorwayRef } from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { assetThumb, fabricOfColorway } from './assets/model';
import { COLORWAY_NONE, renderBenchOccupied, colorwayOf } from './bench-kinds';
import { FieldRow, Hint, Swatch } from './render/field-row';
/* СЛОВО ОСИ 0 БЕРЁТСЯ У ВОРОТ, А НЕ ПИШЕТСЯ ЗДЕСЬ ВТОРОЙ РАЗ: подпись пункта и отказ, который
   человек прочтёт следом, обязаны быть одной строкой кода (`render/model.ts`, `SAMPLE_WORD`). */
import { SAMPLE_WORD } from './render/model';

/**
 * ═══ ⚠ ФАЙЛ ПРОСТОЯЛ ПРОДУКТОВО МЁРТВЫМ ОДИН КРУГ И ВЕРНУЛСЯ ОДНИМ ВЫЗОВОМ (16 → 19) ══════════
 *
 * КРУГ 16 СНЯЛ ОРГАНЫ. Владелец: «в MAKE A PATTERN оставь только имя убери колорвей» (E-1) и «в
 * GENERATION — FABRIC RENDER мы полностью убираем колорвеи только имена остаются» (E-16). После
 * этих двух пунктов у КАЖДОГО экспорта модуля стало ноль продуктовых вызывающих, и здесь стояла
 * записка, называвшая это вслух вместе с доводом не удалять файл под чужой незакрытой волной.
 *
 * КРУГ 19 ПОПРОСИЛ ОСЬ ОБРАТНО: «колорвеи для рендеров … как пробрасывать паттерны … как
 * сохранять». Записка не удалена, а ПЕРЕПИСАНА, потому что важен не итог, а то, чем два приказа
 * мирятся — и мирятся они ровно одним способом:
 *
 *   ВОЗВРАЩАЕТСЯ ОДИН ОРГАН, ОТВЕЧАЮЩИЙ НА ОДИН ВОПРОС — ЧЕЙ ЭТО РЕНДЕР.
 *
 * Что вернулось: `useColorwayChoice` (состояние студии, живёт у композитора) и `ColorwaySelect`.
 * ⚠ КРУГ r3 ПЕРЕСТАВИЛ ОРГАН С РЕЛЬСА НА ЭКРАН: он стоит `for:` в ряду GENERATE фабрик-рендера и
 * `build:` над сборкой 3D, а слота `action` у рельса больше нет вовсе. Довод — у самого
 * `ColorwaySelect` ниже: `colorway_id` прогона неизменяем, значит цель — часть покупки, а не
 * настройка представления, и стоять она обязана у денег.
 * Что НЕ вернулось и не вернётся этой волной: ряда колорвея на MAKE A PATTERN нет — E-1 стоит,
 * прогон-плитка по-прежнему шлёт `colorway_id: 0`; чипов «worn by ROSSO» нет — E-15 стоит; засева
 * тканью через `SetDesignAssetColorway`/`fabricOfColorway` нет — ссылка «одна ткань на колорвей»
 * не выражает N тканей, которые нужны рендеру; артикульных кодов в промпте нет — H-8 стоит, и имя
 * цвета в рецепте остаётся СВОБОДНЫМ, ровно как обещало «только имена остаются».
 * Второй сущности «рендерный колорвей» тоже не заведено: ось — это ПРОДУКТОВЫЙ колорвей карточки
 * (`AdminColorwayRef`), тот самый, которым уже ключуются верстак, ворота 3D и история.
 *
 * `ColorwayPicker` (ряд чипов) при этом ПО-ПРЕЖНЕМУ БЕЗ ВЫЗЫВАЮЩИХ — см. вторую записку ниже; ряд
 * чипов рядом с рядом представлений читался бы как «ещё пять представлений», а вопрос у него не
 * тот. Возвращён `ColorwaySelect`, потому что селект читается как фильтр, а фильтр — это и есть
 * «чей».
 *
 * ⚠ ОСЬ НЕ УМИРАЛА НИ НА ДЕНЬ, И ФАЙЛ — НЕ ЕЁ ЕДИНСТВЕННЫЙ СЛЕД. `params.colorway_id`, колонка
 * `design_bench_slot.colorway_id`, `render_bench_colorway_ids` в полосе и
 * `DesignRunKindTakesColorway` на сервере не тронуты ни одной строкой ни тем кругом, ни этим.
 * Именно поэтому возврат — это ВЫЗОВ, а не написанный заново механизм: круг 16 снял органы, не
 * тронув провода, и круг 19 обошёлся тем же.
 *
 * ═══ WHICH COLOURWAY THIS STUDIO IS WORKING ON — L-2 / L-3 ════════════════════════════════════
 *
 * Владелец: «у фабрик-рендера 1 колорвей — там мультивью, из него сплитом стороны, и так на каждый
 * колорвей», и «в 3д рендере выбираем колорвей, который будем рендерить». So the render bench is
 * per colourway and 3D builds from exactly one of them. This row is where that one is named.
 *
 * ═══ ЧТО ЗДЕСЬ НЕ ЯВЛЯЕТСЯ ПУСТЫМ СОСТОЯНИЕМ, И ЭТО ГЛАВНОЕ РЕШЕНИЕ ЭКРАНА ════════════════════
 *
 * `NO COLOURWAY` — ПЕРВЫЙ ЧИП РЯДА, ВСЕГДА, И РИСУЕТСЯ ОН ТЕМ ЖЕ ЧИПОМ, ЧТО ИМЕНОВАННЫЕ. Это не
 * «ничего не выбрано» и не ошибка: безколорвейный верстак — настоящий, выбираемый и вечно законный
 * (контракт: «every render made before the colourway axis stands on it», и 3D-прогон, не назвавший
 * колорвея, читает ровно его). Нарисовать его серым, курсивом или предупреждением значило бы
 * сказать человеку, что половина его карточек сломана, — а сломано в них ничего нет.
 *
 * ═══ ПОДПИСИ БЕРУТСЯ ИЗ РАЗРАБОТОЧНЫХ ПОЛЕЙ, А НЕ ИЗ ПЕРЕВОДОВ, И ЭТО ЗАМЕР, А НЕ ВКУС ════════
 *
 * `AdminColorwayRef` несёт `devName` / `colorCode` / `baseSku` — внутренние имена цвета, которые
 * заводит сама студия. Витринные переводы (`display.translations`) читать ЗАПРЕЩЕНО: на бете у
 * карточек семь языков, а `product_translation` заполнен только для `language_id = 1`, поэтому
 * пикер, собранный на переводах, выглядел бы у шести языков из семи пустым — и человек читал бы
 * это как сломанный орган, хотя сломаны данные и в другой подсистеме.
 */

/**
 * АРХИВНЫЙ — «ЭТИМ ЦВЕТОМ БОЛЬШЕ НЕ РАБОТАЮТ». Один предикат на хук и на оба органа: три написания
 * сравнения со строкой энума разошлись бы в первый же день, когда у статуса появится четвёртое
 * значение, и разошлись бы молча — тип у поля строковый.
 *
 * ⚠ ОРГАНОВ СТАЛО ТРИ, И ПОЭТОМУ ПРЕДИКАТ ЭКСПОРТИРУЕТСЯ (B-26, владелец: «также что бы во вкладке
 * паттернс мы могли привзать паттерн к колорвею»). Ряд «worn by» на плитке паттерна
 * (`pattern/pattern-library.tsx`) обязан отличать архивный колорвей от живого — и написать там
 * сравнение со строкой энума ЧЕТВЁРТЫЙ раз значило бы исполнить ровно тот дефект, о котором
 * предупреждает абзац выше. Изменено одно слово; тело, доводы и все прежние вызывающие не тронуты.
 */
export function archivedRef(ref?: common_AdminColorwayRef | null): boolean {
  return ref?.status === 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED';
}

/** ЧЕЛОВЕЧЕСКОЕ ИМЯ КОЛОРВЕЯ — одно определение на пикер, палитру и библиотеку паттернов. */
export function colorwayLabel(ref?: common_AdminColorwayRef | null): string {
  const dev = (ref?.devName ?? '').trim();
  if (dev) return dev;
  const code = (ref?.colorCode ?? '').trim();
  if (code) return code;
  const sku = (ref?.baseSku ?? '').trim();
  if (sku) return sku;
  const id = ref?.colorwayId ?? 0;
  return id > 0 ? `#${id}` : 'colourway';
}

/** Вторая строка чипа-носителя в палитре: чем именно этот колорвей ЕСТЬ, кроме имени. */
export function colorwaySubtitle(ref?: common_AdminColorwayRef | null): string {
  const parts = [
    (ref?.pantone ?? '').trim(),
    (ref?.colorCode ?? '').trim(),
    (ref?.devHex ?? '').trim(),
  ].filter(Boolean);
  return [...new Set(parts)].join(' · ');
}

export type ColorwayChoice = {
  /** `0` = the colourway-less bench. A value, never an absence. */
  colorwayId: number;
  setColorwayId: (id: number) => void;
  /** The card's colourways, in the card's own order. */
  colorways: common_AdminColorwayRef[];
  /** The picked one, or `null` under NO COLOURWAY. */
  current: common_AdminColorwayRef | null;
  /** Its human name; `''` under NO COLOURWAY, which the refusals spell out in words instead. */
  label: string;
  /**
   * ЭТИМ ЦВЕТОМ БОЛЬШЕ НЕ РАБОТАЮТ — резольвнутый ответ, а не статус, и он ЕДЕТ В ВОРОТА трёх
   * студий (`archivedColorwayGate`, `render/model.ts`). Считается тем же единственным предикатом
   * `archivedRef`, что и подписи пунктов: экран, называющий цвет архивным, и дверь, отказывающая
   * по архиву, обязаны читать одну строку кода, иначе первое же четвёртое значение статуса
   * разведёт их молча. Под `no colourway` `current` пуст, и здесь всегда `false` — безымянный
   * верстак архивным не бывает по существу.
   */
  archived: boolean;
  /** The card has not been read yet — the row draws a skeleton rather than «no colourways». */
  loading: boolean;
};

/**
 * ОДНО СОСТОЯНИЕ НА ВСЮ СТУДИЮ, И ЖИВЁТ ОНО У КОМПОЗИТОРА (`studio-tab.tsx`), как `kind`.
 *
 * Экраны его читают и переключают, но не владеют: второй владелец сделал бы возможной студию, где
 * полоса входа 3D показывает ROSSO, а прогон уезжает за OLIVE.
 *
 * ⚠ РЕМОУНТА ПО `key={colorwayId}` БОЛЬШЕ НЕТ (G2-3). Он стоял затем, чтобы черновик рецепта
 * пересевался на смене цвета; теперь селект цели живёт ВНУТРИ экрана, и ремоунт уносил бы его
 * собственное состояние. Пересев делает сам `useColourDraft` — и переселяет ТОЛЬКО цветную
 * половину: ткань и слова остаются, потому что ткань — свойство изделия, а цвет — колорвея.
 *
 * ═══ УМОЛЧАНИЕ: ТОТ ВЕРСТАК, ГДЕ У КАРТОЧКИ УЖЕ ЛЕЖАТ РЕНДЕРЫ ═════════════════════════════════
 *
 * Считается ОДИН РАЗ, когда полоса и карточка впервые сошлись, и человека после этого не двигает
 * (иначе первый же чужой рендер, приехавший с рефетчем, перекинул бы его на другой верстак посреди
 * работы). Правило: `0` в `render_bench_colorway_ids` ИЛИ у карточки нет колорвеев → NO COLOURWAY;
 * иначе первый колорвей ИЗ ТЕХ, У КОГО РЕНДЕРЫ ЕСТЬ, а если таких нет — первый колорвей карточки.
 *
 * ПОЧЕМУ НЕ «ВСЕГДА ПЕРВЫЙ КОЛОРВЕЙ». Легаси-карточка — их на бете большинство — открылась бы на
 * ИМЕНОВАННОМ и, значит, ПУСТОМ верстаке, притом что все её рендеры лежат рядом, на безколорвейном.
 * Снаружи это читается как пропажа данных, и первое, что делает человек, — идёт их искать.
 */
export function useColorwayChoice(
  techCardId: number | undefined,
  band: GetDesignBandResponse,
): ColorwayChoice {
  const { data: techCard, isLoading } = useTechCard(techCardId);

  const [colorwayId, setColorwayId] = useState<number>(COLORWAY_NONE);
  const settled = useRef(false);

  /**
   * ⚠ АРХИВ ЗАКРЫВАЕТ ДВЕРЬ К НОВОЙ РАБОТЕ, А НЕ К УЖЕ СДЕЛАННОЙ — И ЭТО ДВА РАЗНЫХ ПРЕДИКАТА,
   * А НЕ ОДИН.
   *
   * ЗДЕСЬ СТОЯЛ ОДИН (`status !== ARCHIVED`), И ПРОЗА РЯДОМ ОБЕЩАЛА РОВНО ТО, ЧЕГО ОН НЕ ДЕЛАЛ:
   * «рендеры, снятые под архивным колорвеем, остаются его рендерами … просто дверь к новым
   * закрыта». Замерено по ИСХОДУ, а не по намерению: этот список — И пункты селекта, И область
   * поиска умолчания ниже. ROSSO архивен и держит четыре рендера, OLIVE пуст → `withRenders`
   * состоит из одного ROSSO, найти его среди `colorways` нечем, умолчание падает на первый
   * колорвей карточки, FABRIC RENDER открывается ПУСТЫМ — а ROSSO нет ни в одном органе экрана.
   * Четыре плиты видны НИОТКУДА, и это тот самый исход («снаружи это читается как пропажа
   * данных»), против которого написан абзац про умолчание двадцатью строками ниже.
   *
   * ПОЭТОМУ АРХИВНЫЙ ОСТАЁТСЯ РОВНО В ДВУХ СЛУЧАЯХ, И ОБА — ПРО ДОСТИЖИМОСТЬ, А НЕ ПРО ВЫБОР:
   *   · `renderBenchOccupied` — «его верстак держит хотя бы одну плиту». «Не сказано» (старый
   *     бинарь, поля нет вовсе) этот помощник читает как «держит», и здесь это ПРАВИЛЬНАЯ сторона
   *     ошибки: лишнее имя в фильтре стоит одну строку списка, спрятанная работа — весь путь к ней;
   *   · `id === colorwayId` — на архивном МОЖНО СТОЯТЬ. Кто-то архивирует ROSSO, пока студия на
   *     нём открыта, `useTechCard` перечитывает карточку — и строка уходит из-под ног: подпись
   *     селекта пустеет, отказы начинают говорить «нет колорвея», а прогоны продолжают уезжать
   *     под ROSSO. Инвариант «значение всегда среди пунктов» держится ЗДЕСЬ, конструкцией, а не
   *     обещанием в шапке `ColorwaySelect`.
   *
   * ⚠ ВТОРАЯ ПОЛОВИНА ПРАВИЛА ЖИВЁТ НЕ ЗДЕСЬ, И ТЕПЕРЬ ОНА ЕСТЬ. Здесь стояла записка «ВОРОТА
   * ГЕНЕРАЦИИ АРХИВ НЕ ЧИТАЮТ … прогон под снятым именем физически возможен»: файл `render/model.ts`
   * принадлежал соседней волне, дверь была закрыта ТОЛЬКО СЛОВАМИ — подписью пункта `(archived)` и
   * строкой под органом, — и врать про запрет было нельзя. Волна закрыта, запрет поставлен:
   * `archivedColorwayGate` (`render/model.ts`) отказывает в НОВОМ прогоне на всех трёх генеративных
   * экранах — fabric render, 3D, on-model, — а хук отдаёт ему резольвнутый `archived`, посчитанный
   * ТЕМ ЖЕ `archivedRef`, что и подписи ниже. Значит подсказка и дверь говорят одно.
   *
   * ⚠ ЗАПРЕТ РОВНО НА НОВОЕ, И ЭТО НЕ ОГОВОРКА, А ВЕСЬ СМЫСЛ ДВУХ ПРЕДИКАТОВ ВЫШЕ. Сделанное под
   * архивным именем читается, размечается и режется как под живым: ворота стоят у кнопки прогона,
   * а не над экраном. Гасить пункт вместо этого по-прежнему НЕЛЬЗЯ — погашенный пункт прячет ту же
   * работу второй раз, то есть чинит дефект его же собственной половиной.
   *
   * ЛЕСТНИЦА ОСТАЛЬНЫХ СОСТОЯНИЙ (`DRAFT`/`ACTIVE`/`HIDDEN`) ЗДЕСЬ НЕ ЧИТАЕТСЯ НАРОЧНО. `HIDDEN`
   * — это про ВИТРИНУ, а не про студию: цвет, снятый с продажи, продолжают разрабатывать, и
   * спрятать его от рендера значило бы перепутать два разных «скрыт». `UNKNOWN` (старый бинарь,
   * поле не заполнено) законен и проходит.
   */
  const colorways = useMemo(
    () =>
      (techCard?.colorways ?? []).filter((c) => {
        const id = c.colorwayId ?? 0;
        if (id <= 0) return false;
        if (!archivedRef(c)) return true;
        return id === colorwayId || renderBenchOccupied(band.renderBenchColorwayIds, id);
      }),
    [techCard, band.renderBenchColorwayIds, colorwayId],
  );

  const withRenders = band.renderBenchColorwayIds;
  useEffect(() => {
    if (settled.current || isLoading) return;
    if (!colorways.length) {
      settled.current = true; // NO COLOURWAY, and the select says why. Полосы для этого не нужно.
      return;
    }
    /**
     * ⚠ ЗДЕСЬ СТОЯЛО `settled.current = true` ВЫШЕ ЭТОЙ ПРОВЕРКИ, И ЭТО СЪЕДАЛО ВСЁ ПРАВИЛО.
     *
     * ЗАМЕРЕНО ПО ПОРЯДКУ СОБЫТИЙ, А НЕ ПРЕДПОЛОЖЕНО. Хук ждёт ДВА чтения: карточку
     * (`useTechCard`) и полосу (`useDesignBand`), а сторожил только первое. Карточка приходит
     * РАНЬШЕ штатно — её же читает страница (`components/index.tsx`), и в студии это попадание в
     * кэш; полоса в этот момент ещё летит, и `renderBenchColorwayIds` у неё `undefined`
     * НАМЕРЕННО («не сказано», а не «нигде нет рендеров» — довод у самого `EMPTY_BAND`). Эффект
     * поэтому объявлял выбор УЛАЖЕННЫМ, выходил на этой самой строке и больше не исполнялся:
     * умолчание «первый колорвей, у которого уже есть рендеры» не срабатывало НИКОГДА, и студия
     * открывалась на безымянном верстаке даже там, где вся работа лежит под ROSSO.
     *
     * Дефект был СПЯЩИМ ровно один круг: с E-16 у хука не было вызывающих вовсе. Круг 19 вернул
     * вызывающего — значит вернул и его.
     *
     * ТЕПЕРЬ «НЕ СКАЗАНО» ЗНАЧИТ «ЖДЁМ», А НЕ «РЕШЕНО». На старом бинаре поле не появится никогда,
     * и хук так и останется неулаженным — исход тот же самый, что и раньше: `COLORWAY_NONE`,
     * безколорвейный верстак, где всё и лежало. Разница видна только там, где полоса приходит
     * позже карточки, то есть в обычном случае.
     */
    if (!withRenders) return;
    settled.current = true;
    if (withRenders.some((id) => colorwayOf({ colorwayId: id }) === COLORWAY_NONE)) return;
    const first = colorways.find((c) =>
      withRenders.some((id) => id === (c.colorwayId ?? 0)),
    );
    setColorwayId((first ?? colorways[0]).colorwayId ?? COLORWAY_NONE);
  }, [isLoading, colorways, withRenders]);

  /**
   * ⚠ ВТОРАЯ ПОЛОВИНА ИНВАРИАНТА: КОЛОРВЕЙ МОЖНО НЕ ТОЛЬКО АРХИВИРОВАТЬ, НО И УДАЛИТЬ.
   *
   * Архив строку из-под ног не выбивает (правило `colorways` выше держит выбранного при любом
   * статусе), а вот СНЕСЁННЫЙ колорвей исчезает из `techCard.colorways` вовсе — держать его
   * нечем, потому что держать нечего. Тогда выбор указывает в пустоту: подпись селекта пустеет,
   * `current` становится `null`, `label` — пустой строкой, и отказы соседних экранов начинают
   * говорить «нет колорвея», пока `params.colorway_id` каждого прогона по-прежнему несёт число
   * снесённого. Это не косметика, а расхождение экрана с проводом.
   *
   * ПОЭТОМУ ДРЕЙФ НЕ ПРОСТО ВИДЕН, А ИСПРАВЛЕН, И ИСПРАВЛЕН В ЕДИНСТВЕННУЮ СТОРОНУ, КОТОРАЯ
   * ЗАКОННА ВСЕГДА: `COLORWAY_NONE` — верстак, существующий на любой карточке (см. шапку файла).
   * Угадывать «соседний колорвей» здесь было бы хуже молчания: человек увидел бы чужое имя над
   * своей работой. Поправка ВИДНА, а не тиха: селект цели перескакивает на `sample`, а цветная
   * половина черновика переселяется по общему правилу `useColourDraft` (ремоунта по
   * `key={colorwayId}` больше нет — G2-3).
   *
   * `settled.current` этой поправке не сторож нарочно: он про УМОЛЧАНИЕ («не двигать человека
   * после того, как выбор однажды сделан»), а здесь двигать уже нечего — пункта нет.
   */
  useEffect(() => {
    if (isLoading || colorwayId === COLORWAY_NONE) return;
    if (colorways.some((c) => (c.colorwayId ?? 0) === colorwayId)) return;
    setColorwayId(COLORWAY_NONE);
  }, [isLoading, colorways, colorwayId]);

  const current = useMemo(
    () => colorways.find((c) => (c.colorwayId ?? 0) === colorwayId) ?? null,
    [colorways, colorwayId],
  );

  return {
    colorwayId,
    setColorwayId,
    colorways,
    current,
    label: current ? colorwayLabel(current) : '',
    archived: archivedRef(current),
    loading: !!techCardId && isLoading,
  };
}

/**
 * РЯД ЧИПОВ. Та же грамматика, что у CLOTHS: `FieldRow` + `ChipRow`, ни одного нового примитива —
 * «одна форма для одного жеста» на всей полосе.
 *
 * ПРИСУТСТВИЕ РЕНДЕРА — ГЛИФ, А НЕ СЧЁТЧИК, и это предел честности данных: `render_bench_colorway_ids`
 * говорит «у этого колорвея занят хотя бы один слот» и ничего больше. Считать плиты по колорвею со
 * страницы ленты нельзя — она одна страница, — и число на чипе было бы правдоподобной неправдой.
 */
/**
 * ⚠ У ЭТОГО РЯДА ЧИПОВ НЕ ОСТАЛОСЬ НИ ОДНОГО ПРОДУКТОВОГО ВЫЗЫВАЮЩЕГО — И ЭТО СОВМЕСТНЫЙ ЭФФЕКТ
 * ДВУХ ВОЛН ОДНОГО КРУГА, КОТОРЫЙ НИ ОДНА ИЗ НИХ ПО ОТДЕЛЬНОСТИ НЕ ВИДИТ.
 *
 * Замерено на ОБЪЕДИНЁННОМ дереве, а не на своей половине:
 *   · J-20 (эта волна) снял ряд с экрана фабрик-рендера — там теперь `ColorwaySelect`, компактный
 *     адрес блока в его заголовочной линейке;
 *   · J-27 (соседняя волна, вкладка 3D) снял поле колорвея оттуда целиком — `threed-studio.tsx`
 *     больше не упоминает этот компонент вовсе.
 * Читателей осталось двое, и оба — стенды проб (`cw-stand.tsx`).
 *
 * ЧТО С ЭТИМ ДЕЛАТЬ — РЕШЕНИЕ РЕВЬЮ ОБЪЕДИНЁННОГО ДИФФА, А НЕ ОДНОЙ ИЗ ВОЛН. Снести его отсюда
 * значило бы править файл под чужой незакрытой волной; оставить молча — завести ровно тот мёртвый
 * орган, против которого написан весь этот круг. Поэтому он назван вслух здесь.
 *
 * `colorwayLabel` / `colorwaySubtitle` / `useColorwayChoice` из этого же файла ЖИВЫ и нужны обеим
 * волнам — снос обязан коснуться ровно этой функции, а не файла.
 */
export function ColorwayPicker({
  band,
  choice,
  disabled,
  /** Что стоит под рядом на карточке БЕЗ колорвеев — экраны говорят разное, оба правдиво. */
  emptyNote,
}: {
  band: GetDesignBandResponse;
  choice: ColorwayChoice;
  disabled?: boolean;
  emptyNote?: string;
}): JSX.Element {
  const { colorwayId, setColorwayId, colorways, loading } = choice;
  const has = (id: number) => renderBenchOccupied(band.renderBenchColorwayIds, id);
  // Точка означает что-то ТОЛЬКО когда сервер список прислал: у старого бинаря `renderBenchOccupied`
  // отвечает «занят» на любой вопрос, и ряд точек над пустой карточкой был бы украшением.
  const stated = !!band.renderBenchColorwayIds;

  return (
    <FieldRow label='colourway' data-cw-picker={colorwayId}>
      {loading ? (
        <Text size='micro' variant='label' component='span' className='normal-case'>
          reading this card’s colourways…
        </Text>
      ) : (
        <ChipRow>
          <Chip
            nonForm
            selected={colorwayId === COLORWAY_NONE}
            pressed={colorwayId === COLORWAY_NONE}
            disabled={disabled}
            data-cw='none'
            title={
              'sampling — renders filed under no colourway of their own. A real bench, selectable ' +
              'like any other, and everything made before colourways existed stands on it.'
            }
            onClick={() => setColorwayId(COLORWAY_NONE)}
          >
            <span className='flex items-center gap-1'>
              {/* ПУСТОЙ КВАДРАТ СО ШТРИХОВКОЙ — ГЛИФ, А НЕ ЦВЕТ. Закрасить его чем угодно значило
                  бы назвать цвет верстаку, у которого цвета нет по существу. */}
              <Swatch hex='' size={11} />
              {SAMPLE_WORD}
              {stated && has(COLORWAY_NONE) ? ' ·' : ''}
            </span>
          </Chip>

          {colorways.map((c) => {
            const id = c.colorwayId ?? 0;
            const on = id === colorwayId;
            const renders = stated && has(id);
            /**
             * ЛИЦО ЧИПА — ТО ЖЕ, ЧТО ЛИЦО КОЛОРВЕЯ В РЯДУ FABRIC (H-12). Колорвей носит ЛИБО свой
             * цвет, ЛИБО плитку; чип, всегда рисующий `devHex`, показывал бы у набивного колорвея
             * цвет, которого в его рендерах не будет ни разу. Ткань есть — показываем ткань.
             * Одиннадцать пикселей плитки не «превью раппорта», а опознавательный знак: он отвечает
             * на «этот из тканевых?», и ровно на это его хватает.
             */
            const wornFace = assetThumb(fabricOfColorway(band, id));
            /* Архивный стоит в ряду только потому, что под ним лежит работа (или потому, что на
               нём стоят) — и говорит об этом сам, словом, а не оттенком: серый чип читался бы как
               «сломан», а сломанного в нём ничего нет. */
            const archived = archivedRef(c);
            return (
              <Chip
                key={id}
                nonForm
                selected={on}
                pressed={on}
                disabled={disabled}
                data-cw={id}
                title={[
                  colorwayLabel(c),
                  colorwaySubtitle(c),
                  wornFace ? 'wears a cloth of this card, so its chip shows the cloth' : '',
                  renders
                    ? 'its render bench holds at least one plate'
                    : 'no plate stands on its render bench yet',
                  archived
                    ? 'archived — kept here so its work stays reachable; file new work under a live colourway'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' — ')}
                onClick={() => setColorwayId(id)}
              >
                <span className='flex items-center gap-1'>
                  {wornFace ? (
                    <img
                      src={wornFace}
                      alt=''
                      aria-hidden='true'
                      data-cw-face={id}
                      className='size-[11px] shrink-0 border border-textColor object-cover'
                    />
                  ) : (
                    <Swatch hex={(c.devHex ?? '').trim()} size={11} />
                  )}
                  {colorwayLabel(c)}
                  {archived ? ' (archived)' : ''}
                  {renders ? ' ·' : ''}
                </span>
              </Chip>
            );
          })}
        </ChipRow>
      )}

      {!loading && colorways.length === 0 ? (
        /* НЕ ПУСТОЕ СОСТОЯНИЕ И НЕ ОШИБКА: работать можно, всё уезжает в безколорвейный верстак,
           ровно как жило до оси. Строка называет, ГДЕ колорвеи заводят, и что будет без них. */
        <Hint>
          {emptyNote ??
            'this card has no colourways yet — everything made here is filed as a sample, which is a permanent, legal place for it. A colourway is born on FABRIC RENDER.'}
        </Hint>
      ) : (
        !loading && (
          <>
            {stated && <Hint>· marks a colourway whose render bench already holds a plate</Hint>}
            {/* СТРОКА ПОЯВЛЯЕТСЯ ТОЛЬКО КОГДА В РЯДУ ЕСТЬ АРХИВНЫЙ: постоянная проза про случай,
                которого на экране нет, — это шум, а не документация. */}
            {colorways.some(archivedRef) && (
              <Hint>
                (archived) marks a colourway that is no longer worked on — it stands here so its
                renders stay reachable, and a new run is refused under it. Make new work under a
                live colourway.
              </Hint>
            )}
          </>
        )
      )}
    </FieldRow>
  );
}

/**
 * ═══ ОДИН СЕЛЕКТ — «ДЛЯ КОГО ЭТОТ ПРОГОН», И СТОИТ ОН У ДЕНЕГ (D2, G2-2/G2-3) ═════════════════
 *
 * ГДЕ ОН БЫЛ И ПОЧЕМУ УЕХАЛ. Круг 19 поставил его в слот `action` рельса шагов — «один фильтр на
 * всю студию, в единственном ряду, который переживает смену экрана». Довод был про МЕСТО и не
 * учёл того, что решает: `colorway_id` прогона НЕИЗМЕНЯЕМ (`design.proto`), то есть выбор цели —
 * это часть покупки, а не настройка представления. Спрятанный на рельсе, он оставлял человека с
 * историей, в которой ROSSO навсегда записан семплом. Теперь орган стоит РЯДОМ С `GENERATE`
 * («for:»), на 3D — над сборкой («build:»), и с рельса снят целиком (`chain-rail.tsx` слота
 * `action` больше не имеет).
 *
 * ОДНА ДВЕРЬ НА ОДИН ВОПРОС. У каждого экрана орган ровно один: render — `for:`; 3D — `build:`;
 * on-model — чипы в PAINT (та же `setColorwayId`, второе ЛИЦО одного состояния, а не второе
 * состояние). Владелец: «не делай разные кнопки для одного и того же».
 *
 * ⚠ ЗНАЧЕНИЕ ВСЕГДА ЕСТЬ СРЕДИ ПУНКТОВ, И ЭТО НЕ ПЕДАНТИЧНОСТЬ. Radix держит рядом со списком
 * скрытый нативный `<select>`; текущее значение, которого нет среди `<option>`, он принять не
 * может и присылает обратно ПУСТУЮ строку как «выбор человека». `sample` — полноценный пункт со
 * значением `'0'`, а не отсутствие пункта. Сужение списка (`only`, экран 3D) держит тот же
 * инвариант КОНСТРУКЦИЕЙ: выбранный id дописывается в список, даже если он сужение не прошёл, и
 * называет причину («no front render») вместо того, чтобы исчезнуть под человеком.
 *
 * ⚠ ПУНКТ `+ colourway…` — ДВЕРЬ, А НЕ ЗНАЧЕНИЕ. Он ничего не выбирает: обработчик ловит его
 * раньше `setColorwayId`, открывает окно рождения и оставляет значение прежним. Поэтому и `value`
 * остаётся тем, чем был, — контролируемый Radix откатывает список сам.
 */
const CREATE_ITEM = '__create__';

export function ColorwaySelect({
  band,
  choice,
  disabled,
  /**
   * Подпись слева от органа. `for` у ряда GENERATE (для кого этот прогон), `build` на 3D (что
   * собираем). Умолчание оставлено прежним ради вызывающего, который спрашивает просто «чей».
   */
  label = 'colourway',
  /**
   * Открыть окно рождения колорвея. Задан — в конце списка стоит пункт `+ colourway…`; не задан —
   * пункта нет вовсе (дверь, которая никуда не ведёт, хуже отсутствующей).
   */
  onCreate,
  /**
   * СУЖЕНИЕ СПИСКА ЭКРАНОМ, а не фильтр состояния. `undefined` — не сужено. 3D передаёт сюда
   * колорвеи, у которых на render-верстаке стоит FRONT: собирать можно только из них, и список,
   * предлагающий остальные, продавал бы отказ.
   */
  only,
  /** Якорь для проб и для отладки: чем этот селект отличается от соседнего. */
  probe = 'design-render-colourway',
}: {
  band: GetDesignBandResponse;
  choice: ColorwayChoice;
  disabled?: boolean;
  label?: string;
  onCreate?: () => void;
  only?: readonly number[];
  probe?: string;
}): JSX.Element {
  const { colorwayId, setColorwayId, colorways, current, loading } = choice;
  const stated = !!band.renderBenchColorwayIds;
  const has = (id: number) => renderBenchOccupied(band.renderBenchColorwayIds, id);

  if (loading) {
    return (
      <Text size='micro' variant='label' component='span' className='normal-case'>
        reading this card’s colourways…
      </Text>
    );
  }

  /** Прошёл ли колорвей сужение экрана. Выбранный проходит ВСЕГДА — иначе он выпадет из списка. */
  const allowed = (id: number) => !only || only.includes(id) || id === colorwayId;
  const offered = colorways.filter((c) => allowed(c.colorwayId ?? 0));
  const sampleOffered = allowed(COLORWAY_NONE);
  /** Почему пункт стоит, хотя сужение он не прошёл: экран обязан сказать это словом. */
  const outsideNote = (id: number) => (only && !only.includes(id) ? ' · no front render' : '');

  /**
   * ⚠ КАРТОЧКА БЕЗ КОЛОРВЕЕВ — ЗАКОННОЕ СОСТОЯНИЕ, И ОРГАН ГАСНЕТ ТОЛЬКО КОГДА ВЫБИРАТЬ НЕЧЕГО
   * ВОВСЕ. Пока дверь рождения задана, выбирать ЕСТЬ ЧТО — `+ colourway…` — и погашенный список
   * запирал бы единственный путь к первому колорвею карточки.
   */
  const nothing = offered.length === 0 && !onCreate && !(sampleOffered && colorwayId !== COLORWAY_NONE);
  const emptyNote = 'this card has no colourways yet — everything here is filed as a sample';
  /**
   * ⚠ АРХИВНЫЙ ПУНКТ ОБЪЯСНЯЕТСЯ РОВНО ТАМ, ГДЕ ОН ВЫБРАН, И НИГДЕ БОЛЬШЕ: подпись `(archived)` в
   * пункте называет ФАКТ, заголовок органа — ПОСЛЕДСТВИЕ. Последствие настоящее — прогон под
   * архивным именем отказан (`archivedColorwayGate`), — поэтому фраза называет отказ, а не совет.
   */
  const archivedNote = archivedRef(current)
    ? `${colorwayLabel(current)} is archived — this colourway is no longer worked on. Its bench ` +
      'stays here to read, mark and split; a new run is refused under it, so pick a live ' +
      'colourway to make more.'
    : undefined;

  return (
    <span data-cw-picker={colorwayId} className='inline-flex items-center gap-2'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      <span className='w-[190px]' title={nothing ? emptyNote : archivedNote}>
        <SelectComponent
          name={probe}
          value={String(colorwayId)}
          disabled={disabled || nothing}
          items={[
            ...(sampleOffered
              ? [
                  {
                    value: String(COLORWAY_NONE),
                    /* `·` говорит про ВЕРСТАК («на нём уже стоит плита»), и только когда сервер
                       список прислал: у старого бинаря помощник отвечает «занят» на любой вопрос,
                       и точка стала бы украшением. */
                    label: `${SAMPLE_WORD}${stated && has(COLORWAY_NONE) ? ' ·' : ''}`,
                  },
                ]
              : []),
            ...offered.map((c) => {
              const id = c.colorwayId ?? 0;
              /* Три хвоста подписи значат РАЗНОЕ и потому написаны по-разному: `(archived)` — про
                 имя цвета, `·` — про его верстак, `no front render` — про сужение этого экрана.
                 Свести их к одному глифу значило бы сложить факты в один, не отвечающий ни на
                 один из трёх вопросов. */
              return {
                value: String(id),
                label: `${colorwayLabel(c)}${archivedRef(c) ? ' (archived)' : ''}${
                  stated && has(id) ? ' ·' : ''
                }${outsideNote(id)}`,
              };
            }),
            ...(onCreate ? [{ value: CREATE_ITEM, label: '+ colourway…' }] : []),
          ]}
          onValueChange={(value: string) => {
            /* Пустая строка сюда доехать не может (см. шапку), но если доедет — это НЕ выбор
               человека, и молчание честнее записи. */
            if (!value) return;
            if (value === CREATE_ITEM) {
              /* ДВЕРЬ, А НЕ ЗНАЧЕНИЕ: выбор не двигается, окно открывается, и цель переключит уже
                 `onCreated` — на тот id, который вернул сервер. */
              onCreate?.();
              return;
            }
            setColorwayId(Number(value) || COLORWAY_NONE);
          }}
          fullWidth
        />
      </span>
    </span>
  );
}
