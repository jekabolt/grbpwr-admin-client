import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { InertDoor, liveLayerRev, pictureUrl, slotFootnote } from '../bench-slot';
import { shelfBatchOrdinals } from '../handles';
import { VectorModal } from '../modals';
import { PictureTile } from '../picture-tile';
import { mixedInputNote, slotProvenance } from '../provenance';
import { uploadItem } from '../upload-item';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { CARDINAL_VIEWS, isCardinalView, viewLabel } from '../views';
import { LockBar } from './generate-row';
import {
  RENDER_MIN_VIEWS,
  benchSides,
  renderPlacements,
  slotOrigin,
  slotOriginLine,
  threedSides,
  type BenchSide,
  type Gate,
} from './model';
import { RenderInputStrip } from './render-input-strip';

/**
 * ═══ ОДНА СТРОКА НА СТОРОНУ — Ф5 (WAVE2 п.7) ═════════════════════════════════════════════════
 *
 * Владелец увидел «три ряда одинаковых ячеек по шесть сторон» и прочёл их как одно и то же,
 * показанное трижды. Три ряда были ТРЕМЯ ОРГАНАМИ одного и того же рендер-верстака: `FABRIC RENDER
 * SLOTS` (плиты 190px), лента `INPUT — RENDERS BY VIEW` на 3D (ячейки 132px) и дверь `mark ▸` в
 * `RENDERS OF THIS CARD`; плюс флэтовый верстак — лентой `INPUT — FLATS OF THIS CARD`. Два верстака
 * различаются ПО СУЩЕСТВУ (чертежи — вход рендера; рендеры — вход 3D), слить их в один значило бы
 * соврать. Поэтому — не один ряд, а ОДНА СТРОКА НА СТОРОНУ, четырьмя колонками:
 *
 *   SIDE · WHAT WENT IN (flat) · WHAT CAME BACK (render) · 3D
 *
 * Связь «что во что превратилось» читается по строке, без догадки; ни одна сторона не показана
 * дважды.
 *
 * ═══ ШЕСТЬ СТРОК, НЕ ЧЕТЫРЕ ═══════════════════════════════════════════════════════════════════
 *
 * Макет нарисован четырьмя строками — таблицей примера, а не словарём. Верстак — шесть слотов
 * (`SILHOUETTE_VIEWS`, D-28), и `applyPlan` «неназванную занятую сторону очищает»: четыре строки над
 * шестисторонним верстаком дали бы двери `apply splitted`, вычищающей слоты, которых человек не
 * видит. Строки читаются из `benchSides` — то есть из словаря. Что 3D берёт только четыре из них
 * (`CARDINAL_VIEWS`), говорится СОСТОЯНИЕМ в колонке 3D, а не сокращением списка.
 *
 * ═══ КТО ЗДЕСЬ ПИШЕТ, А КТО ЧИТАЕТ ═════════════════════════════════════════════════════════════
 *
 *   · WHAT WENT IN (flat) — ЧИТАЕТСЯ. Единственные писатели флэт-оси — `Bench` на шаге FLAT, лента
 *     флэтов под разделителем ниже (та же `RenderInputStrip`, только без своих шести слотов) и
 *     рекол истории. В ячейке нет ни ✕, ни приёмной двери; у пустой — дверь на FLAT.
 *   · WHAT CAME BACK (render) — ПИШЕТСЯ ЗДЕСЬ: положить из медиатеки, снять, заполнить пустые из
 *     кадров карточки. Каждая запись — `setBenchSlot`/`registerUpload` с `kind: 'render'` и
 *     колорвеем студии; `slotId` НЕ передаётся (oneof, дописанный ноль = отказ всей записи);
 *     `expectedSlotRev` — CAS одной стороны, отказ одной не останавливает остальные.
 *   · 3D — ВЫВОД, не жест. Сторона, у которой рендер-слот заполнен, идёт в 3D-прогон; фронт
 *     обязателен (`no_front_render`, отказ до денег); трёхчетвертные 3D не читает вовсе. Разметки в
 *     этой колонке нет и быть не должно — макет её снял.
 *
 * Оси сравниваются РОВНО в `benchRowMatches` (через `benchSides` / `threedSides`) — колорвей и род
 * здесь не парсятся.
 *
 * ═══ ДВА МОНТАЖА ОДНОГО БЛОКА ═════════════════════════════════════════════════════════════════
 *
 * На FABRIC RENDER блок стоит первым (вход рендера — флэты — читается до меню; тот же закон, что
 * ставил здесь ленту флэтов) и ПИШЕТ рендер-ось; под разделителем — правая половина прежней ленты
 * флэтов: неразмеченные чертежи с `mark ▸`, колоды листов, фильтр происхождения, дверь `+ flat`,
 * дочитывание ленты до конца (`useWholeCardFeed`, D-5). На 3D тот же блок ЧИТАЕТ (`readOnly`):
 * ни одной записи, лента под разделителем не рисуется, а под строками стоит `LockBar` с дверями
 * прежней ленты 3D — причины отказа и куда идти.
 *
 * ⚠ `RenderStudio` монтируется с `key={colorway.colorwayId}` — ремоунт при смене цвета; у 3D
 * ремоунта нет намеренно (черновик подачи переживает смену цвета). Этот блок состояния, зависящего
 * от монтажа, не держит — только `busy`/`outcome`/`editingId`, которые смену цвета переживать не
 * обязаны.
 */

/** Ширина плиты в строке — та же, что у ячейки ленты (132px): один шаг на все полосы блока. */
const PLATE = 'w-[132px] shrink-0';
const PLATE_ASPECT = '4/5';

const INERT_DOOR = 'flex w-full [&>button]:w-full';

const READ_ONLY_REASON =
  'this card is read-only for you — putting a render into a side is an edit of the card';

/** Знаки над плитой — те же три, что у `BenchSlot`, прочитанные с того же слоя правок. */
function plateNotes(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
): { stale: string | null; unflattened: string | null; mixed: string | null } {
  const provenance = slotProvenance({ picture });
  if (!provenance) return { stale: null, unflattened: null, mixed: null };
  const layerRev = liveLayerRev(band.layers, picture.media?.id);
  const over = typeof layerRev === 'number';
  return {
    stale:
      over && provenance.layerRev > 0 && (layerRev as number) > provenance.layerRev
        ? 'the edit layer has moved on — this picture is an older flattening'
        : null,
    unflattened:
      over && provenance.layerRev === 0
        ? 'edit marks sit on a layer over this plate — a run reads the plate alone until «save as picture» presses them in'
        : null,
    mixed: mixedInputNote(provenance),
  };
}

function Notes({ band, picture }: { band: GetDesignBandResponse; picture: common_DesignPicture }) {
  const { stale, unflattened, mixed } = plateNotes(band, picture);
  return (
    <>
      {mixed && (
        <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {mixed}
        </Text>
      )}
      {stale && (
        <Text size='nano' component='span' className='min-w-0 break-words text-warning'>
          {stale}
        </Text>
      )}
      {unflattened && (
        <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {unflattened}
        </Text>
      )}
    </>
  );
}

/** Пустая коробка стороны — полосатая, со словом; дверь под ней даёт вызывающий. */
function EmptyPlate({
  label,
  required,
  requiredNote,
  title,
}: {
  label: string;
  required?: boolean;
  requiredNote: string;
  title: string;
}): JSX.Element {
  return (
    <>
      <div
        className={cn(placeholderClass({ dashed: true }), 'w-full flex-col gap-0.5 px-1 text-center')}
        style={{ ...PLACEHOLDER_SURFACE, aspectRatio: PLATE_ASPECT }}
        title={title}
      >
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          {label}
        </Text>
      </div>
      <Text
        size='nano'
        component='span'
        className={cn('min-w-0 break-words', required ? 'text-error' : 'text-labelColor')}
      >
        <b>empty</b>
        {required ? ` · ${requiredNote}` : ''}
      </Text>
    </>
  );
}

const HEAD = 'uppercase';

export function SideRows({
  band,
  techCardId,
  disabled,
  colorwayId = 0,
  colorwayLabel = '',
  onGoToKind,
  readOnly = false,
  lock,
  id = 'design-render-bench',
  title = 'flats in · renders back',
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * ЧЕЙ РЕНДЕР-ВЕРСТАК. Одно число на всю студию (`useColorwayChoice`): под ним этот блок пишет,
   * 3D читает (`threedSides`) и сервер собирает (`designSelectBench`). Флэт-ось колорвея не имеет
   * (L-4) и читается под нулём всегда.
   */
  colorwayId?: number;
  colorwayLabel?: string;
  onGoToKind?: (kind: 'flat' | 'render') => void;
  /**
   * МОНТАЖ-ЧИТАТЕЛЬ (шаг 3D): ни одной записи рендер-оси, ленты флэтов под разделителем нет.
   * Пустая сторона рисует дверь на FABRIC RENDER, где её заполняют.
   */
  readOnly?: boolean;
  /** Отказ ворот 3D — рисуется полосой под строками, вместе со своими дверями (шаг 3D). */
  lock?: Gate;
  id?: string;
  title?: string;
}): JSX.Element {
  const writes = useDesignWrites(techCardId);
  const flats = useMemo(() => benchSides(band, 'flat', 0), [band]);
  const renders = useMemo(() => threedSides(band, colorwayId), [band, colorwayId]);
  const shelfOrdinals = useMemo(() => shelfBatchOrdinals(band.batches ?? []), [band.batches]);
  /** Кадры карточки, которым есть куда встать: только ПУСТЫЕ стороны (довод у `renderPlacements`). */
  const placements = useMemo(() => renderPlacements(band, colorwayId), [band, colorwayId]);

  const canWrite = !readOnly && !disabled;
  const named = colorwayLabel.trim();

  const filled = renders.filter((side) => !!side.picture).length;
  const intoThreed = renders.filter((side) => !!side.picture && isCardinalView(side.view)).length;

  /** Для какой стороны идёт запись. Общий `isPending` сказал бы «saving» на всех шести. */
  const [busy, setBusy] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  /** Исход последнего `fill` — состоянием рядом с плитами, пока не нажмут снова. */
  const [outcome, setOutcome] = useState<{
    done: string[];
    failed: { view: string; reason: string }[];
  } | null>(null);
  /** Какую плиту рендер-оси правим в векторном редакторе. Ноль — закрыто. */
  const [editingId, setEditingId] = useState(0);

  /* ⚠ `slotId` ОТСУТСТВУЕТ НАМЕРЕННО — oneof с `viewKey`; ноль в proto-JSON это ЗАДАННОЕ поле,
     и сервер отверг бы запись целиком. Род спеллится всегда: пустое читается как flat. */
  const sideRef = (view: string): DesignBenchSlotRef => ({
    viewKey: view,
    kind: 'render',
    colorwayId,
  });

  const unmark = (view: string, slotRev: number) => {
    setBusy(view);
    writes.setBenchSlot.mutate(
      // `picture_id = 0` — освободить сторону, ничего не удаляя: плита остаётся на карточке.
      { slot: sideRef(view), pictureId: 0, expectedSlotRev: slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  /** Файл из медиатеки прямо в пустую сторону — одной транзакцией (`RegisterDesignUpload` + target). */
  const placeMedia = (media: common_MediaFull, view: string, expectedSlotRev: number) => {
    const mediaId = media.id ?? 0;
    if (!mediaId) return;
    setBusy(view);
    writes.registerUpload.mutate(
      {
        clientRequestId: newClientRequestId(),
        items: [uploadItem({ mediaId, ghostView: view, kind: 'render', colorwayId })],
        target: sideRef(view),
        expectedSlotRev,
      },
      { onSettled: () => setBusy(null) },
    );
  };

  /**
   * Заполнить пустые стороны кадрами карточки — по одному слоту, своим CAS каждая; отказ одной не
   * останавливает остальные, отката нет (довод целиком — у прежнего органа, `renderPlacements`).
   */
  const fillEmpty = async () => {
    if (!placements.length || filling) return;
    setFilling(true);
    setOutcome(null);
    const done: string[] = [];
    const failed: { view: string; reason: string }[] = [];
    for (const placement of placements) {
      try {
        await writes.setBenchSlot.mutateAsync({
          slot: sideRef(placement.view),
          pictureId: placement.picture.id ?? 0,
          expectedSlotRev: placement.slotRev,
        });
        done.push(placement.view);
      } catch (error) {
        failed.push({
          view: placement.view,
          reason: (error as Error)?.message?.trim() || 'the server refused without saying why',
        });
      }
    }
    setFilling(false);
    setOutcome(failed.length ? { done, failed } : null);
  };

  const frameOf = (picture: common_DesignPicture | null) =>
    picture?.media ? mediaFullToViewerItem(picture.media) : undefined;

  /* ─────────────────────────── the three cells of a row ─────────────────────────── */

  const flatCell = (side: BenchSide): JSX.Element => {
    const label = viewLabel(side.view);
    const required = RENDER_MIN_VIEWS.includes(side.view);
    if (!side.picture) {
      return (
        <div data-side-flat={side.view} data-slot-empty='' className={cn('flex flex-col gap-1', PLATE)}>
          <EmptyPlate
            label={label}
            required={required}
            requiredNote='the render needs it'
            title={`no drawing is marked for ${label}. Mark one below the line, or on FLAT.`}
          />
          {onGoToKind ? (
            <div data-cell-doors='' className='mt-auto pt-0.5'>
              <Button
                variant='secondary'
                size='xs'
                className='w-full'
                onClick={() => onGoToKind('flat')}
                title={`draw or mark ${label} on FLAT`}
              >
                FLAT ▸
              </Button>
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <div data-side-flat={side.view} className={cn('flex flex-col gap-1', PLATE)}>
        {/* ЧИТАЕТСЯ: ни ✕, ни `edit` — писатели флэт-оси стоят на FLAT и под разделителем ниже. */}
        <PictureTile
          url={pictureUrl(side.picture)}
          alt={`flat · ${label}`}
          badge={label}
          aspect={PLATE_ASPECT}
          fit='contain'
          gallery={frameOf(side.picture)}
          className='w-full bg-bgColor'
        />
        <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {slotFootnote(band, side.picture, shelfOrdinals)}
        </Text>
        <Notes band={band} picture={side.picture} />
      </div>
    );
  };

  const renderCell = (side: BenchSide): JSX.Element => {
    const label = viewLabel(side.view);
    const required = side.view === 'front';
    const saving = busy === side.view;
    if (!side.picture) {
      return (
        <div
          data-side-render={side.view}
          data-slot-empty=''
          data-slot-door={canWrite ? 'media' : undefined}
          className={cn('flex flex-col gap-1', PLATE)}
        >
          {canWrite ? (
            /* Коробка, которая и есть слот, принимает файл сама — как пустая плита верстака. */
            <MediaSlot
              aspectRatio={['Custom']}
              frameAspect={PLATE_ASPECT}
              label={`+ add ${label}`}
              hint={null}
              purpose={`design · render for the ${label} slot`}
              showVideos={false}
              editMode
              onSelect={(media) => {
                const first = media[0];
                if (first?.id) placeMedia(first, side.view, side.slotRev);
              }}
            />
          ) : (
            <EmptyPlate
              label={label}
              required={required}
              requiredNote='3D cannot start without it'
              title={`no render stands in ${label}. Put one in on FABRIC RENDER.`}
            />
          )}
          {canWrite && (
            <Text size='nano' component='span' className={required ? 'text-error' : 'text-labelColor'}>
              <b>empty</b>
              {required ? ' · 3D cannot start without it' : ''}
            </Text>
          )}
          {canWrite && (
            <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
              ⌘V · drop · browse
            </Text>
          )}
          {saving && (
            <Text size='nano' variant='label' component='span' className='uppercase'>
              saving…
            </Text>
          )}
          {readOnly && (
            <div data-cell-doors='' className='mt-auto pt-0.5'>
              {onGoToKind ? (
                <Button
                  variant='secondary'
                  size='xs'
                  className='w-full'
                  onClick={() => onGoToKind('render')}
                  title={`fill ${label} on FABRIC RENDER — from the renders of this card or from a file`}
                >
                  FABRIC RENDER ▸
                </Button>
              ) : (
                <InertDoor
                  className={INERT_DOOR}
                  label='FABRIC RENDER ▸'
                  reason='switch to FABRIC RENDER on the rail above: a side is filled there, from the renders of this card or from a file'
                />
              )}
            </div>
          )}
        </div>
      );
    }
    const origin = slotOrigin(band, side);
    const line = slotOriginLine(origin);
    const pictureId = side.picture.id ?? 0;
    return (
      <div data-side-render={side.view} className={cn('flex flex-col gap-1', PLATE)}>
        <PictureTile
          url={pictureUrl(side.picture)}
          alt={`render · ${label}`}
          badge={label}
          aspect={PLATE_ASPECT}
          fit='contain'
          gallery={frameOf(side.picture)}
          className='w-full bg-bgColor'
          onRemove={
            canWrite
              ? {
                  onClick: () => unmark(side.view, side.slotRev),
                  ariaLabel: `unmark ${label}`,
                  title: 'unmark — empty this side; the render stays on the card',
                  disabled: saving,
                  pending: saving,
                }
              : undefined
          }
          /* Правка — новая КАРТИНКА на карточке (`slot={null}` у редактора), не запись в слот. */
          onEdit={
            canWrite && pictureId > 0
              ? {
                  onClick: () => setEditingId(pictureId),
                  ariaLabel: `edit render ${pictureId} — draw over this picture`,
                  title:
                    'draw over this render — saving makes a NEW picture; the original is never overwritten',
                }
              : undefined
          }
        />
        <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {slotFootnote(band, side.picture, shelfOrdinals)}
        </Text>
        {/* Ревизия и род прогона — со штампа самого слота (`run_rrev`/`run_kind`), не с ленты. */}
        {line && (
          <Text
            size='nano'
            component='span'
            data-slot-origin={`${side.view}:${origin.runKind || 'none'}:${origin.rrev}`}
            className={cn('min-w-0 break-words', origin.foreign ? 'text-warning' : 'text-labelColor')}
          >
            {line}
          </Text>
        )}
        <Notes band={band} picture={side.picture} />
        {saving && (
          <Text size='nano' variant='label' component='span' className='uppercase'>
            saving…
          </Text>
        )}
      </div>
    );
  };

  /**
   * КОЛОНКА 3D — ВЫВОД. Сторона идёт в прогон ровно тогда, когда её рендер-слот заполнен и вид
   * из четырёх, которые провайдер принимает (`CARDINAL_VIEWS`). Ни одной двери здесь нет.
   */
  const threedCell = (side: BenchSide): JSX.Element => {
    const cardinal = isCardinalView(side.view);
    const has = !!side.picture;
    let word: JSX.Element;
    if (!cardinal) {
      word = (
        <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {has ? 'on the bench · not read by 3D' : '· not read by 3D'} — the provider takes{' '}
          {CARDINAL_VIEWS.length} named sides
        </Text>
      );
    } else if (has) {
      word = (
        <Text size='nano' component='span' className='min-w-0 break-words'>
          <b>✓ goes into the 3D run</b>
          {side.view === 'front' ? ' · required' : ''}
        </Text>
      );
    } else if (side.view === 'front') {
      word = (
        <Text size='nano' component='span' className='min-w-0 break-words text-error'>
          <b>required</b> · blocks 3D
        </Text>
      );
    } else {
      word = (
        <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
          · optional
        </Text>
      );
    }
    return (
      <div data-side-threed={side.view} data-threed-in={cardinal && has ? '' : undefined}>
        {word}
      </div>
    );
  };

  const fillTitle = `${placements
    .map((p) => viewLabel(p.view))
    .join(', ')} take the newest render of this card that names them. A side that already holds a render is not touched.`;

  const editing =
    editingId > 0 ? renders.find((side) => (side.picture?.id ?? 0) === editingId)?.picture : null;

  return (
    <Section
      /* ЯКОРЬ ОБЪЯВЛЕН: об этом блоке делаются утверждения отсутствия (в колонке 3D нет разметки),
         и такое утверждение стоит ровно столько, сколько стоит объявленная коробка. */
      id={id}
      title={title}
      question={
        named
          ? `— one row per side: the drawing that went in, the render of ${named} that came back, and whether 3D reads it`
          : '— one row per side: the drawing that went in, the render that came back, and whether 3D reads it'
      }
      action={
        <span className='flex items-center gap-3'>
          <Text size='micro' variant='label' component='span' className='uppercase' data-side-count=''>
            render {filled} of {renders.length} · {intoThreed} of {CARDINAL_VIEWS.length} into 3D
          </Text>
          {!readOnly &&
            placements.length > 0 &&
            (disabled ? (
              <InertDoor
                label={`fill ${placements.length} empty side${placements.length === 1 ? '' : 's'} ▸`}
                reason={READ_ONLY_REASON}
              />
            ) : (
              <Button
                variant='secondary'
                size='xs'
                loading={filling}
                onClick={fillEmpty}
                title={fillTitle}
              >
                fill {placements.length} empty side{placements.length === 1 ? '' : 's'} ▸
              </Button>
            ))}
        </span>
      }
    >
      <div className='overflow-x-auto'>
        <div
          data-side-rows={renders.length}
          className='grid items-start gap-x-4 gap-y-0'
          style={{ gridTemplateColumns: 'minmax(64px, max-content) 132px 132px minmax(160px, 1fr)' }}
        >
          {/* ЗАГОЛОВОК — ярлыки колонок, метрикой ярлыка (DESIGN.md §3). */}
          <Text size='nano' variant='label' component='span' className={HEAD}>
            side
          </Text>
          <Text size='nano' variant='label' component='span' className={HEAD}>
            what went in (flat)
          </Text>
          <Text size='nano' variant='label' component='span' className={HEAD}>
            what came back (render)
          </Text>
          <Text size='nano' variant='label' component='span' className={HEAD}>
            3D
          </Text>

          {renders.map((side, i) => {
            const flat = flats[i];
            const row = 'border-t border-hairline py-2';
            return (
              <div key={side.view} data-side-row={side.view} className='contents'>
                <div className={cn(row, 'min-w-0')}>
                  <Text
                    size='micro'
                    variant='label'
                    tracking='label'
                    component='span'
                    className='uppercase'
                  >
                    {viewLabel(side.view)}
                  </Text>
                </div>
                <div className={row}>{flatCell(flat)}</div>
                <div className={row}>{renderCell(side)}</div>
                <div className={cn(row, 'min-w-0')}>{threedCell(side)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {outcome && (
        <CalloutBox tone='error'>
          <Text size='micro' component='p' className='normal-case'>
            <b>
              {outcome.done.length} of {outcome.done.length + outcome.failed.length} sides took a
              render.
            </b>{' '}
            {outcome.done.length > 0 && <>Now filled: {outcome.done.map(viewLabel).join(', ')}. </>}
            {outcome.failed.length === 1 ? 'This one did not: ' : 'These did not: '}
            {outcome.failed.map((f) => `${viewLabel(f.view)} — ${f.reason}`).join('; ')}. Nothing was
            undone: the sides are separate slots. Press the door again — it now offers only what is
            left.
          </Text>
        </CalloutBox>
      )}

      {/* ═══ НИЖЕ РАЗДЕЛИТЕЛЯ — ТО, ЧТО СТОЯЛО СПРАВА ОТ ЛИНИИ ЛЕНТЫ ФЛЭТОВ (WAVE2 п.9) ══════════
          Неразмеченные чертежи с `mark ▸`, колоды листов (`split ▸ / expand ▸ / apply splitted /
          fold ▾`), фильтр происхождения, дверь `+ flat`, дочитывание ленты до конца (D-5). Тот же
          орган, что и был (`RenderInputStrip`), без своих шести слотов — они теперь строки выше. */}
      {!readOnly && (
        <div className='border-t border-hairline pt-2' data-side-rows-pool=''>
          <RenderInputStrip band={band} techCardId={techCardId} disabled={disabled} bare />
        </div>
      )}

      {/* ОДИН РЕДАКТОР НА БЛОК, ПО ИМЕНИ ЦЕЛИ. `slot={null}` — результат правки ложится на карточку
          обычным рендером и не пишет в слот. */}
      {editing && (
        <VectorModal
          open
          onOpenChange={(next: boolean) => !next && setEditingId(0)}
          techCardId={techCardId}
          band={band}
          base={editing}
          slot={null}
          disabled={disabled}
        />
      )}

      {/* ═══ ПОЛОСА ПРИЧИН 3D — ПЕРЕЕХАЛА С ЛЕНТЫ 3D ВМЕСТЕ С ДВЕРЯМИ ═══════════════════════════
          Пустой верстак (`next: 'render'`) полосу не рисует: шесть пустых сторон с «required ·
          blocks 3D» и дверью на FABRIC RENDER и есть ответ (F-12). Остальные отказы говорят то,
          чего по строкам не прочесть (номера ревизий, почему фронт), и остаются со своими дверями. */}
      {lock && !lock.ok && lock.next !== 'render' && (
        <LockBar reason={lock.reason}>
          {onGoToKind ? (
            <>
              {lock.next === 'front-slot' && (
                <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
                  put a render into FRONT ▸
                </Button>
              )}
              {lock.next === 'refill' && (
                <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
                  re-fill the odd sides on FABRIC RENDER ▸
                </Button>
              )}
              {lock.next === 'flat' && (
                <Button variant='secondary' size='xs' onClick={() => onGoToKind('flat')}>
                  generate a flat ▸
                </Button>
              )}
              {(lock.next === 'flat' || !lock.next) && (
                <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
                  generate a render ▸
                </Button>
              )}
            </>
          ) : (
            <InertDoor
              className={INERT_DOOR}
              label='generate a render ▸'
              reason='the way out is the rail above — FLAT draws the missing side, FABRIC RENDER colours it and puts it into a slot, and 3D turns what stands there'
            />
          )}
        </LockBar>
      )}
    </Section>
  );
}
