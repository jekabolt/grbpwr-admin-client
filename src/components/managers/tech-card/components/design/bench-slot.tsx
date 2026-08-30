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
import CheckboxCommon from 'ui/components/checkbox';
import Input from 'ui/components/input';
import MediaComponent from 'ui/components/media';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { batchCaption, pictureHandle } from './handles';
import { mixedInputNote, provenanceLabel, readProvenance, slotProvenance } from './provenance';
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
 * (`upload 3 · b`), then the batch's own stamp — author and clock — when the plate came by hand.
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
    // `batchCaption` opens with the word «uploaded», which `provenanceLabel` has already said.
    const caption = batchCaption(batch).replace(/^uploaded(\s·\s)?/, '');
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
 * THE FIX FLOW IS BUILT AND IT DOES NOT LIVE HERE.
 *
 * This slot draws the DOOR (`fix ▸`) and hosts the two state strips, but owns neither: `fix-flow.tsx`
 * holds the reading of the band, the strips and the compare-and-set, and `bench.tsx` wires the two
 * together. The slot stays presentational on purpose — it is drawn four times for the sides and once
 * per detail, and a slot that reached into the fix context itself would be five subscribers to a
 * state only one of them can be armed for.
 *
 * The prototype's own defect (Г4) is honoured by the WIRING, not by this file: the strips address the
 * SLOT and not the plate, so `bars` is rendered by the empty slot too. Unmarking a plate while a fix
 * is in flight must not make the promised «fix is in · put it in» evaporate into the history.
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
   * Arm a fix for this slot. Absent on a slot a fix cannot legally address, in which case
   * `fixBlocked` carries the reason and the door is drawn dead rather than missing.
   */
  onFix?: () => void;
  /** Why `fix ▸` is dead here, or null when it is live. */
  fixBlocked?: string | null;
  /**
   * The fix shortlist's tick. Drawn only when `onToggleSelect` is given — and the bench gives it
   * only while the tick MODE is open (R-20, владелец: в обычном виде на плитах галок нет; они
   * появляются, когда человек нажал «fix several ▸» и выбирает, какие стороны переделать). The
   * slot itself stays mode-blind on purpose: it is presentational, and the one honest signal it
   * gets is whether a toggle handler exists.
   */
  selected?: boolean;
  onToggleSelect?: () => void;
  /** The fix state strips (`fix is running`, `fix is in`), built by `fix-flow.tsx`. */
  bars?: React.ReactNode;
  /** Details only. */
  onRename?: (name: string) => void;
  onDelete?: () => void;
  /** Details only: why this slot may not be removed, or null. */
  deleteBlocked?: string | null;
};

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
    onFix,
    fixBlocked,
    selected,
    onToggleSelect,
    bars,
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
   *     ink, and consumers split in two (W-10). A PLAIN run, the fabric render, the printed sheet
   *     and a minted version read the PICTURE — for them the marks do not exist until `edit ▸ →
   *     save as picture` runs them through the canvas. A FIX of this slot is the exception: at
   *     GENERATE the client rasterises «plate + layer» and sends the copy beside the plate
   *     (`fix-markup.tsx`), so the sentence below must claim exactly that much and no more.
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
      ? 'edit ▸ marks sit on a layer over this plate — a plain run reads the plate alone; a fix of this slot sends a marked copy too'
      : null;

  const mixedNote = provenance ? mixedInputNote(provenance) : null;

  return (
    // `group` is load-bearing: the prototype reveals the slot's actions on hover (`.slotc:hover
    // .tfoot .act`), and the group is what a child's `group-hover:` reaches for. Opacity, never
    // display — the footer keeps its box either way, so nothing on this grid reflows under the
    // pointer.
    <div className='group flex min-w-0 flex-col gap-1'>
      <div className='flex items-baseline gap-1'>
        {onToggleSelect && (
          <span className='self-center'>
            <CheckboxCommon
              name={`fix-tick-${label}`}
              aria-label={`tick ${label} for a fix`}
              checked={!!selected}
              disabled={disabled}
              onChange={onToggleSelect}
            />
          </span>
        )}
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
          <span className='pointer-events-none absolute left-1 top-1 z-10 bg-textColor px-1.5 py-0.5'>
            <Text size='nano' variant='uppercase' component='span' className='!text-bgColor'>
              {label}
            </Text>
          </span>
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

      {/* THE SECOND DOOR, and it is equal in weight to the first: mark something the band already
          holds. At zero candidates it becomes an inert note with the reason (Г12) instead of a live
          control that sends the human to click on pictures that are not there. */}
      {!disabled && !picture && (
        <div>
          {pickEmpty ? (
            <span data-inert={pickEmpty} title={pickEmpty}>
              <Text size='nano' variant='label' component='span'>
                {pickEmpty}
              </Text>
            </span>
          ) : picking ? (
            <button
              type='button'
              onClick={onCancelPick}
              className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              <Text size='nano' variant='label' component='span'>
                choosing — click a picture in the band · cancel
              </Text>
            </button>
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

        {/* `shrink-0` ЗДЕСЬ ПЕРЕПОЛНЯЛО КОЛОНКУ, и это было видно только замером: три контрола
            занимают 211px, а колонка слота при четырёх сторонах — 196px, поэтому подвал FRONT
            наезжал на подвал BACK. Ни `tsc`, ни утверждение по тексту этого не видят — `innerText`
            одинаков при любой ширине. Группа теперь переносится внутри себя и умеет сжиматься. */}
        {/* ДЕЙСТВИЯ ПОЯВЛЯЮТСЯ ПО НАВЕДЕНИЮ — как в макете (`.slotc .tfoot .act{opacity:0}` +
            `.slotc:hover .tfoot .act`). Прозрачность, а не `display`: коробка остаётся на месте,
            поэтому сетка слотов не дёргается под курсором и замер ширины подвала не зависит от
            того, где стоит мышь. `focus-within` возвращает их клавиатуре, `hover:none` — тачу:
            без этих двух строк меню слота на планшете просто нет. */}
        <span
          className={cn(
            'ml-auto flex flex-wrap items-center gap-1.5',
            'opacity-0 transition-opacity duration-100 group-hover:opacity-100 focus-within:opacity-100',
            '[@media(hover:none)]:opacity-100 motion-reduce:transition-none',
          )}
        >
          {/* `fix ▸` — ДВЕРЬ ПОЧИНКИ: она не правит картинку, она заказывает эту сторону заново, с
              верстака вместо референсов. Механика и полосы состояния — в `fix-flow.tsx`; сюда
              приходит либо обработчик, либо причина, по которой двери здесь быть не может. */}
          {!disabled &&
            picture &&
            (fixBlocked ? (
              <InertDoor label='fix ▸' reason={fixBlocked} />
            ) : (
              onFix && (
                <Button variant='secondary' size='xs' onClick={onFix}>
                  fix ▸
                </Button>
              )
            ))}
          {/* `edit ▸` — ВЕКТОРНЫЙ РЕДАКТОР ШТРИХОВ (`vectorModal` прототипа, `vector-open` на
              плитке слота): рисование по самому чертежу, своим слоем, с растром-калькой снизу.
              Дверь была инертной со словами «придёт следующей волной» — теперь волна пришла, и
              слой пишется настоящими `GetDesignEditLayer` / `SaveDesignEditLayer` /
              `FlattenDesignEditLayer`. Не путать с редактором УКАЗАНИЙ: тот живёт на ARTIFACTS,
              над плитами документа. */}
          {!disabled && picture && (
            <>
              <Button variant='secondary' size='xs' onClick={() => setVectorOpen(true)}>
                edit ▸
              </Button>
              <VectorModal
                open={vectorOpen}
                onOpenChange={setVectorOpen}
                techCardId={techCardId}
                band={band}
                base={picture}
                slot={{ ref: slotRef, label, slotRev }}
                disabled={disabled}
              />
            </>
          )}
          {/* `change` СНЯТА. У макета её нет, а её работу делают две живые двери: `unmark` очищает
              слот, и пустой слот открывает ту же библиотеку через `MediaSlot`. Две кнопки на один
              исход — это две записи в меню, которые расходятся при первой же правке одной из них. */}
          {!disabled && picture && (
            <Button variant='secondary' size='xs' onClick={onUnmark}>
              unmark
            </Button>
          )}
          {!disabled &&
            detail &&
            onDelete &&
            // A DISABLED BUTTON DOES NOT SHOW ITS OWN `title`: pointer events are suppressed on it,
            // so the reason has to hang on a wrapper that still receives the hover.
            (deleteBlocked ? (
              <span data-inert={deleteBlocked} title={deleteBlocked} className='inline-flex'>
                <Button variant='secondary' size='xs' disabled>
                  ✕
                </Button>
              </span>
            ) : (
              <Button
                variant='secondary'
                size='xs'
                title='remove this detail slot'
                onClick={onDelete}
              >
                ✕
              </Button>
            ))}
        </span>
      </div>

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

      {/* ПОЛОСЫ СОСТОЯНИЯ ПОЧИНКИ. Рисуются и у заполненного слота, и у пустого — снятие плиты во
          время починки не должно топить обещанный «fix is in · put it in» в истории (Г4/R10). */}
      {bars}
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
