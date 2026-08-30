import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignBenchSlot,
  common_DesignEditLayer,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';

import { VectorModal } from './modals';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import MediaComponent from 'ui/components/media';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { batchCaption, pictureHandle } from './handles';
import { mixedInputNote, provenanceLabel, readProvenance, slotProvenance } from './provenance';
import { SplitCornerButton } from './split-to-input';
import { selectPickablePictures } from './visibility';

/**
 * ONE BENCH SLOT — and the vocabulary of «what a slot is», which the three other organs of the
 * bench read from here rather than spelling a second time.
 *
 * A SLOT THAT WAS NEVER TOUCHED DOES NOT EXIST ON THE SERVER. `GetDesignBand` returns only the
 * rows that have been written; the four silhouette sides are born lazily by the first
 * `SetDesignBenchSlot`. So `slot` below is honestly nullable and `slotRev` is honestly 0 for an
 * untouched side — the CAS token a lazy first placement is required to send. Rendering four rows
 * that pretend to exist would make the first write carry a rev the server never minted.
 *
 * ADDRESSING. A silhouette side is addressed BY ITS VIEW KEY forever — before birth and after —
 * because `DesignBenchSlotRef.view_key` names the four sides for their whole life. A detail is
 * addressed by its minted `slot_id` from the moment it exists, and `view_key = detail` means
 * exactly one thing: MINT A NEW ONE (name required, expected_slot_rev 0). Never by name: renaming
 * a detail must not move its plate, and two details a human called the same thing are still two
 * slots.
 */

/**
 * THE VOCABULARY MOVED OUT, and it moved because it had been written three times.
 *
 * This file, `mint-dialog.tsx` and `split-modal.tsx` each declared the sides for themselves — the
 * keys agreed, so nothing failed a type check, but the labels did not: the same side read `side L`
 * here and `SIDE L` on the mint. `./views` is now the only spelling, and these re-exports exist so
 * that the call sites inside this module keep reading the way they did.
 */
export {
  SHEET_MIN_VIEWS,
  SILHOUETTE_VIEWS,
  isSilhouetteView,
  viewLabel,
  type SilhouetteView,
} from './views';
import { SILHOUETTE_VIEWS, isSilhouetteView, viewLabel, type SilhouetteView } from './views';


/** Total over the vocabulary: an unknown key prints itself rather than becoming a wrong side. */
export type BenchRead = {
  /** All four sides, in a fixed order, present-or-not. */
  sides: { view: SilhouetteView; slot: common_DesignBenchSlot | null }[];
  /** Every detail slot, oldest first — the order they were minted in, which is stable. */
  details: common_DesignBenchSlot[];
};

/**
 * The band's `bench` array split into the two shapes the screen draws.
 *
 * A row whose `view_key` is not one of the four sides IS a detail — that is the only classification
 * the wire supports, and it deliberately does not test for the literal `detail`: `view_key=detail`
 * is the MINT verb, and a stored detail row is addressed by id from then on.
 */
export function readBench(band: GetDesignBandResponse): BenchRead {
  const rows = band.bench ?? [];
  const byView = new Map<string, common_DesignBenchSlot>();
  const details: common_DesignBenchSlot[] = [];
  for (const row of rows) {
    const key = (row.viewKey ?? '').trim().toLowerCase();
    if (isSilhouetteView(key)) byView.set(key, row);
    else details.push(row);
  }
  details.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  return {
    sides: SILHOUETTE_VIEWS.map((view) => ({ view, slot: byView.get(view) ?? null })),
    details,
  };
}

/**
 * A name collision between two details is LEGAL, and the display adds a `(2)` suffix rather than
 * the store mutating the name. Renaming one must not renumber the other, and the sheet cites a
 * detail by the name it was minted with.
 */
export function displayDetailName(
  details: readonly common_DesignBenchSlot[],
  slot: common_DesignBenchSlot,
): string {
  const name = (slot.detailName ?? '').trim() || 'detail';
  const same = details.filter((d) => ((d.detailName ?? '').trim() || 'detail') === name);
  if (same.length < 2) return name;
  return `${name} (${same.indexOf(slot) + 1})`;
}

/** A stable string identity for a slot ref — the key of the optimistic map and of pick targets. */
export function slotRefKey(ref: DesignBenchSlotRef): string {
  if (ref.slotId) return `id:${ref.slotId}`;
  return `view:${(ref.viewKey ?? '').trim().toLowerCase()}`;
}

/** The live row a ref addresses, or null when the slot has never been written. */
export function findSlot(
  band: GetDesignBandResponse,
  ref: DesignBenchSlotRef,
): common_DesignBenchSlot | null {
  const rows = band.bench ?? [];
  // A stored silhouette row carries BOTH an id and a view key; callers address it by the VIEW, so
  // matching on the id alone would miss every side and re-mint it with rev 0 on the next write.
  if (ref.slotId) return rows.find((row) => row.id === ref.slotId) ?? null;
  const view = (ref.viewKey ?? '').trim().toLowerCase();
  if (!view || view === 'detail') return null;
  return rows.find((row) => (row.viewKey ?? '').trim().toLowerCase() === view) ?? null;
}

/**
 * Every picture on the card that MAY be clicked into a slot.
 *
 * Two exclusions, both from the contract rather than from taste: a hidden picture must not be
 * reachable from any picker (`selectPickablePictures`, which has no reveal hatch on purpose), and
 * a COMPOSITE has no single view — it must be split first, so it is not a candidate at all.
 *
 * Deliberately NOT filtered by `kind`: the generative machine is cut in this wave, every picture
 * on a live card arrives through a batch, and a kind filter written against a dictionary this
 * bundle has not seen in production would silently empty the picker.
 */
export function pickableFlats(band: GetDesignBandResponse): common_DesignPicture[] {
  const all: common_DesignPicture[] = [];
  for (const run of band.runs ?? []) all.push(...(run.pictures ?? []));
  for (const batch of band.batches ?? []) all.push(...(batch.pictures ?? []));
  return selectPickablePictures(all).filter((p) => (p.compositeViews ?? []).length === 0);
}

/**
 * WHY THE PICKER IS EMPTY, in words. Г12: a live door onto a band with nothing in it sends the
 * human to click on pictures that are not there, and the only way out is an Esc they have to know
 * about. The door says WHICH of the three reasons it is instead.
 */
export function pickEmptyReason(band: GetDesignBandResponse): string | null {
  const all: common_DesignPicture[] = [];
  for (const run of band.runs ?? []) all.push(...(run.pictures ?? []));
  for (const batch of band.batches ?? []) all.push(...(batch.pictures ?? []));
  if (pickableFlats(band).length > 0) return null;
  if (all.length === 0) return 'nothing to pick yet — add files first';
  const composites = all.filter((p) => (p.compositeViews ?? []).length > 0).length;
  if (composites === all.length) {
    return `nothing to pick yet — all ${all.length} pictures are composites; split one first`;
  }
  return `nothing to pick yet — every picture on this card is hidden or a composite`;
}

/** The current revision of an edit layer drawn over this exact media, if there is one. */
export function liveLayerRev(
  layers: readonly common_DesignEditLayer[] | undefined,
  mediaId?: number | null,
): number | undefined {
  if (!mediaId) return undefined;
  const layer = (layers ?? []).find((l) => l.baseMediaId === mediaId);
  return typeof layer?.rev === 'number' ? layer.rev : undefined;
}

/** The address of the file to draw. Thumbnail first — a bench frame is 200px wide, not 2000. */
export function pictureUrl(picture?: common_DesignPicture | null): string {
  const media = picture?.media?.media;
  return media?.thumbnail?.mediaUrl || media?.fullSize?.mediaUrl || '';
}

/**
 * The footer line of a filled slot: WHERE THE PLATE IS FROM, in the band's own address vocabulary.
 * Provenance label first (`uploaded`, `AI · run 5`, `provenance unknown`), then the handle
 * (`upload 3 · b`), then the batch's own stamp — author, weight, count — when the plate came by
 * hand. БЕЗ ВРЕМЕНИ ЗАГРУЗКИ (S-15, владелец: «оно не несет особо смысла»): часы остаются на
 * самой полке пачек (`batchCaption` не трогается — у него другие читатели), здесь сегмент-время
 * вырезается из готовой подписи.
 */
export function slotFootnote(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
  shelfOrdinals: Map<number, number>,
): string {
  const provenance = readProvenance(picture);
  const parts = [provenanceLabel(provenance)];
  const ordinal = picture.batchId ? shelfOrdinals.get(picture.batchId) : undefined;
  // НОМЕР ПРОГОНА ПЕЧАТАЛСЯ ДВАЖДЫ. `provenanceLabel` уже сказал «AI · run 5», а `pictureHandle`
  // возвращает «run 5 · a» — вместе выходило `AI · run 5 · run 5 · a`, и это видно на верстаке.
  // Тот же приём, что строкой ниже для `batchCaption`: второй раз одно и то же не говорится.
  const handle = pictureHandle(picture, { shelfOrdinal: ordinal });
  parts.push(provenance.runId === null ? handle : handle.replace(/^run \d+(\s·\s)?/, ''));
  const batch = (band.batches ?? []).find((b) => b.id === picture.batchId);
  if (batch) {
    // `batchCaption` opens with the word «uploaded», which `provenanceLabel` has already said —
    // and carries the clock (`14:41`), which this footnote deliberately does not (S-15). The clock
    // segment is recognised by its own shape, `HH:MM`, — the same spelling `clockStamp` mints —
    // so a future segment that merely CONTAINS digits is not eaten by mistake.
    const caption = batchCaption(batch)
      .split(' · ')
      .filter((segment) => segment !== 'uploaded' && !/^\d{2}:\d{2}$/.test(segment))
      .join(' · ');
    if (caption) parts.push(caption);
  }
  return parts.filter(Boolean).join(' · ');
}

/**
 * A control that is drawn and deliberately dead, WITH ITS REASON ATTACHED.
 *
 * The wave's own rule: what was cut is `data-inert` with a reason, never absence. A missing door
 * teaches the human that the flow does not exist; a dead one with a reason teaches that it is not
 * here YET, which is the true statement.
 */
export function InertDoor({
  label,
  reason,
  className,
}: {
  label: React.ReactNode;
  reason: string;
  className?: string;
}) {
  return (
    <span data-inert={reason} title={reason} className={cn('inline-flex', className)}>
      <Button variant='secondary' size='xs' disabled>
        {label}
      </Button>
    </span>
  );
}

/**
 * ЦИКЛ ПОЧИНКИ СНЯТ РЕШЕНИЕМ ВЛАДЕЛЬЦА (S-15: «FIX функциональность выпиливаем полностью»).
 *
 * Что именно ушло: дверь `fix ▸`, галки-шортлист (S-14 — они были ЕЁ органом, R-20), полосы
 * «fix is running / fix is in», сравнение и «put it in». Что осталось ЖИВЫМ, и это не остаток:
 * поля провода `fix_targets` / `fix_slot_ids` теперь принадлежат ВЕКТОРНОМУ прогону
 * (`modals/use-trace-vector.ts` сужает им перерисовку до своей плиты), а `fix-markup.tsx` и
 * `generation/fix-context.tsx` стоят на диске ради импортов формы генерации. Снести их — сломать
 * работающий векторный путь; см. `history-fingerprint.ts` про то, как замороженные fix-прогоны
 * читаются историей и дальше.
 */

export type BenchSlotProps = {
  band: GetDesignBandResponse;
  /** Нужен векторному редактору: слой пишется на карточку, а не на слот. */
  techCardId: number;
  /** The wire address of this slot — a view key for a side, a minted id for a detail. */
  slotRef: DesignBenchSlotRef;
  /** The stored row, or null for a side that has never been touched. */
  slot: common_DesignBenchSlot | null;
  /** Human name — FRONT, or the detail's DISPLAYED name (which may carry a `(2)` suffix). */
  label: string;
  /** What stands there right now, optimistic value included. */
  picture: common_DesignPicture | null;
  /** The CAS token the next write must echo. 0 = the slot does not exist yet. */
  slotRev: number;
  detail?: boolean;
  /** In the sheet minimum — an empty one is red and the mint is unreachable. */
  required?: boolean;
  /** A write for this slot is in flight or its refetch has not landed. */
  saving?: boolean;
  /** Pick mode is armed FOR THIS SLOT. */
  picking?: boolean;
  /** Why the band offers nothing to pick, or null when it does (Г12). */
  pickEmpty?: string | null;
  /** Writers frozen — by prop, never by `<fieldset disabled>`, which mutes clicks and nothing else. */
  disabled?: boolean;
  shelfOrdinals: Map<number, number>;
  onPlaceMedia: (media: common_MediaFull) => void;
  onPick: () => void;
  onCancelPick: () => void;
  onUnmark: () => void;
  onOpenViewer?: () => void;
  /**
   * Разрезать плиту этого слота на кадры видов → строки входа (R-17, владелец: «тоже самое должно
   * работать в FLAT SLOTS»). Механизм живёт в `split-to-input.tsx` и подаётся сверху (`bench.tsx`
   * → `openForPicture`): плита — УЖЕ картинка полосы, поэтому шаг регистрации, который нужен
   * референсу, здесь пропущен. Absent = дверь не рисуется (read-only или пустой слот).
   * Стоит В ЛЕВОМ НИЖНЕМ УГЛУ плиты (S-4/S-15).
   */
  onSplit?: () => void;
  /** Details only. */
  onRename?: (name: string) => void;
  onDelete?: () => void;
  /** Details only: why this slot may not be removed, or null. */
  deleteBlocked?: string | null;
};

/**
 * Формула появления тихих органов плиты: наведение ИЛИ фокус внутри плитки, всегда — на
 * устройстве без наведения. Та же, что у ячейки референсов (`hoverOnly`). Слушается
 * `group-focus-within`, а не собственный `focus-within` органа: у клавиатуры ховера не бывает,
 * и орган, видимый только пока фокус стоит на нём самом, было бы нечем найти.
 */
const QUIET_ORGAN =
  'opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 ' +
  'focus-visible:opacity-100 [@media(hover:none)]:opacity-100 motion-reduce:transition-none';

/**
 * Кожа углового органа плиты — та же, что у `SplitCornerButton` (рамка, белая подложка,
 * нано-капс), с видимым `focus-visible`: те же классы, что у примитива `Button`. Семь состояний:
 * покой (тихий — QUIET_ORGAN хозяина), наведение (чернеет), фокус (outline 2px), нажатие
 * (родное), выключен (`disabled:` — серый и некликабелен), занят (слот пишет — «saving…» в шапке
 * и мёртвый крестик), ошибка (отказ записи говорит снекбар шва `useDesignWrites`).
 */
const CORNER_ORGAN =
  'pointer-events-auto border border-borderColor bg-bgColor px-1 text-nano uppercase tracking-label ' +
  'text-labelColor hover:text-textColor disabled:cursor-not-allowed disabled:text-textInactiveColor ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';

export function BenchSlot(props: BenchSlotProps) {
  const [vectorOpen, setVectorOpen] = useState(false);
  const {
    band,
    techCardId,
    slotRef,
    slot,
    label,
    picture,
    slotRev,
    detail,
    required,
    saving,
    picking,
    pickEmpty,
    disabled,
    shelfOrdinals,
    onPlaceMedia,
    onPick,
    onCancelPick,
    onUnmark,
    onOpenViewer,
    onSplit,
    onRename,
    onDelete,
    deleteBlocked,
  } = props;

  const provenance = picture ? slotProvenance({ picture }) : null;
  const url = pictureUrl(picture);

  /**
   * A DRAWING SITS OVER THIS PLATE — and the sentence it deserves depends on where the plate came
   * from. Both branches read the same fact (there is an edit layer whose base is this media, at a
   * revision the plate does not contain) and they are mutually exclusive by construction:
   *
   *   the plate IS a flattening (`layerRev > 0`) and the layer has moved past it → it has gone
   *     STALE: the picture is an older rasterisation of a drawing that has since changed.
   *   the plate was never flattened (`layerRev === 0`) → nothing is stale; the marks are data, not
   *     ink. A run, the fabric render, the printed sheet and a minted version read the PICTURE —
   *     for them the marks do not exist until `edit → save as picture` runs them through the
   *     canvas. (The fix cycle, which used to ship a marked copy at GENERATE, is removed — S-15 —
   *     so the sentence below claims the plain half alone.)
   *
   * Only `layer_advanced` can fire on a LIVE plate at all: `content_hash` lives on a version's
   * frozen plate, never on a live picture (which IS the current file, so a second copy could only
   * disagree with the first).
   */
  const layerRev = liveLayerRev(band.layers, picture?.media?.id);
  const layerOverPlate = provenance && typeof layerRev === 'number';

  const stale =
    layerOverPlate && provenance.layerRev > 0 && layerRev! > provenance.layerRev
      ? 'the edit layer has moved on — this picture is an older flattening'
      : null;

  const unflattened =
    layerOverPlate && provenance.layerRev === 0
      ? 'edit marks sit on a layer over this plate — a run reads the plate alone until «save as picture» presses them in'
      : null;

  const mixedNote = provenance ? mixedInputNote(provenance) : null;

  return (
    // `group` is load-bearing: the prototype reveals the slot's actions on hover (`.slotc:hover
    // .tfoot .act`), and the group is what a child's `group-hover:` reaches for. Opacity, never
    // display — the footer keeps its box either way, so nothing on this grid reflows under the
    // pointer.
    <div className='group flex min-w-0 flex-col gap-1'>
      {/* ГАЛКИ НАД ПЛИТАМИ СНЯТЫ НАСОВСЕМ (S-14, владелец: «мы уже выбрали в флет сайтс — значит
          всё ок уже»). Они были шортлистом починки (R-20) и умерли вместе с ней; лист читает сам
          факт «плита стоит в слоте», и никакой другой писатель за галкой не стоял. */}
      <div className='flex items-baseline gap-1'>
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          {label}
        </Text>
        {required && (
          <Text size='micro' component='span' className='text-error' title='the sheet needs it'>
            *
          </Text>
        )}
        {saving && (
          <Text size='nano' variant='label' component='span' className='ml-auto uppercase'>
            saving…
          </Text>
        )}
      </div>

      {url ? (
        <div
          className={cn(
            'relative border',
            picking ? 'border-textColor' : 'border-textInactiveColor',
          )}
          style={{ aspectRatio: '4/5' }}
        >
          {/* `contain`, not `cover`: a flat is a DRAWING and a crop of it loses the garment's
              outline, which is the one thing the sheet is printed for. */}
          <MediaComponent src={url} alt={label} aspectRatio='auto' fit='contain' />
          {/* ЧЕТЫРЕ УГЛА ПЛИТЫ (S-4/S-15, владелец дословно: «сплит слева снизу и эдит справа
              снизу на тамбнейле», «unmark заменить на крестик в правом верхнем углу»):
                левый верхний  — ярлык слота (не кнопка);
                правый верхний — ✕, бывший «unmark»: очистить слот, двери пустого слота откроются;
                левый нижний   — split (R-17);
                правый нижний  — edit, векторный редактор штрихов (бывший `edit ▸` подвала).
              Все углы выше просмотрщика (z-20 против его inset-0 z-10), иначе клик уходил бы в
              зум. Ярлык прозрачен для указателя и ограничен шириной ДО крестика — углы не смеют
              наезжать ни друг на друга, ни на нижнюю строку органов. Тихие органы живут по
              QUIET_ORGAN: наведение ИЛИ фокус внутри плитки, всегда — без наведения. */}
          <div className='pointer-events-none absolute left-1 top-1 z-20 max-w-[calc(100%-32px)]'>
            <span className='inline-block bg-textColor px-1.5 py-0.5'>
              <Text size='nano' variant='uppercase' component='span' className='!text-bgColor break-words'>
                {label}
              </Text>
            </span>
          </div>
          {!disabled && picture && (
            <button
              type='button'
              aria-label={`unmark ${label}`}
              title='unmark — empty this slot'
              disabled={saving}
              onClick={onUnmark}
              className={cn('absolute right-1 top-1 z-20 py-0.5 leading-none', CORNER_ORGAN, QUIET_ORGAN)}
            >
              ✕
            </button>
          )}
          {!disabled && onSplit && (
            <SplitCornerButton
              onClick={onSplit}
              ariaLabel={`split ${label} into views`}
              className={cn('absolute bottom-1 left-1 z-20 pointer-events-auto', QUIET_ORGAN)}
            />
          )}
          {/* `edit` — ВЕКТОРНЫЙ РЕДАКТОР ШТРИХОВ (`vectorModal` прототипа): рисование по самому
              чертежу, своим слоем, с растром-калькой снизу. Слой пишется настоящими
              `GetDesignEditLayer` / `SaveDesignEditLayer` / `FlattenDesignEditLayer`. Не путать с
              редактором УКАЗАНИЙ: тот живёт на ARTIFACTS, над плитами документа. */}
          {!disabled && picture && (
            <button
              type='button'
              aria-label={`edit ${label} — draw over the plate`}
              onClick={() => setVectorOpen(true)}
              className={cn('absolute bottom-1 right-1 z-20', CORNER_ORGAN, QUIET_ORGAN)}
            >
              edit
            </button>
          )}
          {onOpenViewer && (
            <button
              type='button'
              aria-label={`open ${label}`}
              onClick={onOpenViewer}
              className='absolute inset-0 z-10 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
            />
          )}
        </div>
      ) : (
        <MediaSlot
          aspectRatio={['Custom']}
          frameAspect='4/5'
          label={`+ add ${label}`}
          hint={null}
          purpose={`design bench · ${label}`}
          showVideos={false}
          editMode={!disabled}
          onSelect={(media) => {
            const first = media[0];
            if (first?.id) onPlaceMedia(first);
          }}
          className={picking ? 'border-textColor' : undefined}
        />
      )}

      {/* THE SECOND DOOR of an EMPTY slot, equal in weight to the first: mark something the band
          already holds. At zero candidates it becomes an inert note with the reason (Г12) instead
          of a live control that sends the human to click on pictures that are not there.

          У ЗАНЯТОГО СЛОТА ЭТОЙ СТРОКИ БОЛЬШЕ НЕТ (S-15, владелец: «убрать текст на ховер or mark
          another picture from the band»). Сам жест «картинка полосы → занятый слот» при этом ЖИВ,
          двумя объявленными дорогами: пикер «— slot —» на плитке полосы (`slot-picker.tsx`,
          обратное направление того же глагола, один жест) и ✕ в правом верхнем углу → двери
          опустевшего слота (два жеста). Взведённый выбор (`picking`) рисуется и у занятого слота:
          состояние обязано быть видно там, где его взвели, — например, с пикера плитки. */}
      {!disabled && picking && (
        <div>
          <button
            type='button'
            onClick={onCancelPick}
            className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
          >
            <Text size='nano' variant='label' component='span'>
              choosing — click a picture in the band · cancel
            </Text>
          </button>
        </div>
      )}
      {!disabled && !picking && !picture && (
        <div>
          {pickEmpty ? (
            <span data-inert={pickEmpty} title={pickEmpty}>
              <Text size='nano' variant='label' component='span'>
                {pickEmpty}
              </Text>
            </span>
          ) : (
            <button
              type='button'
              onClick={onPick}
              className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              <Text size='nano' variant='label' component='span'>
                or mark a picture from the band
              </Text>
            </button>
          )}
        </div>
      )}

      {detail && onRename && (
        <DetailNameField name={(slot?.detailName ?? '').trim()} disabled={disabled} onRename={onRename} />
      )}

      <div className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5'>
        {picture ? (
          <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
            {slotFootnote(band, picture, shelfOrdinals)}
          </Text>
        ) : (
          <Text
            size='nano'
            component='span'
            className={required ? 'text-error' : 'text-labelColor'}
          >
            <b>empty</b>
            {required ? ' · the sheet needs it' : ''}
          </Text>
        )}

        {/* ПОДВАЛ ДЕЙСТВИЙ ПОЧТИ ПУСТ, и это снос, а не забывчивость (S-15): `fix ▸` выпилен со
            всем циклом, `edit` и `unmark` (теперь ✕) переехали в углы самой плиты. Осталось одно
            действие, у которого угла нет, — удаление слота ДЕТАЛИ: это другой глагол, чем ✕
            (крестик очищает слот, эта кнопка сносит сам слот), и рядом с плитой их путать нельзя.
            Появление — той же формулой прозрачности, что и раньше: коробка остаётся на месте,
            сетка не дёргается под курсором; `focus-within` возвращает её клавиатуре,
            `hover:none` — тачу. */}
        {!disabled && detail && onDelete && (
          <span
            className={cn(
              'ml-auto flex flex-wrap items-center gap-1.5',
              'opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus-within:opacity-100',
              '[@media(hover:none)]:opacity-100 motion-reduce:transition-none',
            )}
          >
            {/* A DISABLED BUTTON DOES NOT SHOW ITS OWN `title`: pointer events are suppressed on
                it, so the reason has to hang on a wrapper that still receives the hover. */}
            {deleteBlocked ? (
              <span data-inert={deleteBlocked} title={deleteBlocked} className='inline-flex'>
                <Button variant='secondary' size='xs' disabled>
                  remove slot
                </Button>
              </span>
            ) : (
              <Button
                variant='secondary'
                size='xs'
                title='remove this detail slot — not just its picture'
                onClick={onDelete}
              >
                remove slot
              </Button>
            )}
          </span>
        )}
      </div>

      {/* Векторный редактор монтируется у плиты, дверь — угол `edit` справа снизу. */}
      {!disabled && picture && (
        <VectorModal
          open={vectorOpen}
          onOpenChange={setVectorOpen}
          techCardId={techCardId}
          band={band}
          base={picture}
          slot={{ ref: slotRef, label, slotRev }}
          disabled={disabled}
        />
      )}

      {mixedNote && (
        <Text size='nano' variant='label' component='span'>
          {mixedNote}
        </Text>
      )}
      {stale && (
        <Text size='nano' component='span' className='text-warning'>
          {stale}
        </Text>
      )}
      {unflattened && (
        <Text size='nano' variant='label' component='span'>
          {unflattened}
        </Text>
      )}

    </div>
  );
}

/**
 * The detail's name field. Renaming goes through `SetDesignBenchSlot` with the slot's CURRENT
 * picture echoed back — the RPC's `picture_id` is not optional and 0 means UNMARK, so a rename that
 * forgot to carry the plate would silently empty the slot it was renaming.
 */
function DetailNameField({
  name,
  disabled,
  onRename,
}: {
  name: string;
  disabled?: boolean;
  onRename: (name: string) => void;
}) {
  const [value, setValue] = useState(name);
  // The server's name wins whenever it changes underneath — somebody else may have renamed it.
  useEffect(() => setValue(name), [name]);
  const commit = () => {
    const next = value.trim();
    if (!next || next === name) {
      setValue(name);
      return;
    }
    onRename(next);
  };
  return (
    <Input
      value={value}
      disabled={disabled}
      aria-label='detail name'
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

/**
 * The cell that MINTS a detail — and the name comes before the picture, which is the whole rule of
 * this cell. A detail slot is addressed by id and cited by name on a printed sheet; a nameless one
 * would be born with nothing to call it and the server refuses it
 * (`FailedPrecondition:detail_name_required`). So the doors do not open until the field has a word
 * in it: they say so and put the caret where the answer goes.
 */
export function NewDetailCell({
  disabled,
  pickEmpty,
  onPlaceMedia,
  onPick,
}: {
  disabled?: boolean;
  pickEmpty?: string | null;
  onPlaceMedia: (media: common_MediaFull, name: string) => void;
  onPick: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [bad, setBad] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const named = name.trim();

  const demandName = () => {
    setBad(true);
    inputRef.current?.focus();
  };

  return (
    <div className='flex min-w-0 flex-col gap-1'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        new detail
      </Text>

      {named && !disabled ? (
        <MediaSlot
          aspectRatio={['Custom']}
          frameAspect='4/5'
          label={`+ fill ${named}`}
          hint={null}
          purpose={`design bench · ${named}`}
          showVideos={false}
          onSelect={(media) => {
            const first = media[0];
            if (first?.id) {
              onPlaceMedia(first, named);
              setName('');
              setBad(false);
            }
          }}
        />
      ) : (
        <button
          type='button'
          disabled={disabled}
          onClick={demandName}
          aria-label='name the detail first'
          style={{ ...PLACEHOLDER_SURFACE, aspectRatio: '4/5' }}
          className={cn(
            placeholderClass({ dashed: true }),
            'w-full cursor-pointer flex-col gap-1 px-2 text-center text-labelColor hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            bad && 'border-error text-error',
          )}
        >
          <span className='leading-tight'>+ detail</span>
        </button>
      )}

      <Input
        ref={inputRef}
        value={name}
        disabled={disabled}
        placeholder='name this detail'
        aria-invalid={bad || undefined}
        aria-label='new detail name'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setName(e.target.value);
          if (e.target.value.trim()) setBad(false);
        }}
      />

      <div>
        {pickEmpty ? (
          <span data-inert={pickEmpty} title={pickEmpty}>
            <Text size='nano' variant='label' component='span'>
              {pickEmpty}
            </Text>
          </span>
        ) : (
          !disabled && (
            <button
              type='button'
              onClick={() => {
                if (!named) {
                  demandName();
                  return;
                }
                onPick(named);
                // The name has been handed to the pick target; leaving it in the field would offer
                // to mint a SECOND detail of the same name on the next gesture.
                setName('');
                setBad(false);
              }}
              className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              <Text size='nano' variant='label' component='span'>
                or mark from the band
              </Text>
            </button>
          )
        )}
      </div>

      <Text size='nano' component='span' className={bad ? 'text-error' : 'text-labelColor'}>
        <b>new</b> · name it, then fill it
      </Text>
    </div>
  );
}
