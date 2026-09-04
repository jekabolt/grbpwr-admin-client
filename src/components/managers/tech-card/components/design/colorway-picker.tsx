import type { GetDesignBandResponse, common_AdminColorwayRef } from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { assetThumb, fabricOfColorway } from './assets/model';
import { COLORWAY_NONE, renderBenchOccupied, colorwayOf } from './bench-kinds';
import { FieldRow, Hint, Swatch } from './render/field-row';

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
 * Что вернулось: `useColorwayChoice` (состояние студии, живёт у композитора) и `ColorwaySelect` —
 * ОДИН фильтр в правом конце ряда представлений (`kinds-strip.tsx`), видимый на render / 3D /
 * on-model и отсутствующий на flat и pattern.
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
  /** The card has not been read yet — the row draws a skeleton rather than «no colourways». */
  loading: boolean;
};

/**
 * ОДНО СОСТОЯНИЕ НА ВСЮ СТУДИЮ, И ЖИВЁТ ОНО У КОМПОЗИТОРА (`studio-tab.tsx`), как `kind`.
 *
 * Экраны его читают и переключают, но не владеют: второй владелец сделал бы возможной студию, где
 * полоса входа 3D показывает ROSSO, а прогон уезжает за OLIVE. Ремоунт генеративных экранов по
 * `key={colorwayId}` — работа композитора по той же причине.
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
  /**
   * ⚠ АРХИВНЫЕ НЕ ПРЕДЛАГАЮТСЯ, НО И НЕ СТИРАЮТСЯ ИЗ ИСТОРИИ. Предикат ровно один и добавлен
   * кругом 19 рядом с прежним (`id > 0`): архив — это «этим цветом больше не работают», и держать
   * его в списке значило бы звать человека покупать рендер под снятое имя. При этом РЕНДЕРЫ,
   * снятые под архивным колорвеем, остаются его рендерами: их атрибуция заморожена в прогоне, и
   * ни один экран её не переписывает — просто дверь к новым закрыта.
   *
   * ЛЕСТНИЦА ОСТАЛЬНЫХ СОСТОЯНИЙ (`DRAFT`/`ACTIVE`/`HIDDEN`) ЗДЕСЬ НЕ ЧИТАЕТСЯ НАРОЧНО. `HIDDEN`
   * — это про ВИТРИНУ, а не про студию: цвет, снятый с продажи, продолжают разрабатывать, и
   * спрятать его от рендера значило бы перепутать два разных «скрыт». `UNKNOWN` (старый бинарь,
   * поле не заполнено) законен и проходит.
   */
  const colorways = useMemo(
    () =>
      (techCard?.colorways ?? []).filter(
        (c) => (c.colorwayId ?? 0) > 0 && c.status !== 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED',
      ),
    [techCard],
  );

  const [colorwayId, setColorwayId] = useState<number>(COLORWAY_NONE);
  const settled = useRef(false);

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
              'renders filed without a colourway — everything made before colourways existed lives ' +
              'here. A real bench, selectable like any other, and a 3D run that names no colourway ' +
              'reads exactly it.'
            }
            onClick={() => setColorwayId(COLORWAY_NONE)}
          >
            <span className='flex items-center gap-1'>
              {/* ПУСТОЙ КВАДРАТ СО ШТРИХОВКОЙ — ГЛИФ, А НЕ ЦВЕТ. Закрасить его чем угодно значило
                  бы назвать цвет верстаку, у которого цвета нет по существу. */}
              <Swatch hex='' size={11} />
              no colourway
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
            'this card has no colourways — they are made on the colourways tab. Renders made here stay unattributed, which is a permanent, legal place for them.'}
        </Hint>
      ) : (
        !loading &&
        stated && <Hint>· marks a colourway whose render bench already holds a plate</Hint>
      )}
    </FieldRow>
  );
}

/**
 * ═══ ТОТ ЖЕ ВЫБОР, НО КАК АДРЕС БЛОКА, А НЕ КАК РЯД НАСТРОЙКИ (J-20) ══════════════════════════
 *
 * Владелец: «COLOURWAY и фабрик должен быть в одной строке настройки как два плейсхолдера … я не
 * понимаю зачем там 3 вообще двух достаточно». Ряд COLOURWAY на экране фабрик-рендера был первым
 * из трёх, и он единственный из трёх НЕ отвечал на вопрос «из чего этот рендер»: он отвечал на
 * «чей он». Это адрес, а не ингредиент.
 *
 * ПОЭТОМУ ОСЬ НЕ СНЯТА, А ПЕРЕЕХАЛА В ЗАГОЛОВОЧНУЮ ЛИНЕЙКУ БЛОКА (`Section action`) — то место,
 * которое DESIGN.md отдаёт фильтрам и счётчикам. Снять ось совсем было нельзя: ею ключуются
 * верстак рендеров (`0349`/`0356`), список выходов, ворота 3D и `params.colorway_id` каждого
 * прогона; «двух достаточно» сказано про настройки ткани, а не про то, чей это рендер.
 *
 * ⚠ ЗНАЧЕНИЕ ВСЕГДА ЕСТЬ СРЕДИ ПУНКТОВ, И ЭТО НЕ ПЕДАНТИЧНОСТЬ. Radix держит рядом со списком
 * скрытый нативный `<select>`; текущее значение, которого нет среди `<option>`, он принять не
 * может и присылает обратно ПУСТУЮ строку как «выбор человека». `no colourway` — полноценный
 * пункт со значением `'0'`, а не отсутствие пункта, поэтому выразить такое состояние нечем.
 *
 * ⚠ ЧИПОВЫЙ РЯД (`ColorwayPicker`) ЖИВ И НЕ ТРОНУТ: на 3D он по-прежнему первый ряд экрана, и его
 * снятие там — отдельный пункт владельца (J-27), отдельная волна и отдельный замер.
 */
export function ColorwaySelect({
  band,
  choice,
  disabled,
}: {
  band: GetDesignBandResponse;
  choice: ColorwayChoice;
  disabled?: boolean;
}): JSX.Element {
  const { colorwayId, setColorwayId, colorways, loading } = choice;
  const stated = !!band.renderBenchColorwayIds;
  const has = (id: number) => renderBenchOccupied(band.renderBenchColorwayIds, id);

  if (loading) {
    return (
      <Text size='micro' variant='label' component='span' className='normal-case'>
        reading this card’s colourways…
      </Text>
    );
  }

  /**
   * ⚠ КАРТОЧКА БЕЗ КОЛОРВЕЕВ — ЗАКОННОЕ СОСТОЯНИЕ, И ОТВЕЧАЕТ НА НЕГО САМ ОРГАН, А НЕ СТРОКА
   * ПРОЗЫ ПОД НИМ. Выбирать нечего: единственный пункт списка — `no colourway`, и он уже выбран.
   * Живой селект с одним пунктом читается как поломка («список не загрузился»), поэтому он гаснет
   * и НАЗЫВАЕТ причину заголовком — там же, куда человек ведёт курсор, чтобы его раскрыть.
   * Отдельного ряда с фразой не заводится: у ряда представлений нет и не должно быть прозы.
   */
  const none = colorways.length === 0;
  const emptyNote = 'this card has no colourways — make one on the COLORWAYS tab';

  return (
    <span data-cw-picker={colorwayId} className='inline-flex items-center gap-2'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        colourway
      </Text>
      <span className='w-[190px]' title={none ? emptyNote : undefined}>
        <SelectComponent
          name='design-render-colourway'
          value={String(colorwayId)}
          disabled={disabled || none}
          items={[
            {
              value: String(COLORWAY_NONE),
              label: `no colourway${stated && has(COLORWAY_NONE) ? ' ·' : ''}`,
            },
            ...colorways.map((c) => {
              const id = c.colorwayId ?? 0;
              return {
                value: String(id),
                label: `${colorwayLabel(c)}${stated && has(id) ? ' ·' : ''}`,
              };
            }),
          ]}
          onValueChange={(value: string) => {
            /* Пустая строка сюда доехать не может (см. шапку), но если доедет — это НЕ выбор
               человека, и молчание честнее записи. */
            if (!value) return;
            setColorwayId(Number(value) || COLORWAY_NONE);
          }}
          fullWidth
        />
      </span>
    </span>
  );
}
