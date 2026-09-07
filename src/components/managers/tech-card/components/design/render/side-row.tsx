import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { refColorwayFor } from '../bench-kinds';
import { InertDoor, pictureUrl } from '../bench-slot';
import { archivedRef, colorwayLabel } from '../colorway-picker';
import { PlaceOrDrawCell, EMPTY_WORD } from '../core';
import { VectorModal } from '../modals';
import { PictureTile } from '../picture-tile';
import { readProvenance } from '../provenance';
import { uploadItem } from '../upload-item';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { SILHOUETTE_VIEWS, isCardinalView, viewLabel } from '../views';
import { Swatch } from './field-row';
import {
  RENDER_MIN_VIEWS,
  benchSides,
  findDictionaryColour,
  slotOrigin,
  threedRevisions,
  threedSides,
  type BenchSide,
} from './model';


/**
 * ═══ THE SIDES OF A CARD — ONE TABLE ON FABRIC RENDER, ONE STRIP ON 3D ═══════════════════════
 *
 * A card has six silhouette sides, and TWO benches read by that key:
 *
 *   the FLAT bench   (`benchSides(band, 'flat', 0)`) — what a render is made FROM. Колорвея у этой
 *                    оси нет по существу: она читается и пишется под нулём всегда.
 *   the RENDER bench (`threedSides(band, colorwayId)`) — what came BACK, and therefore what the 3D
 *                    run reads.
 *
 * ⚠ ДВЕ ЛЕНТЫ НАД БЛОКОМ FABRIC RENDER СНЯТЫ, ВМЕСТО НИХ ОДНА ТАБЛИЦА (r2 п.29, рулинг r1 §8.3).
 * Владелец: «в FABRIC RENDER раньше было лучше чем сейчас … только таблицу вместо двух лент». Две
 * ленты показывали одну и ту же сторону дважды, в двух местах экрана, и связь «что во что
 * превратилось» приходилось угадывать по порядку ячеек. `SidesSection` — СВОЙ БЛОК, стоящий над
 * RENDERS OF THIS CARD (r2 п.29 перекрывает рулинг r1 §8.9 «под»), строкой на сторону:
 *
 *   SIDE · FLATS IN · sample · ROSSO · OLIVE (archived) · + colourway
 *
 * ⚠ ТАБЛИЦА ПЕРЕЕХАЛА НА ОСЬ КОЛОРВЕЯ (r3 п.28/29/32). Столбец «RENDERS BACK» был ОДИН и показывал
 * верстак ВЫБРАННОГО цвета — то есть две трети экрана пустовали, а соседний цвет был невидим, пока
 * его не выберешь. Теперь столбец на колорвей, они заполняют ширину, а «какой цвет мы сейчас
 * заказываем» говорит подчёркнутый заголовок (он же — вторая дверь к цели прогона).
 *
 * ШЕСТЬ СТРОК, НЕ ЧЕТЫРЕ. Верстак — шесть слотов (`SILHOUETTE_VIEWS`), и жест «apply splitted»
 * «неназванную занятую сторону очищает»: четыре строки над шестисторонним верстаком дали бы дверь,
 * вычищающую слоты, которых человек не видит.
 *
 * На 3D тот же рендер-верстак читается лентой (`RendersByViewGroup`) с дверью назад на FABRIC
 * RENDER у каждой пустой ячейки. Ничего там не размечается: заполненный слот И ЕСТЬ членство
 * стороны в 3D-прогоне (`sides.filter(s => s.picture)`), отдельной галочки нет.
 *
 * ОДНА ГРАММАТИКА ЯЧЕЙКИ на таблицу и на ленту: занятая — плита (`PictureTile`: зум в общий ряд
 * студии, тихие углы `edit` / `✕`, когда вызывающий их даёт) с подписью происхождения (`run r7` /
 * `by hand`); пустая — коробка ТОГО ЖЕ РОСТА, пунктиром. Рост один (`CELL_PX`), потому что «пустой
 * плейсхолдер больше самой плитки» — жалоба владельца, а не мелочь.
 */

/** ОДНА МЕРА НА ТАБЛИЦУ И НА ЛЕНТУ (138px, мера макета): ширина ячейки и кадр плиты. */
const CELL_PX = 138;
/**
 * Подвал плиты (`.cap`: происхождение, у ленты ещё и имя стороны) — ЗАМЕРЕННЫЕ 24px нано-строки с
 * полями и волосяной линией. Пустая коробка обязана быть ростом В ПЛИТУ ЦЕЛИКОМ, иначе ряд ячеек
 * разъезжается по нижнему краю — ровно то, на что владелец жаловался («плейсхолдеры больше самих
 * блоков тамбнейлов»), только в другую сторону. Число проверяется пробой: она меряет обе коробки и
 * требует совпадения, поэтому смена кегля не переживёт гейта молча.
 */
const PLATE_FOOTER_PX = 24;
const EMPTY_PX = CELL_PX + PLATE_FOOTER_PX;
/**
 * ПУСТАЯ РЕНДЕР-СТОРОНА — ОДИН ТЕКСТ НА ДВЕ ЛЕНТЫ. Она говорилась двумя фразами: «empty · mark
 * one below» в таблице SIDES и «empty · fill it on the fabric render» в ленте входа 3D. Состояние
 * у них ОДНО, и разными в них были только двери — а дверь называет `title`, стоящий на самой
 * коробке. Слово состояния берётся у студии (`EMPTY_WORD`), глагол — общий: пометку ставят на
 * самой картинке, где бы список картинок ни лежал.
 */
const EMPTY_RENDER_SIDE = `${EMPTY_WORD} · mark one`;
/** The strip's cell — the mockup's `.pstrip-i`. */
const CELL = 'flex w-[138px] shrink-0 flex-col gap-1';
/** The plate is square, as the mockup's `.ph`; a drawing is contained in it, never cropped. */
const PLATE_ASPECT = '1/1';

/** `run r7` / `by hand` — where a plate came from, as the mockup's origin pill spells it. */
function originWord(band: GetDesignBandResponse, side: BenchSide): string {
  const origin = slotOrigin(band, side);
  if (origin.rrev > 0) return `run r${origin.rrev}`;
  const provenance = side.picture ? readProvenance(side.picture) : null;
  if (provenance?.runId) return `run ${provenance.runId}`;
  return 'by hand';
}

/**
 * THE STRIP — `.pstrip`: a horizontal row that scrolls INSIDE its own box. A page that scrolls
 * sideways to show six cells takes every other block with it (DESIGN.md: the page never scrolls
 * sideways).
 */
function Strip({ children, ...rest }: { children: ReactNode; [k: `data-${string}`]: unknown }) {
  return (
    <div {...rest} className='flex items-stretch gap-2 overflow-x-auto pb-1'>
      {children}
    </div>
  );
}

/**
 * ONE FILLED PLATE. The frame is the studio's `PictureTile` (zoom into the shared viewer, the quiet
 * corners `edit` / `✕` when the caller hands them in); under it the footer of the mockup's `.cap`:
 * the side on the left, the origin pill on the right. The ink border around both is the mockup's
 * «filled» weight against the dashed «empty» one.
 */
function Plate({
  picture,
  /** Имя стороны ДЛЯ РЕЧИ — `aria-label` и подсказки углов. Есть всегда: «unmark» без имени
   *  стороны читалкой неотличим от пяти таких же на экране. */
  name,
  /** Имя стороны, НАПЕЧАТАННОЕ В ПОДВАЛЕ. В таблице не печатается: сторону называет её колонка, и
   *  второе имя было бы тем же фактом, сказанным дважды. В ленте 3D — печатается. */
  label = '',
  required,
  origin,
  alt,
  onRemove,
  onEdit,
  saving,
}: {
  picture: common_DesignPicture;
  name: string;
  label?: string;
  required?: boolean;
  origin: string;
  alt: string;
  onRemove?: () => void;
  onEdit?: () => void;
  saving?: boolean;
}): JSX.Element {
  return (
    <div className='flex flex-col border border-textColor bg-bgColor' data-slot-filled=''>
      <PictureTile
        url={pictureUrl(picture)}
        alt={alt}
        aspect={PLATE_ASPECT}
        fit='contain'
        gallery={picture.media ? mediaFullToViewerItem(picture.media) : undefined}
        className='w-full border-0 bg-bgColor'
        onRemove={
          onRemove
            ? {
                onClick: onRemove,
                ariaLabel: `unmark ${name}`,
                title: 'unmark — empty this side; the render stays on the card',
                disabled: saving,
                pending: saving,
              }
            : undefined
        }
        onEdit={
          onEdit
            ? {
                onClick: onEdit,
                ariaLabel: `edit the render of ${name} — draw over this picture`,
                title:
                  'draw over this render — saving makes a NEW picture; the original is never overwritten',
              }
            : undefined
        }
      />
      <div
        className={cn(
          'flex items-center gap-1 border-t border-hairline px-1.5 py-0.5',
          label ? 'justify-between' : 'justify-end',
        )}
      >
        {label ? (
          <Text
            size='nano'
            variant='uppercase'
            tracking='label'
            component='span'
            className='min-w-0 truncate'
          >
            {label}
            {required ? ' *' : ''}
          </Text>
        ) : null}
        <Pill className='shrink-0'>{saving ? 'saving…' : origin}</Pill>
      </div>
    </div>
  );
}

/**
 * ONE EMPTY CELL — a dashed box naming the side and the door that fills it. A `<button>` when the
 * cell is itself a door (3D: every empty side leads to FABRIC RENDER), a plain box otherwise.
 */
function EmptyBox({
  label = '',
  required,
  hint,
  onOpen,
  title,
}: {
  label?: string;
  required?: boolean;
  hint: string;
  onOpen?: () => void;
  title?: string;
}): JSX.Element {
  const body = (
    <>
      {label ? (
        <Text size='micro' variant='uppercase' tracking='label' component='span'>
          {label}
          {required ? <span className='font-bold'> *</span> : null}
        </Text>
      ) : null}
      <Text size='micro' variant='label' component='span' className='normal-case'>
        {hint}
      </Text>
    </>
  );
  /* ⚠ РОСТ — ТОТ ЖЕ, ЧТО У ПЛИТЫ, И ЗАДАН ИНЛАЙНОМ. Владелец: «плейсхолдеры больше самих блоков
     тамбнейлов — сделай одинакового размера». `min-h-[96px] flex-1` растягивал коробку по соседу и
     давал разный рост в таблице и в ленте. Число живёт в `CELL_PX` один раз. */
  const box =
    'flex w-full flex-col items-center justify-center gap-0.5 border border-dashed border-borderColor bg-bgColor px-2 text-center';
  const style = { height: EMPTY_PX };
  if (onOpen) {
    return (
      <button
        type='button'
        title={title}
        onClick={onOpen}
        style={style}
        className={cn(
          box,
          'cursor-pointer hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
        )}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={box} style={style} title={title}>
      {body}
    </div>
  );
}

/** Заголовок колонки таблицы — метрика ярлыка (DESIGN.md §3), не метрика подписи под кадром. */
function Head({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
      {children}
    </Text>
  );
}

/** Строка под ячейкой — состояние словом («empty», «saving…»), тем же кеглем, что подписи плит. */
function Caption({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
      {children}
    </Text>
  );
}

/**
 * ЧТО 3D ДЕЛАЕТ С ЭТОЙ СТОРОНОЙ — и это утверждение о ЧТЕНИИ, а не о будущем прогоне.
 *
 * ⚠ РАНЬШЕ ЗДЕСЬ СТОЯЛО «in the 3D run», И ЭТО БЫЛО ЛОЖЬЮ НА ЦЕЛОМ КЛАССЕ КАРТОЧЕК. Фраза
 * выводилась из ОДНОЙ занятости слота, а попадёт ли сторона в прогон, решают ворота
 * (`threedGate`): архивный колорвей и колорвей вне `renderBenchColorwayIds` отказывают ДО денег,
 * и на таком экране шесть плит уверенно сообщали, что они «в прогоне», которого не будет.
 *
 * ЧИТАТЬ ВОРОТА ЗДЕСЬ БЫЛО БЫ ВТОРЫМ ИХ НАПИСАНИЕМ: отказ уже назван словами у самой кнопки
 * GENERATE, ровно один раз и полной причиной. Поэтому колонка говорит то, что знает сама и что
 * верно всегда: провайдер читает четыре названные стороны, и вот эта — одна из них.
 *
 * Пилюля рисуется ТОЛЬКО под занятой плитой (вызывающий гейтит `side.picture`), поэтому ветки
 * «пусто» здесь нет: пустоту говорит сама коробка, и второе её написание было бы шестой пилюлей
 * из ничего.
 */
function ThreedWord({ side }: { side: BenchSide }): JSX.Element {
  if (!isCardinalView(side.view)) {
    return (
      <Pill
        title={`3D reads the four named sides — front, back, side L, side R; a ${viewLabel(side.view)} render stands on the bench but is not read`}
      >
        not read by 3D
      </Pill>
    );
  }
  return (
    <Pill
      tone='ink'
      data-threed-in=''
      title='3D reads the four named sides, and this one holds a render — whether a build may be asked for is answered at GENERATE'
    >
      read by 3D
    </Pill>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   SIDES — ONE ROW PER SIDE: WHAT WENT IN, WHAT CAME BACK. Its own block, above the card's renders.
   ═══════════════════════════════════════════════════════════════════════════════════════════════

   Владелец (r2 п.29): «раздел SIDES — отдельным блоком над RENDERS OF THIS CARD», и состав — по
   его же рулингу r1 §8.3: «только таблицу вместо двух лент». Две ленты (INPUT FLATS и SIDES) с
   верха блока FABRIC RENDER сняты: они показывали ОДНУ И ТУ ЖЕ сторону дважды, в двух местах, и
   связь «что во что превратилось» приходилось угадывать. Строка таблицы читает её без догадки.

   ⚠ ЧТО ЭТА ТАБЛИЦА ПИШЕТ, А ЧТО НЕТ:
     · FLATS IN — ПИШЕТСЯ, и только у ПУСТОЙ стороны: половина «из медиатеки» и половина «draw»
       одной плитки (`PlaceOrDrawCell`), обе через флэт-верстак — `kind: 'flat'`, `colorwayId: 0`,
       БЕЗ `slotId` (oneof с `viewKey`: записанный ноль = отказ всей записи), `expectedSlotRev` —
       CAS этой стороны. Занятая сторона читается: её писатели — шаг FLAT и рекол истории.
     · СТОЛБЕЦ КОЛОРВЕЯ — снятие (✕ на плите), правка и ОДНА дверь у пустой ячейки: «+ media»,
       файл из библиотеки прямо в этот слот одной транзакцией (r3 п.30, `RegisterDesignUpload` с
       колорвеем и в кадре, и в цели). Положить в сторону картинку, УЖЕ ЛЕЖАЩУЮ НА КАРТОЧКЕ, —
       по-прежнему жест `mark ▸` у самой картинки, в блоке RENDERS OF THIS CARD ниже: там лежит
       материал, там и дверь. Два разных глагола на два разных предмета, ни одного дубля.
       Ни `fill N empty sides`, ни `apply splitted` здесь нет — они были вторым написанием того же
       глагола на экране, где картинок не видно.

   Оси сравниваются РОВНО в `benchRowMatches` (через `benchSides` / `threedSides`); ни колорвей, ни
   род здесь не парсятся. */

/** Ширина колонки плиты — та же 138px, что у ячейки ленты: один шаг на весь шаг рендера. */
const COL_PX = 138;
/**
 * ═══ ОСТАТОК ШИРИНЫ ЗАБИРАЕТ «+ COLOURWAY», А НЕ ПОСЛЕДНИЙ ВЕРСТАК (п.28, круг r3c) ═══════════
 *
 * Столбцы верстаков стояли `minmax(COL_PX, 1fr)` — «пусть делят ширину». На карточке с ОДНИМ
 * верстаком (а это всякая карточка до первого колорвея) это давало ровно ту жалобу, ради которой
 * писалось: единственная дорожка `sample` разъезжалась на 800px, плита в ней держала свои 138
 * (потолок `maxWidth`, иначе кадр 1:1 растёт вдвое), и справа от неё вставала белая треть экрана
 * — БЕЗ ИМЕНИ, потому что принадлежала она столбцу `sample`, а показывать ей было нечего.
 *
 * Растягиваться должно то, у чего содержимое РАСТЯЖИМО, и такой столбец здесь ровно один:
 * приглашение «+ colourway». Плиту оно не носит, кончаться на своём минимуме ему незачем, и
 * пустое место под ним читается тем, чем оно и является, — местом для следующего цвета. Поэтому
 * верстаки стоят своей мерой (`COL_PX`, той же, что во всей студии), а `1fr` отдан приглашению.
 * При многих колорвеях правило то же и ветки не заводит: столбцы встают шеренгой слева, остаток
 * достаётся приглашению, а когда их станет больше, чем влезает, — минимум держит меру и таблица
 * скроллится внутри своей коробки (обёртка `overflow-x-auto` выше).
 */
const PLUS_COL_PX = 104;

/**
 * ═══ ОСЬ КОЛОРВЕЯ — ОДИН ПОРЯДОК СТОЛБЦОВ НА ТАБЛИЦУ И НА ЦЕЛИ `mark ▸` / `apply splitted` ═════
 *
 * Читается ЦЕЛИКОМ из whole-card `band.bench` (`benchColorwayId: 0`, довод в `use-design-band.ts`),
 * поэтому второго круга запроса на соседний цвет не нужно: строки всех колорвеев уже на руках, и
 * `expectedSlotRev` берётся из строки ЦЕЛИ, а не из строки семпла того же вида.
 *
 * ПОРЯДОК И СОСТАВ — РЕШЕНИЕ D1/D8, и он один на три органа:
 *   · `sample` (ось 0) первым — если у него есть плиты ИЛИ он текущая цель. Это не «ничего не
 *     выбрано»: безколорвейный верстак законен вечно, и на нём стоит всё, сделанное до оси;
 *   · живые колорвеи карточки — ВСЕ, в порядке карточки, с плитами и без (пустой столбец и есть
 *     приглашение его наполнить);
 *   · архивные — ТОЛЬКО с плитами: этим цветом больше не работают, и рисовать ему пустые ячейки
 *     значило бы предлагать начать.
 *
 * ЭКСПОРТИРУЕТСЯ РАДИ ВТОРОГО ЧИТАТЕЛЯ, А НЕ «НА ВСЯКИЙ СЛУЧАЙ»: `render/outputs.tsx` строит из
 * той же оси пункты `mark ▸` и цели `apply splitted`. Второе написание порядка разошлось бы с
 * первым в первый же день, когда карточка заведёт архивный колорвей.
 */
export type ColourwayColumn = {
  /** 0 = `sample`. Значение, а не отсутствие. */
  colorwayId: number;
  ref: common_AdminColorwayRef | null;
  /** Имя на экране: `sample` у оси 0, `devName → colorCode` у остальных. */
  label: string;
  archived: boolean;
  /** Хоть одна плита на рендер-верстаке этого колорвея. */
  plated: boolean;
  /** Шесть сторон ЭТОГО верстака, в порядке силуэта, со своими CAS-токенами. */
  sides: BenchSide[];
};

/** Слово оси 0 на экране. В коде она остаётся `COLORWAY_NONE`; таблицу семплов 0108 не путать. */
export const SAMPLE_LABEL = 'sample';

/**
 * ═══ ЗАПРОС «ФАЙЛ ИЗ БИБЛИОТЕКИ В ЯЧЕЙКУ СТОЛБЦА» — ЧИСТОЙ ФУНКЦИЕЙ (п.30) ═══════════════════
 *
 * Отдельно от жеста ровно потому, что три его поля — утверждения, которые обязаны СОВПАДАТЬ, и
 * проверять их удобнее цитатой, чем через модалку медиатеки:
 *   · `items[0].colorwayId` — ЧЬЯ ЭТО КАРТИНКА (её атрибуция на карточке);
 *   · `target.colorwayId` — В КАКОЙ ВЕРСТАК она встаёт; сервер сверяет эти два и отвечает
 *     `colorway_mismatch`, если они разошлись;
 *   · `expectedSlotRev` — CAS строки ЦЕЛИ (view, render, colourway), а не строки семпла того же
 *     вида: у каждой тройки своя ревизия.
 * `slotId` не ставится вовсе — он в одном `oneof` с `viewKey`, и ноль там заданное поле.
 */
export function renderUploadWrite(v: {
  mediaId: number;
  view: string;
  colorwayId: number;
  slotRev: number;
}) {
  const bench = refColorwayFor('render', v.colorwayId);
  return {
    items: [uploadItem({ mediaId: v.mediaId, ghostView: v.view, kind: 'render', colorwayId: bench })],
    target: { viewKey: v.view, kind: 'render', colorwayId: bench } as DesignBenchSlotRef,
    expectedSlotRev: v.slotRev,
  };
}

export function colourwayColumns(
  band: GetDesignBandResponse,
  colorways: common_AdminColorwayRef[],
  targetColorwayId: number,
): ColourwayColumn[] {
  const column = (colorwayId: number, ref: common_AdminColorwayRef | null): ColourwayColumn => {
    const sides = threedSides(band, colorwayId);
    return {
      colorwayId,
      ref,
      label: ref ? colorwayLabel(ref) : SAMPLE_LABEL,
      archived: archivedRef(ref),
      plated: sides.some((s) => !!s.picture),
      sides,
    };
  };
  const out: ColourwayColumn[] = [];
  const sample = column(0, null);
  if (sample.plated || targetColorwayId === 0) out.push(sample);
  for (const ref of colorways) {
    const id = ref.colorwayId ?? 0;
    if (id <= 0) continue;
    const col = column(id, ref);
    if (col.archived && !col.plated) continue;
    out.push(col);
  }
  return out;
}

export function SidesSection({
  band,
  techCardId,
  colorways,
  targetColorwayId,
  onPickColorway,
  onCreateColorway,
  disabled,
  onGoToKind,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  /** Колорвеи карточки в её собственном порядке (`useTechCard().colorways`). */
  colorways: common_AdminColorwayRef[];
  /**
   * ЦЕЛЬ ПРОГОНА — то же одно число студии (`useColorwayChoice`), что стоит в `for:` у GENERATE.
   * Таблица его не ВЛАДЕЕТ: клик по заголовку столбца — вторая дверь к тому же состоянию, как чипы
   * on-model. Столбцы при этом рисуются ВСЕ, а не один: сужение таблицы целью и было той «третью
   * экрана белого пятна», на которую жаловался владелец (п.28).
   */
  targetColorwayId: number;
  onPickColorway: (colorwayId: number) => void;
  /** Открыть поповер рождения колорвея (`ColourwayCreatePopover`) — заголовок столбца `+ colourway`. */
  onCreateColorway: () => void;
  disabled?: boolean;
  onGoToKind?: (kind: 'flat' | 'render' | 'threed') => void;
}): JSX.Element {
  const writes = useDesignWrites(techCardId);
  const { dictionary } = useDictionary();
  const flats = useMemo(() => benchSides(band, 'flat', 0), [band]);
  const columns = useMemo(
    () => colourwayColumns(band, colorways, targetColorwayId),
    [band, colorways, targetColorwayId],
  );

  const canWrite = !disabled;

  /**
   * За какую ЯЧЕЙКУ идёт запись — ключом «ось:колорвей:сторона». Общий `isPending` сказал бы
   * «saving» на всех сразу; ключ по одной стороне сказал бы это на всех столбцах строки, хотя
   * верстаки пишутся врозь: рендер кладут в ROSSO, пока с семпла снимают.
   */
  const [busy, setBusy] = useState<string | null>(null);
  const busyKey = (kind: 'flat' | 'render', colorwayId: number, view: string) =>
    `${kind}:${colorwayId}:${view}`;
  /**
   * ОДИН РЕДАКТОР НА БЛОК, НАЗВАННЫЙ ПО ЦЕЛИ. Два булевых флага открыли бы обе модалки разом;
   * `null` — закрыто. `draw` рисует С НУЛЯ в пустую флэт-сторону (`base: null` + `slot`), `edit`
   * правит стоящую плиту рендера (`slot: null` — результат ложится на карточку новой картинкой).
   *
   * ⚠ CAS-ТОКЕН ЗДЕСЬ НЕ ЛЕЖИТ, И ЭТО НЕСУЩЕЕ. Раньше `slotRev` снимался в момент КЛИКА и жил всё
   * время открытой модалки — а модалка живёт долго (человек рисует), и банд за это время
   * перечитывается на каждой чужой записи. Стоит кому-то положить картинку в ту же сторону, и
   * замороженный токен устаревает: сплющенный рисунок ложится на карточку, а в слот не встаёт —
   * то есть работа выглядит сделанной и не сделана. Соседний верстак этой ловушки не имеет,
   * потому что отдаёт `VectorModal` ЖИВОЙ проп (`bench-slot.tsx`: `slot={{ ref, label, slotRev }}`
   * прямо из пропов ячейки). Здесь так же: состояние держит только СТОРОНУ, а `slotRev` читается
   * из `flats` при рендере.
   */
  const [editor, setEditor] = useState<
    { mode: 'draw'; view: string } | { mode: 'edit'; pictureId: number } | null
  >(null);

  /**
   * ═══ КАРТОЧКА СМЕНИЛАСЬ — РЕДАКТОР ЗАКРЫВАЕТСЯ, «SAVING…» ГАСНЕТ (инвариант 12) ══════════════
   * `editor` держит не картинку, а АДРЕС: «рисую во флэт-сторону front». Адрес разрешается при
   * рендере по СЕГОДНЯШНИМ `flats`/`renders` (см. `drawing`/`editing` ниже) и уезжает в
   * `VectorModal` вместе с сегодняшним `techCardId` — то есть открытая модалка карточки A после
   * перехода на B молча становится модалкой B, и сплющенный рисунок ложится в слот ЧУЖОЙ карточки.
   * `busy` — то же самое словом: «saving…» стояло бы на стороне соседней карточки, где ничего не
   * пишется. Оно только рисует подпись и ничего не сторожит, а идущая мутация всё равно снимет его
   * своим `onSettled`, поэтому обнулить его здесь безопасно.
   *
   * ⚠ РЕМАУНТА ЗДЕСЬ НЕТ, И ПРОВЕРЯТЬ НАДО ИМЕННО ЭТО. Прежде `RenderStudio` стоял под
   * `key={colorwayId}` — ремаунт на смене КОЛОРВЕЯ, а не карточки; со снятием этого ключа (D2:
   * цель переехала внутрь экрана) не осталось и его. `StudioTab` на переходе не размонтируется, а
   * у уже посещённой карточки `isLoading` ложно и экран «loading…» не подменяет собой шаг
   * (образец разбора — `pattern-studio.tsx`).
   *
   * В ТЕЛЕ РЕНДЕРА, А НЕ В ЭФФЕКТЕ: эффект оставил бы один закоммиченный кадр с новой карточкой и
   * чужой открытой модалкой — а одного кадра хватает, чтобы в ней нажать «сохранить».
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (editor) setEditor(null);
    if (busy) setBusy(null);
  }

  /* ⚠ NO `slotId` — a `oneof` with `viewKey`; a zero is a SET field in proto-JSON and the server
     refuses the whole write. The kind is always spelled: empty reads as flat. Флэт-ось колорвея не
     имеет по существу — она читается и пишется под нулём всегда. */
  const flatRef = (view: string): DesignBenchSlotRef => ({ viewKey: view, kind: 'flat', colorwayId: 0 });
  /**
   * Ссылка на РЕНДЕР-СЛОТ СТОЛБЦА, а не столбца-цели: колорвей входит в ключ исключительности
   * слота, и `expectedSlotRev` обязан приехать из строки ТОГО ЖЕ столбца (ловушка 1 разбора).
   * `refColorwayFor` — единственное место, где решается, что у флэта колорвея нет по существу.
   */
  const renderRef = (view: string, colorwayId: number): DesignBenchSlotRef => ({
    viewKey: view,
    kind: 'render',
    colorwayId: refColorwayFor('render', colorwayId),
  });

  /** Снять плиту со стороны рендера. `picture_id = 0` — освободить, ничего не удаляя. */
  const unmark = (view: string, colorwayId: number, slotRev: number) => {
    setBusy(busyKey('render', colorwayId, view));
    writes.setBenchSlot.mutate(
      { slot: renderRef(view, colorwayId), pictureId: 0, expectedSlotRev: slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  /** Файл из библиотеки прямо в пустую флэт-сторону — одной транзакцией. */
  const placeFlat = (media: common_MediaFull, view: string, expectedSlotRev: number) => {
    const mediaId = media.id ?? 0;
    if (!mediaId) return;
    setBusy(busyKey('flat', 0, view));
    writes.registerUpload.mutate(
      {
        clientRequestId: newClientRequestId(),
        items: [uploadItem({ mediaId, ghostView: view, kind: 'flat', colorwayId: 0 })],
        target: flatRef(view),
        expectedSlotRev,
      },
      { onSettled: () => setBusy(null) },
    );
  };

  /**
   * ═══ РЕНДЕР ИЗ МЕДИАТЕКИ ПРЯМО В ПУСТУЮ ЯЧЕЙКУ СТОЛБЦА (п.30) ══════════════════════════════
   *
   * ОДНА ТРАНЗАКЦИЯ, И КОЛОРВЕЙ В НЕЙ НАЗЫВАЕТСЯ ДВАЖДЫ — В КАДРЕ И В ЦЕЛИ, потому что это два
   * разных утверждения об одном жесте: `item.colorwayId` говорит, ЧЬЯ ЭТО КАРТИНКА (её атрибуция
   * на карточке), `target.colorwayId` — В КАКОЙ ВЕРСТАК она встаёт. Сервер сверяет их между собой
   * (`colorway_mismatch`), поэтому разойтись они не могут молча; разойдясь, они дают отказ вместо
   * тихой записи не туда.
   *
   * `expectedSlotRev` — CAS строки ЦЕЛИ: строка соседнего столбца того же вида живёт своей
   * ревизией, и токен от неё сервер отвергнет («slot is at rev N, M was echoed»).
   */
  const placeRender = (media: common_MediaFull, view: string, colorwayId: number, expectedSlotRev: number) => {
    const mediaId = media.id ?? 0;
    if (!mediaId) return;
    setBusy(busyKey('render', colorwayId, view));
    writes.registerUpload.mutate(
      {
        clientRequestId: newClientRequestId(),
        ...renderUploadWrite({ mediaId, view, colorwayId, slotRev: expectedSlotRev }),
      },
      { onSettled: () => setBusy(null) },
    );
  };

  /** Правится плита ЛЮБОГО столбца — редактор один на блок, адрес у него по номеру картинки. */
  const editing =
    editor?.mode === 'edit'
      ? columns
          .flatMap((c) => c.sides)
          .find((s) => (s.picture?.id ?? 0) === editor.pictureId)?.picture ?? null
      : null;
  /** Сторона, в которую сейчас рисуют, — ЖИВАЯ строка верстака, вместе со своим `slotRev`. */
  const drawing = editor?.mode === 'draw' ? flats.find((s) => s.view === editor.view) ?? null : null;

  /* ─────────────────────────────── the two cells of a row ─────────────────────────────── */

  const flatCell = (side: BenchSide): JSX.Element => {
    const label = viewLabel(side.view);
    if (side.picture) {
      return (
        <Plate picture={side.picture} name={label} origin={originWord(band, side)} alt={`flat · ${label}`} />
      );
    }
    if (!canWrite) {
      /* СЛОВО СОСТОЯНИЯ — СТУДИИНО (`EMPTY_WORD`), а не своё: «nothing marked» рядом с «empty»
         соседних лент читалось как ДРУГОЕ состояние. Дверь называет `title`, не слово. */
      return <EmptyBox hint={EMPTY_WORD} title={`no drawing is marked for ${label}.`} />;
    }
    return (
      <>
        {/* ПУСТАЯ КОРОБКА ДЕЛИТСЯ ПОПОЛАМ: верх — библиотека (клик / ⌘V / бросок), низ — перо.
            Обе половины заводят ОДИН предмет — чертёж этой стороны, — поэтому это одна плитка с
            линией посередине, а не плитка с кнопкой под ней (r2 п.28).
            Имя стороны — ЧИСТОЕ: «+» ставит сам орган на лице верхней половины, потому что это же
            имя уезжает в речь обеих половин (`draw — front`, а не `draw — + front`). */}
        <PlaceOrDrawCell
          label={label}
          heightPx={EMPTY_PX}
          purpose={`design · flat for the ${label} slot`}
          onSelect={(media) => placeFlat(media, side.view, side.slotRev)}
          onDraw={() => setEditor({ mode: 'draw', view: side.view })}
          data-side-flat-door={side.view}
        />
        {busy === busyKey('flat', 0, side.view) ? <Caption>saving…</Caption> : null}
      </>
    );
  };

  /**
   * ЯЧЕЙКА СТОЛБЦА КОЛОРВЕЯ. Плита — с `✕` (снять) и правкой, как была; пустая — половина «из
   * медиатеки» той же плитки (п.30), и ТОЛЬКО она: рендер не рисуют с нуля пером, его либо
   * генерируют, либо приносят файлом.
   *
   * ⚠ В АРХИВНЫЙ СТОЛБЕЦ ДВЕРИ НЕТ. Сервер её примет (`assertColorwayOfCard` статуса не читает),
   * но правило «этим цветом больше не работают» держит клиент — тот же `archivedColorwayGate`,
   * что гасит GENERATE. Плиты при этом читаются и снимаются: архив не запрещает разбирать
   * сделанное.
   */
  const renderCell = (col: ColourwayColumn, side: BenchSide): JSX.Element | null => {
    const label = viewLabel(side.view);
    const saving = busy === busyKey('render', col.colorwayId, side.view);
    if (side.picture) {
      return (
        <Plate
          picture={side.picture}
          name={`${label} · ${col.label}`}
          origin={saving ? 'saving…' : originWord(band, side)}
          alt={`render · ${label} · ${col.label}`}
          saving={saving}
          onRemove={canWrite ? () => unmark(side.view, col.colorwayId, side.slotRev) : undefined}
          onEdit={
            canWrite && (side.picture.id ?? 0) > 0
              ? () => setEditor({ mode: 'edit', pictureId: side.picture?.id ?? 0 })
              : undefined
          }
        />
      );
    }
    /**
     * ⚠ ПУСТАЯ ЯЧЕЙКА АРХИВНОГО СТОЛБЦА НЕ РИСУЕТСЯ ВОВСЕ — ТИХАЯ ПУСТОТА (D8, r3c).
     *
     * Архивный столбец стоит здесь ради СВОИХ ПЛИТ («этим цветом когда-то работали»), и с одной
     * плитой на шесть сторон он печатал пять коробок «empty · mark one» — пять приглашений
     * сделать то, чего в этом столбце сделать нельзя: двери в архив нет по правилу
     * `archivedColorwayGate`, и слово «mark one» здесь просто неправда. Молчание точнее: у
     * архивного цвета есть ровно то, что есть.
     *
     * Ячейка-обёртка при этом остаётся (она несёт `data-side-cell` и держит дорожку сетки) —
     * пропадает только её содержимое, поэтому строка не съезжает и столбец не схлопывается.
     */
    if (col.archived) return null;
    if (!canWrite) {
      return <EmptyBox hint={EMPTY_RENDER_SIDE} title={`no render stands in ${label} of ${col.label}.`} />;
    }
    return (
      <>
        <PlaceOrDrawCell
          label={label}
          mediaLabel='+ media'
          heightPx={EMPTY_PX}
          purpose={`design · render for the ${label} slot of ${col.label}`}
          onSelect={(media) => placeRender(media, side.view, col.colorwayId, side.slotRev)}
          data-side-render-door={`${col.colorwayId}:${side.view}`}
        />
        {saving ? <Caption>saving…</Caption> : null}
      </>
    );
  };

  return (
    <Section
      /* ОБЪЯВЛЕННЫЙ ЯКОРЬ, И ОН СВОЙ. `#design-render-bench` остаётся у блока FABRIC RENDER: два
         узла с одним id — это ровно тот случай, когда проба зеленеет над чужой коробкой. Об этой
         делаются утверждения отсутствия («ни `fill N empty sides`, ни `apply splitted` здесь
         нет»), а такое утверждение стоит ровно столько, сколько стоит объявленная коробка. */
      id='design-render-sides'
      title='sides'
      question='· what went in, what came back'
      action={
        <span className='flex flex-wrap items-center gap-2'>
          {/* ⚠ НИ СЧЁТЧИКА, НИ ИМЕНИ КОЛОРВЕЯ. Счёта здесь нет намеренно: «2 of 6 sides» не
              говорило, о какой из осей речь, и владелец снял эту строку целиком (п.31). Имя
              колорвея тоже ушло: таблица больше не сужена одним цветом — каждый столбец назван
              своим заголовком, и второе имя в шапке противоречило бы им всем, кроме одного. */}
          {/* ОДНА ДВЕРЬ НА ШАПКУ, а не по кнопке в каждой ячейке: чертежи заводят здесь, но
              размечают и перебирают на своём шаге. */}
          {onGoToKind ? (
            <Button variant='secondary' size='xs' onClick={() => onGoToKind('flat')}>
              the flat bench ›
            </Button>
          ) : (
            <InertDoor
              label='the flat bench ›'
              reason='the flat bench is on the FLAT step of the rail above'
            />
          )}
        </span>
      }
    >
      {/* ⚠ ТАБЛИЦА СКРОЛЛИТСЯ ВНУТРИ СВОЕЙ КОРОБКИ, А НЕ УВОЗИТ СТРАНИЦУ ВБОК (DESIGN.md).
          Дорожки: имя стороны по содержимому, `FLATS IN` ровно `COL_PX` (у флэта оси колорвея
          нет — столбец один и его ширина не спорит ни с кем), столбцы колорвеев той же мерой
          `COL_PX` (плита в них всё равно держит потолок), а ОСТАТОК ШИРИНЫ забирает
          `+ colourway` — `minmax(PLUS_COL_PX, 1fr)`. Так таблица занимает ширину блока всегда, и
          при одном верстаке тоже (п.28: «треть экрана белое пятно»); разбор — у `PLUS_COL_PX`.
          ⚠ КОЛОНКИ 3D ЗДЕСЬ БОЛЬШЕ НЕТ (п.32). Она печатала ВЫВОД («read by 3D»), не жест, и
          выводился он из одной занятости слота — то есть повторял глазами то, что видно по самой
          плите. Слово о том, что 3D читает четыре названные стороны, стоит там, где 3D и
          заказывают: у ворот `threedGate` на своём шаге. */}
      <div className='overflow-x-auto'>
        <div
          data-side-rows={flats.length}
          data-side-columns={columns.length}
          className='grid items-start gap-x-6'
          style={{
            gridTemplateColumns: `minmax(72px, max-content) ${COL_PX}px ${columns
              .map(() => `${COL_PX}px`)
              .join(' ')} minmax(${PLUS_COL_PX}px, 1fr)`,
          }}
        >
          <Head>side</Head>
          <Head>flats in</Head>
          {columns.map((col) => {
            const target = col.colorwayId === targetColorwayId;
            const devHex = (col.ref?.devHex ?? '').trim();
            const dictHex = (
              findDictionaryColour(dictionary?.colors, col.ref?.colorCode)?.hex ?? ''
            ).trim();
            const hex = devHex || dictHex;
            /**
             * ⚠ У КВАДРАТА ДВА ИСТОЧНИКА И ОДИН ВИД — ЗНАЧИТ РАЗНИЦУ ГОВОРИТ `title`.
             *
             * `devHex` — цвет, названный САМИМ колорвеем: его выбирают пантон-пикером в окне
             * рождения, и рядом с ним ложится `pantone` (`colourway-create.tsx:206`). Словарный
             * hex — подстановка по коду SKU для колорвеев, заведённых ДО этой волны: у них
             * `devHex` пуст, и квадрат красится тем, что нашлось в словаре. Пантоном такой цвет
             * не является, номера красильни за ним нет, и общая подпись `col.label` над обоими
             * молчала ровно о той разнице, из-за которой красильня получит не тот цвет.
             *
             * Пантон печатается только когда он НАЗВАН: `devHex` без `pantone` законен (цвет
             * подобрали, номер не присвоили), и выдумывать ему систему по одному hex значило бы
             * делать то же, что делает `pantoneOfHex` под квадратом рецепта, — читать номер
             * обратно из краски.
             */
            const pantone = (col.ref?.pantone ?? '').trim();
            const code = (col.ref?.colorCode ?? '').trim();
            const swatchTitle = devHex
              ? pantone
                ? `pantone ${pantone}`
                : `development colour ${devHex} — no pantone named`
              : dictHex
                ? `dictionary colour${code ? ` ${code}` : ''} — not a pantone reference`
                : `${col.label} names no colour yet`;
            return (
              /* ═══ ЗАГОЛОВОК СТОЛБЦА И ЕСТЬ ВЫБОР ЦЕЛИ (D2) ═══════════════════════════════════
                 Вторая дверь к тому же состоянию, что `for:` у GENERATE, — как чипы колорвея на
                 ON MODEL. Отдельного селектора над таблицей нет: он был бы ТРЕТЬИМ органом одного
                 вопроса «для кого этот прогон». Активный столбец подчёркнут — не залит и не
                 покрашен: цветом здесь говорит свотч, и второй цветовой признак спорил бы с ним.

                 ⚠ ЭТОТ КЛИК ЖИВ И БЕЗ ПРАВА ЗАПИСИ, В ОТЛИЧИЕ ОТ СОСЕДНЕЙ ДВЕРИ `+ colourway`, и
                 разница между ними не в строгости, а в том, что они делают. Цель — состояние
                 КЛИЕНТА (`useColorwayChoice`, обычный `useState`): на провод она уезжает только
                 внутри прогона, а прогон на read-only карточке не запускается вовсе. Значит
                 переключение столбца здесь — это ЧТЕНИЕ: им выбирают, чей верстак и чей рецепт
                 смотреть. Погасить его значило бы запереть читателя на одном цвете и оставить ему
                 подчёркивание, которое ничего не выбирает. Поповер рождения колорвея — запись, и
                 поэтому он гаснет. */
              <button
                key={col.colorwayId}
                type='button'
                data-side-column={col.colorwayId}
                data-side-column-target={target ? '' : undefined}
                onClick={() => onPickColorway(col.colorwayId)}
                title={
                  target
                    ? `${col.label} is the target of the next render run`
                    : `make ${col.label} the target of the next render run`
                }
                className={cn(
                  'flex min-w-0 items-center gap-1.5 py-0.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                  target ? 'underline underline-offset-4' : 'hover:underline hover:underline-offset-4',
                )}
              >
                {/* ⚠ У `sample` СВОТЧА НЕТ ВОВСЕ, И ЭТО НЕ ЭКОНОМИЯ ПИКСЕЛЯ. Свотч рисуется
                    пустым (`PLACEHOLDER_SURFACE`), когда цвет не назван, — и пустой квадратик
                    11px слева от слова читается как НЕВЫБРАННЫЙ ЧЕКБОКС: заголовок столбца
                    выглядит выключенным, хотя ничего не выключает (замечено на снимке r3b).
                    У колорвея пустой квадрат честен: цвет у него есть, просто не назван. У оси 0
                    цвета нет ПО СУЩЕСТВУ — `sample` это «семплимся», а не «цвет неизвестен», — и
                    молчание тут точнее любого глифа. Ряд заголовков от этого НЕ разъезжается —
                    это замерено пробой, а не обещано: рост держит подпись, а свотч (11px) ниже
                    неё, и все заголовки стоят 19px по одной верхней линии. */}
                {col.ref ? <Swatch hex={hex} size={11} title={swatchTitle} /> : null}
                <Text
                  size='micro'
                  variant={target ? undefined : 'label'}
                  tracking='label'
                  component='span'
                  className='min-w-0 truncate uppercase'
                >
                  {col.label}
                  {col.archived ? ' (archived)' : ''}
                </Text>
              </button>
            );
          })}
          {/* ЧЕТВЁРТАЯ ДВЕРЬ ОДНОЙ КОМНАТЫ (G2-4): пунктирный заголовок открывает тот же поповер,
              что пункт `+ colourway…` в цели GENERATE и в цели mark. Ячеек под ним нет — только
              пунктирная кромка: ось на этом столбце не кончается, но плит он не носит.
              ⚠ НАДПИСЬ ПРИЖАТА ВЛЕВО, А НЕ ПО ЦЕНТРУ, И ЭТО НЕ ВКУС. Этот столбец забирает
              остаток ширины (`PLUS_COL_PX, 1fr`), то есть на карточке с одним верстаком он
              шириной в две трети блока; центрованное слово уезжало на середину пустого места и
              читалось баннером посреди страницы. Прижатое — оно стоит НАД своей пунктирной
              кромкой, в один ряд с `SIDE`, `FLATS IN` и именами столбцов, и называет зону, а не
              висит в ней.

              ⚠ БЕЗ ПРАВА ЗАПИСИ ДВЕРИ НЕТ ВОВСЕ, А НЕ «ЕСТЬ, НО ОТКАЖЕТ» (r3-w2 №4). Поповер
              рождения колорвея — запись (`CreateColorway`), и на read-only карточке он открылся
              бы, чтобы отказать словами «read-only»: приглашение, нарисованное без права. Тут
              остаётся ровно то, что и было правдой, — пунктирная кромка, та же самая, что идёт
              вдоль строк ниже: ось на столбцах не кончается, просто продолжить её этому человеку
              нечем. Пустой элемент рисуется, а не пропускается: строки ниже занимают все
              `columns.length + 3` дорожки, и дыра в шапке сдвинула бы их авто-размещением. */}
          {canWrite ? (
            <button
              type='button'
              data-side-add-colourway=''
              onClick={onCreateColorway}
              title='name a new colourway — it becomes a column here and the target of the next run'
              className='flex items-center justify-start border border-dashed border-borderColor px-2 py-0.5 text-micro uppercase tracking-label text-labelColor hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              + colourway
            </button>
          ) : (
            <div
              data-side-add-colourway-inert=''
              title='read-only — a new colourway is named by someone with write access'
              className='self-stretch border-l border-dashed border-borderColor'
            />
          )}

          {flats.map((flat, i) => {
            const label = viewLabel(flat.view);
            /* ОДНА ЛИНИЯ НА СТРОКУ, А НЕ ПО ЛИНИИ НА ЯЧЕЙКУ: строка — подсетка над всеми
               дорожками, поэтому волосяная линия идёт неразрывно через все зазоры. */
            return (
              <div
                key={flat.view}
                data-side-row={flat.view}
                className='grid grid-cols-subgrid items-start border-t border-hairline py-3'
                style={{ gridColumn: `span ${columns.length + 3} / span ${columns.length + 3}` }}
              >
                <div className='min-w-0'>
                  <Text
                    size='micro'
                    variant='label'
                    tracking='label'
                    component='span'
                    className='uppercase'
                  >
                    {label}
                    {RENDER_MIN_VIEWS.includes(flat.view) ? (
                      <span className='font-bold' title='the render needs it'>
                        {' *'}
                      </span>
                    ) : null}
                  </Text>
                </div>
                <div
                  data-side-flat={flat.view}
                  data-slot-empty={flat.picture ? undefined : ''}
                  className='flex flex-col gap-1'
                >
                  {flatCell(flat)}
                </div>
                {columns.map((col) => {
                  const side = col.sides[i];
                  return (
                    /* ⚠ ПОТОЛОК СТОИТ, ХОТЯ ДОРОЖКА БОЛЬШЕ НЕ ТЯНЕТСЯ, И ЭТО ЗАМЕР, А НЕ ВКУС.
                       Он писался, когда столбцы делили ширину (`1fr`): без потолка кадр 1:1
                       растягивался по дорожке (на 1440px — 230px), строка вырастала вдвое, а
                       пустая ячейка рядом оставалась 162px — ровно та жалоба «плейсхолдер и
                       плита разного размера», только вывернутая наизнанку. Сегодня дорожка ровно
                       `COL_PX`, и потолок совпал с нею; убрать его значило бы отдать ту же
                       ловушку обратно первому же, кто вернёт столбцам `1fr`. */
                    <div
                      key={col.colorwayId}
                      data-side-cell={`${col.colorwayId}:${flat.view}`}
                      data-slot-empty={side?.picture ? undefined : ''}
                      style={{ maxWidth: COL_PX }}
                      className='flex min-w-0 flex-col gap-1'
                    >
                      {side ? renderCell(col, side) : null}
                    </div>
                  );
                })}
                <div className='self-stretch border-l border-dashed border-borderColor' />
              </div>
            );
          })}
        </div>
      </div>

      {/* ОДИН РЕДАКТОР НА БЛОК, ПО ИМЕНИ ЦЕЛИ. `draw` пишет В СЛОТ (флэт-верстак, CAS этой
          стороны); `edit` кладёт результат на карточку обычной картинкой и в слот не пишет. */}
      {drawing && (
        <VectorModal
          open
          onOpenChange={(next: boolean) => !next && setEditor(null)}
          techCardId={techCardId}
          band={band}
          base={null}
          slot={{
            ref: flatRef(drawing.view),
            label: viewLabel(drawing.view),
            /* ЧИТАЕТСЯ ПРИ РЕНДЕРЕ, А НЕ СНИМАЕТСЯ ПРИ КЛИКЕ — разбор у объявления `editor`. */
            slotRev: drawing.slotRev,
          }}
          disabled={disabled}
        />
      )}
      {editing && (
        <VectorModal
          open
          onOpenChange={(next: boolean) => !next && setEditor(null)}
          techCardId={techCardId}
          band={band}
          base={editing}
          slot={null}
          disabled={disabled}
        />
      )}
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   INPUT · RENDERS BY VIEW — 3D reads the render bench; every empty cell is a door back.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

export function RendersByViewGroup({
  band,
  colorwayId = 0,
  onGoToKind,
}: {
  band: GetDesignBandResponse;
  colorwayId?: number;
  onGoToKind?: (kind: 'flat' | 'render') => void;
}): JSX.Element {
  const sides = useMemo(() => threedSides(band, colorwayId), [band, colorwayId]);
  const revisions = useMemo(() => threedRevisions(band, sides), [band, sides]);
  const toRender = onGoToKind ? () => onGoToKind('render') : undefined;
  return (
    <div id='design-threed-input' data-renders-by-view=''>
      <GroupLabel
        flush
        action={
          /* ⚠ СЧЁТЧИКА СТОРОН ЗДЕСЬ НЕТ — ОН СНЯТ, А НЕ ЗАБЫТ (п.31, r3-w2 №6). «N of 6 sides»
             пересказывал словами ровно то, что стоит строкой ниже: шесть плит, каждая либо с
             картинкой, либо пустая. Владелец снял такую строку на SIDES, и второй экземпляр того
             же счёта на входе 3D жил только потому, что это другой файл. Пилюля о РАЗНЫХ РЕВИЗИЯХ
             остаётся: её по плитам не прочитать — она про то, из каких прогонов эти шесть
             картинок, а не про то, сколько их. */
          <span className='flex flex-wrap items-center gap-1.5'>
            {revisions.length > 1 && (
              <Pill
                tone='attention'
                title={`the sides on this bench come from different runs (${revisions.map((r) => `r${r}`).join(', ')}); a model stitched out of them may not match in colour`}
              >
                {revisions.length === 2 ? 'two' : revisions.length} revisions
              </Pill>
            )}
            {toRender ? (
              <Button variant='secondary' size='xs' onClick={toRender}>
                fabric render ›
              </Button>
            ) : (
              <InertDoor label='fabric render ›' reason='FABRIC RENDER is the previous cell of the rail above' />
            )}
          </span>
        }
      >
        input · renders by view
      </GroupLabel>
      <Text size='micro' variant='label' component='p' className='mb-1.5 normal-case'>
        fabric render slots, one per side
      </Text>
      <Strip data-threed-strip=''>
        {sides.map((side) => {
          const label = viewLabel(side.view);
          const required = side.view === 'front';
          return (
            <div key={side.view} data-side-render={side.view} className={CELL}>
              {side.picture ? (
                <Plate
                  picture={side.picture}
                  name={label}
                  label={label}
                  required={required}
                  origin={originWord(band, side)}
                  alt={`render · ${label}`}
                />
              ) : (
                <EmptyBox
                  label={label}
                  required={required}
                  hint={EMPTY_RENDER_SIDE}
                  onOpen={toRender}
                  /* ⚠ ФАЙЛ ЭТА СТОРОНА БОЛЬШЕ НЕ ПРИНИМАЕТ (r2 п.29/30): у пустой рендер-стороны
                     нет ни половины «из медиатеки», ни `apply splitted` — единственный жест это
                     `mark ▸` на самой картинке в RENDERS OF THIS CARD. Подсказка «or from a file»
                     обещала дверь, которой на том экране нет вовсе, и посылала искать её. */
                  title={`fill ${label} on FABRIC RENDER — from RENDERS OF THIS CARD (mark ▸)`}
                />
              )}
              {/* The 3D word stands under a FILLED plate only: an empty side is in no run, and
                  saying so under every hole made six pills out of nothing. */}
              {side.picture && (
                <span>
                  <ThreedWord side={side} />
                </span>
              )}
            </div>
          );
        })}
      </Strip>
    </div>
  );
}

/** The silhouette order the strips walk — exported for callers that count what the strips draw. */
export const STRIP_VIEWS = SILHOUETTE_VIEWS;
