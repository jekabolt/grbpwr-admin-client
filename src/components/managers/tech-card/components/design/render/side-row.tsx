import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useMemo, useState, type JSX, type ReactNode } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { InertDoor, pictureUrl } from '../bench-slot';
import { PlaceOrDrawCell, Counter, EMPTY_WORD } from '../core';
import { VectorModal } from '../modals';
import { PictureTile } from '../picture-tile';
import { readProvenance } from '../provenance';
import { uploadItem } from '../upload-item';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { SILHOUETTE_VIEWS, isCardinalView, viewLabel } from '../views';
import {
  RENDER_MIN_VIEWS,
  benchSides,
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
 *   SIDE · FLATS IN · RENDERS BACK
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

   ⚠ ЧТО ЭТА ТАБЛИЦА ПИШЕТ, А ЧТО НЕТ (r2 п.30, дословно: «mark ▸ / UNMARK / fill N empty sides /
   apply splitted живут ТОЛЬКО в RENDERS OF THIS CARD; таблица SIDES — только unmark + дверь на
   FLAT»):
     · FLATS IN — ПИШЕТСЯ, и только у ПУСТОЙ стороны: половина «из медиатеки» и половина «draw»
       одной плитки (`PlaceOrDrawCell`), обе через флэт-верстак — `kind: 'flat'`, `colorwayId: 0`,
       БЕЗ `slotId` (oneof с `viewKey`: записанный ноль = отказ всей записи), `expectedSlotRev` —
       CAS этой стороны. Занятая сторона читается: её писатели — шаг FLAT и рекол истории.
     · RENDERS BACK — только СНЯТИЕ (✕ на плите) и правка. Положить рендер в сторону — жест
       `mark ▸` у самой картинки, в блоке RENDERS OF THIS CARD ниже: там лежит материал, там и
       дверь. Ни `fill N empty sides`, ни `apply splitted` здесь больше нет — они были вторым
       написанием того же глагола на экране, где картинок не видно.

   Оси сравниваются РОВНО в `benchRowMatches` (через `benchSides` / `threedSides`); ни колорвей, ни
   род здесь не парсятся. */

/** Ширина колонки плиты — та же 138px, что у ячейки ленты: один шаг на весь шаг рендера. */
const COL_PX = 138;

/**
 * Приговор колонки 3D — одна короткая фраза, читаемая с плиты; ни пилюль, ни дверей.
 *
 * ⚠ ФРАЗА НАЗЫВАЕТ ЧТЕНИЕ, А НЕ ПРОГОН, и разбор этому — у `ThreedWord` выше: «goes into the 3D
 * run» выводилось из одной занятости слота и было ложным всюду, где ворота 3D закрыты (архивный
 * колорвей, колорвей вне `renderBenchColorwayIds`). Две ленты говорят это ОДНИМ словарём — иначе
 * таблица и полоса входа разошлись бы на первой же правке.
 */
function threedWords(side: BenchSide): JSX.Element {
  const has = !!side.picture;
  if (!isCardinalView(side.view)) {
    return (
      <Text size='micro' variant='label' component='span' className='min-w-0 break-words'>
        not read by 3D
      </Text>
    );
  }
  if (has) {
    return (
      <Text size='micro' component='span' className='min-w-0 break-words' data-threed-in=''>
        <b>read by 3D</b>
      </Text>
    );
  }
  return (
    <Text size='micro' variant='label' component='span' className='min-w-0 break-words'>
      {side.view === 'front' ? 'required — 3D cannot start without it' : 'optional'}
    </Text>
  );
}

export function SidesSection({
  band,
  techCardId,
  disabled,
  colorwayId = 0,
  colorwayLabel = '',
  onGoToKind,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** WHOSE render bench: one number for the whole studio (`useColorwayChoice`). */
  colorwayId?: number;
  colorwayLabel?: string;
  onGoToKind?: (kind: 'flat' | 'render' | 'threed') => void;
}): JSX.Element {
  const writes = useDesignWrites(techCardId);
  const flats = useMemo(() => benchSides(band, 'flat', 0), [band]);
  const renders = useMemo(() => threedSides(band, colorwayId), [band, colorwayId]);

  const canWrite = !disabled;
  const filledFlats = flats.filter((s) => !!s.picture).length;
  const filledRenders = renders.filter((s) => !!s.picture).length;

  /**
   * За какую ЯЧЕЙКУ идёт запись — ключом «ось:сторона», а не одной стороной. Общий `isPending`
   * сказал бы «saving» на всех шести; один ключ по стороне сказал бы это на ОБЕИХ ячейках строки,
   * хотя оси пишутся врозь (чертёж кладут в одну, рендер снимают с другой).
   */
  const [busy, setBusy] = useState<string | null>(null);
  const busyKey = (kind: 'flat' | 'render', view: string) => `${kind}:${view}`;
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

  /* ⚠ NO `slotId` — a `oneof` with `viewKey`; a zero is a SET field in proto-JSON and the server
     refuses the whole write. The kind is always spelled: empty reads as flat. Флэт-ось колорвея не
     имеет по существу — она читается и пишется под нулём всегда. */
  const flatRef = (view: string): DesignBenchSlotRef => ({ viewKey: view, kind: 'flat', colorwayId: 0 });
  const renderRef = (view: string): DesignBenchSlotRef => ({ viewKey: view, kind: 'render', colorwayId });

  /** Снять плиту со стороны рендера. `picture_id = 0` — освободить, ничего не удаляя. */
  const unmark = (view: string, slotRev: number) => {
    setBusy(busyKey('render', view));
    writes.setBenchSlot.mutate(
      { slot: renderRef(view), pictureId: 0, expectedSlotRev: slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  /** Файл из библиотеки прямо в пустую флэт-сторону — одной транзакцией. */
  const placeFlat = (media: common_MediaFull, view: string, expectedSlotRev: number) => {
    const mediaId = media.id ?? 0;
    if (!mediaId) return;
    setBusy(busyKey('flat', view));
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

  const editing =
    editor?.mode === 'edit'
      ? renders.find((s) => (s.picture?.id ?? 0) === editor.pictureId)?.picture ?? null
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
        {busy === busyKey('flat', side.view) ? <Caption>saving…</Caption> : null}
      </>
    );
  };

  const renderCell = (side: BenchSide): JSX.Element => {
    const label = viewLabel(side.view);
    const saving = busy === busyKey('render', side.view);
    if (!side.picture) {
      return (
        <EmptyBox
          hint={EMPTY_RENDER_SIDE}
          title={`no render stands in ${label}. Put one in from RENDERS OF THIS CARD, below — the door «mark ▸» stands on the picture itself.`}
        />
      );
    }
    return (
      <Plate
        picture={side.picture}
        name={label}
        origin={saving ? 'saving…' : originWord(band, side)}
        alt={`render · ${label}`}
        saving={saving}
        onRemove={canWrite ? () => unmark(side.view, side.slotRev) : undefined}
        onEdit={
          canWrite && (side.picture.id ?? 0) > 0
            ? () => setEditor({ mode: 'edit', pictureId: side.picture?.id ?? 0 })
            : undefined
        }
      />
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
          {/* Счётчика здесь нет намеренно: строка ПОД таблицей называет обе оси одним
              предложением, а «2 of 6 sides» в шапке не говорило, о какой из них речь. */}
          {colorwayLabel.trim() ? (
            <Text size='micro' variant='label' component='span' className='uppercase'>
              {colorwayLabel.trim()}
            </Text>
          ) : null}
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
          Дорожки заданы числами: обе колонки плит — ровно `COL_PX`, поэтому пустая и занятая
          ячейка стоят в ОДНОЙ коробке; последняя дорожка забирает остаток, чтобы волосяная линия
          строки шла во всю ширину блока. */}
      <div className='overflow-x-auto'>
        <div
          data-side-rows={renders.length}
          className='grid items-start gap-x-6'
          style={{
            gridTemplateColumns: `minmax(72px, max-content) ${COL_PX}px ${COL_PX}px minmax(0, 1fr)`,
          }}
        >
          <Head>side</Head>
          <Head>flats in</Head>
          <Head>renders back</Head>
          <Head>3d</Head>

          {renders.map((side, i) => {
            const flat = flats[i];
            const label = viewLabel(side.view);
            /* ODNA ЛИНИЯ НА СТРОКУ, А НЕ ПО ЛИНИИ НА ЯЧЕЙКУ: строка — подсетка над четырьмя
               дорожками, поэтому волосяная линия идёт неразрывно через все зазоры. */
            return (
              <div
                key={side.view}
                data-side-row={side.view}
                className='col-span-4 grid grid-cols-subgrid items-start border-t border-hairline py-3'
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
                    {RENDER_MIN_VIEWS.includes(side.view) ? (
                      <span className='font-bold' title='the render needs it'>
                        {' *'}
                      </span>
                    ) : null}
                  </Text>
                </div>
                <div
                  data-side-flat={side.view}
                  data-slot-empty={flat?.picture ? undefined : ''}
                  className='flex flex-col gap-1'
                >
                  {flat ? flatCell(flat) : null}
                </div>
                <div
                  data-side-render={side.view}
                  data-slot-empty={side.picture ? undefined : ''}
                  className='flex flex-col gap-1'
                >
                  {renderCell(side)}
                </div>
                {/* ═══ ТРЕТЬЯ КОЛОНКА — ВЫВОД, А НЕ ЖЕСТ ═══════════════════════════════════════
                    Сторона идёт в 3D-прогон ровно тогда, когда её рендер-слот заполнен и вид — из
                    четырёх, которые принимает провайдер (`isCardinalView`); фронт обязателен
                    (`no_front_render`, отказ до денег). Ни одной двери здесь нет и быть не должно:
                    разметка живёт у самих картинок, в блоке ниже. Словами, а не пилюлями —
                    владелец снял пилюли со строк как «иконки». */}
                <div className='min-w-0 max-w-[24rem]' data-side-threed={side.view}>
                  {threedWords(side)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ЧТО СЧИТАЕТ ЭТА ТАБЛИЦА — одной строкой под ней, а не пилюлями в каждой ячейке. */}
      <Text size='micro' variant='label' component='p' className='normal-case'>
        {filledFlats} of {flats.length} sides have a drawing · {filledRenders} of {renders.length}{' '}
        have a render
      </Text>

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
  const filled = sides.filter((s) => !!s.picture).length;
  const revisions = useMemo(() => threedRevisions(band, sides), [band, sides]);
  const toRender = onGoToKind ? () => onGoToKind('render') : undefined;
  return (
    <div id='design-threed-input' data-renders-by-view=''>
      <GroupLabel
        flush
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            <Counter n={filled} noun='side' total={sides.length} />
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
