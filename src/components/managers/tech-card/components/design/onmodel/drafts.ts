import type {
  GetDesignBandResponse,
  common_DesignColourRecipe,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ColourDraft } from '../render/drafts';
import { EMPTY_RECIPE } from '../render/model';

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
  const touched = useRef(false);
  const seeded = useRef(false);

  const latest = (band.colourRecipes ?? [])[0];
  useEffect(() => {
    if (touched.current || seeded.current || !latest) return;
    seeded.current = true;
    setRecipe({
      ...EMPTY_RECIPE,
      code: (latest.code ?? '').trim(),
      hex: (latest.hex ?? '').trim(),
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
    patch: (next) => {
      touched.current = true;
      // ТКАНЬ НЕ ПРОЛЕЗАЕТ И ЧЕРЕЗ ПРАВКУ. `patch` принимает `Partial<DesignColourRecipe>` — тип
      // общий на всю полосу, — поэтому сужение держится здесь, а не надеждой на вызывающего:
      // орган, который однажды передаст сюда лоскут, не сможет наполнить невидимое поле.
      setRecipe((prev) => ({ ...prev, ...next, fabricMediaId: 0, fabrics: [] }));
    },
    clear: (source) => {
      touched.current = true;
      setRecipe((prev) => {
        switch (source) {
          case 'photo':
            return prev;
          case 'colour':
            return { ...prev, code: '', hex: '' };
          default:
            return { ...prev, words: '' };
        }
      });
    },
  };
}
