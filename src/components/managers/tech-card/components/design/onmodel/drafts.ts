import type {
  GetDesignBandResponse,
  common_DesignColourRecipe,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useCallback, useEffect, useRef, useState } from 'react';

import { echoOf, mergeEcho, type ColourDraft, type TypedColour } from '../render/drafts';
import { EMPTY_CLOTH, EMPTY_RECIPE, clampColourName, type ClothDraft } from '../render/model';

/**
 * ФОТОГРАФИИ, КОТОРЫЕ ЭТОТ ПРОГОН ПЕРЕКРАСИТ — состояние меню, а не данные карточки.
 *
 * ЭТО ЧЕРНОВИК ТОЙ ЖЕ ПРИРОДЫ, ЧТО `useColourDraft`: он живёт во вкладке, умирает вместе с ней и
 * доезжает до сервера ровно один раз, внутри `StartDesignRun.params.extra_input_media_ids`. Дальше
 * его хранит СНИМОК ВХОДОВ прогона, который собирает сервер, — то есть «какие фотографии мы
 * перекрашивали» навсегда отвечает история, а не эта переменная.
 *
 * ⚠ СНИМКИ НЕ ЗАВОДЯТСЯ КАК `DesignPicture` КАРТОЧКИ, И ЭТО РЕШЕНИЕ, А НЕ ЭКОНОМИЯ.
 * `RegisterDesignUpload` умеет ровно три рода — `flat | render | threed`, — и ни один из них не
 * значит «фотография вещи на живом человеке». Записать её флэтом значило бы соврать дважды: она
 * появилась бы в ленте кандидатов фабрик-рендера как чертёж и уехала бы в промпт как чертёж.
 * `extra_input_media_ids` — это FK на `media(id)`, и контракт называет их для рекола ПЕРВИЧНЫМ
 * входом, а не приложением: «on `recolor` they are THE PHOTOGRAPHS BEING RECOLOURED». Поэтому в
 * прогон едет медиа как медиа.
 *
 * ЧЕРНОВИК НЕ ЗАСЕВАЕТСЯ ПРОШЛЫМ ПРОГОНОМ, в отличие от рецепта цвета. Цвет — свойство изделия и
 * повторяется; съёмка — событие, и подставить вчерашние кадры в сегодняшний платный прогон значило
 * бы купить их второй раз молча.
 */

export type RecolorSources = {
  /** Кадры в порядке добавления. Порядок виден на полосе и уезжает на провод тем же. */
  items: common_MediaFull[];
  /** Идентификаторы для провода, в том же порядке; мусорные нули отброшены. */
  mediaIds: number[];
  add: (media: common_MediaFull[]) => void;
  remove: (mediaId: number) => void;
  clear: () => void;
};

export function useRecolorSources(): RecolorSources {
  const [items, setItems] = useState<common_MediaFull[]>([]);

  const add = useCallback((media: common_MediaFull[]) => {
    setItems((prev) => {
      // ОДИН И ТОТ ЖЕ ФАЙЛ ДВАЖДЫ — ЭТО ДВА ПЛАТНЫХ ВЫЗОВА ЗА ОДНУ КАРТИНКУ. Библиотека охотно
      // отдаёт один и тот же кадр повторно (человек выбирает по эскизу и не помнит, что уже брал
      // его), а цена здесь линейна по числу снимков. Поэтому дубли снимаются по id, молча: их
      // отказ не про человека, а про то, что второй экземпляр не добавляет ни одного пикселя.
      const seen = new Set(prev.map((m) => m.id ?? 0));
      const fresh = media.filter((m) => (m.id ?? 0) > 0 && !seen.has(m.id ?? 0));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  const remove = useCallback((mediaId: number) => {
    setItems((prev) => prev.filter((m) => (m.id ?? 0) !== mediaId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return {
    items,
    mediaIds: items.map((m) => m.id ?? 0).filter((id) => id > 0),
    add,
    remove,
    clear,
  };
}

/* ─────────────────────────── целевой цвет ─────────────────────────── */

/**
 * ЦЕЛЕВОЙ ЦВЕТ ПЕРЕКРАСКИ — ТОТ ЖЕ `ColourDraft`, ЧТО У ФАБРИК-РЕНДЕРА, С ОДНИМ СУЖЕНИЕМ.
 *
 * ТИП ОДИН НАМЕРЕННО: цвет здесь тот же предмет, и орган выбора (`ColourStatementRow`) обязан быть
 * буквально тем же компонентом, а не похожим. Всё, чем этот черновик отличается, — ЧТО ОН МОЖЕТ
 * СОДЕРЖАТЬ.
 *
 * ⚠ ПОЧЕМУ НЕ `useColourDraft` ЦЕЛИКОМ — ЗАМЕРЕННЫЙ ДЕФЕКТ, А НЕ ЧИСТОПЛЮЙСТВО. Тот хук засевает
 * черновик ПОСЛЕДНИМ РЕЦЕПТОМ КАРТОЧКИ, а рецепт фабрик-рендера несёт ещё и `fabric_media_id` со
 * списком `fabrics` — фотографию ткани и полку тканей. На этом экране их нечем показать: ряда
 * CLOTHS здесь нет и быть не должно (перекрашивают снимок, а не шьют из ткани). То есть карточка,
 * рендерившаяся с лоскутом, открыла бы ON MODEL с невидимым лоскутом в черновике, отправила бы его
 * в промпт — и ворота открылись бы ПО НЕМУ: `recipeIsStated` считает фотографию достаточным
 * заявлением. Человек видел бы пустой цвет и живую кнопку GENERATE.
 *
 * Поэтому засев здесь СУЖЕН до двух полей, которые на обоих экранах значат одно и то же: кода и
 * hex. Ткань не переносится и не заводится вовсе — `fabricMediaId` и `fabrics` в этом черновике
 * пусты по построению, а не по забывчивости, — а `words` не переносится по отдельной причине,
 * которая стоит на месте засева: одно поле провода, два разных смысла.
 *
 * ЗАСЕВ ОДИН РАЗ И ТОЛЬКО ПОКА НЕ ТРОНУТО, как у соседа: любая запись на карточке инвалидирует
 * полосу, и без этого сторожа перечитывание залезло бы в наполовину сделанный выбор и заменило бы
 * его последним законченным.
 */
export function useTargetColourDraft(band: GetDesignBandResponse): ColourDraft {
  const [recipe, setRecipe] = useState<common_DesignColourRecipe>(EMPTY_RECIPE);
  /**
   * ═══ ПРОЗРАЧНОСТЬ И ГРАММАЖ ЖИВУТ И ЗДЕСЬ — НАСТОЯЩИМ СОСТОЯНИЕМ, А НЕ ЗАГЛУШКОЙ (H-13) ══════
   *
   * Ряда CLOTH IS на перекрасе НЕТ, и это решение, а не пробел: владелец назвал свойство ткани для
   * ГЕНЕРАЦИИ ФАБРИК-РЕНДЕРОВ, а перекрас работает по уже снятой ткани — её граммаж на фотографии
   * виден, и объявлять его словами значило бы спорить со снимком. Значит это состояние здесь никто
   * не заполняет.
   *
   * Но пустой писатель (`patchCloth: () => {}`) был бы ХУЖЕ, чем настоящий: орган, смонтированный
   * сюда однажды по недосмотру, молча съедал бы выбор человека и выглядел бы рабочим. Тип общий на
   * оба экрана, поэтому и реализация общая; разница между экранами — в том, что смонтировано, а не
   * в том, что молча не работает.
   */
  const [cloth, setCloth] = useState<ClothDraft>(EMPTY_CLOTH);
  const touched = useRef(false);
  const seeded = useRef(false);
  /** Что человек набрал сам — то же правило ранга, что у соседа; довод целиком в `../render/drafts`. */
  const owned = useRef({ code: false, hex: false, words: false });

  const latest = (band.colourRecipes ?? [])[0];
  useEffect(() => {
    if (touched.current || seeded.current || !latest) return;
    seeded.current = true;
    // ТА ЖЕ ДВЕРЬ РАЗБОРА ИСТОЧНИКА, ЧТО У СОСЕДА (`echoOf`), И СУЖЕНИЕ ПОВЕРХ НЕЁ. Своё чтение
    // полей прошлого рецепта было бы вторым написанием правила, которое уже однажды потерялось.
    const echo = echoOf({ from: 'recipe', recipe: latest });
    setRecipe({
      ...EMPTY_RECIPE,
      code: echo.code ?? '',
      hex: echo.hex ?? '',
      // ⚠ `words` НЕ ПЕРЕНОСИТСЯ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ. Поле на проводе одно, а значит оно на
      // двух экранах РАЗНОЕ: у фабрик-рендера это ТКАНЬ словами («heavy cotton twill»), здесь —
      // ЦВЕТ словами («washed indigo, faded at the seams»). Засеянное «heavy cotton twill»
      // уехало бы в перекраску инструкцией сменить МАТЕРИАЛ на фотографии — ровно то, чего
      // перекраска делать не должна, и человек прочитал бы это как готовую строку, а не как
      // чужую. Замерено на стенде: карточка, рендерившаяся твилом, открывала ON MODEL с твилом
      // в поле «in words».
    });
  }, [latest]);

  return {
    recipe,
    cloth,
    patchCloth: (next) => {
      touched.current = true;
      setCloth((prev) => ({ ...prev, ...next }));
    },
    /**
     * ТИПОВАННЫЙ ВХОД — БУКВА В БУКВУ ТОТ ЖЕ, ЧТО У СОСЕДА, И ТКАНЬ ЧЕРЕЗ НЕГО НЕ ПРОЛЕЗАЕТ УЖЕ
     * ПО ТИПУ: `TypedColour` знает три скаляра и не знает ни `fabrics`, ни `fabric_media_id`.
     * Раньше сужение держал `fabricMediaId: 0, fabrics: []` в теле — то есть надежда на то, что
     * следующий редактор эту строку заметит.
     */
    typed: (next) => {
      touched.current = true;
      const clean: TypedColour = {};
      // ⚠ ПРЕДЕЛ ИМЕНИ ПРИМЕНЯЕТСЯ И ЗДЕСЬ. Раньше его знал ТОЛЬКО черновик рендера, хотя орган
      // выбора цвета у двух экранов ОДИН: `maxLength` держал набор с клавиатуры, а вставку — нет.
      if (next.code !== undefined) clean.code = clampColourName(next.code);
      if (next.hex !== undefined) clean.hex = next.hex;
      if (next.words !== undefined) clean.words = next.words;
      for (const key of ['code', 'hex', 'words'] as const) {
        const value = clean[key];
        if (value === undefined) continue;
        owned.current[key] = value.trim() !== '';
      }
      setRecipe((prev) => ({ ...prev, ...clean }));
    },
    /**
     * ⚠ ЭХО-ВХОД ЗДЕСЬ НАСТОЯЩИЙ, НО СУЖЕННЫЙ ДО ЦВЕТА — И СУЖЕНИЕ ЖИВЁТ У ДВЕРИ, А НЕ У
     * ВЫЗЫВАЮЩЕГО. Пустой писатель (`echo: () => {}`) был бы ХУЖЕ: орган, смонтированный сюда
     * однажды по недосмотру, молча съедал бы производное и выглядел бы рабочим.
     *
     * ЧТО ИМЕННО ОТБРАСЫВАЕТСЯ И ПОЧЕМУ:
     *   · ТКАНЬ — ряда CLOTHS на перекрасе нет и быть не должно (перекрашивают снимок, а не шьют
     *     из ткани), а `recipeIsStated` считает фотографию достаточным заявлением: невидимый
     *     лоскут открыл бы ворота GENERATE при пустом цвете;
     *   · СЛОВА — поле провода одно, а смысл у него на двух экранах РАЗНЫЙ: у фабрик-рендера это
     *     ТКАНЬ словами («heavy cotton twill»), здесь — ЦВЕТ словами («washed indigo»). Замерено:
     *     карточка, рендерившаяся твилом, открывала ON MODEL с твилом в поле «in words», то есть
     *     перекрас получал приказ сменить МАТЕРИАЛ на фотографии.
     */
    echo: (source) => {
      touched.current = true;
      const values = echoOf(source);
      setRecipe((prev) =>
        mergeEcho(prev, { code: values.code, hex: values.hex }, owned.current),
      );
    },
    clear: (source) => {
      touched.current = true;
      if (source === 'colour') {
        owned.current.code = false;
        owned.current.hex = false;
        setRecipe((prev) => ({ ...prev, code: '', hex: '' }));
        return;
      }
      owned.current.words = false;
      setRecipe((prev) => ({ ...prev, words: '' }));
    },
  };
}
