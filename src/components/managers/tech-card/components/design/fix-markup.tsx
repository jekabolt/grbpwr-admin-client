import { adminService } from 'api/api';
import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { displayDetailName, readBench } from './bench-slot';
import { findLayerForMedia, uploadRaster } from './modals/use-edit-layer';
import { rasteriseStrokesOverBase } from './modals/rasterise-layer';
import { DEFAULT_RATIO, decodeStrokesWire, readLayer } from './modals/vector-strokes';
import { viewLabel } from './views';

/**
 * THE MARKED-PLATES HALF OF A FIX — «pass them in ALREADY MARKED UP» (W-10), made true.
 *
 * THE PROBLEM IT CLOSES. A callout drawn with `edit ▸` is STROKE DATA in a `design_edit_layer`, not
 * pixels in the plate, and a run's ordinary inputs are assembled server-side from the slots'
 * PICTURES. So until this module, a fix launched over a marked-up bench sent the model clean plates
 * — the human drew corrections, paid for the run, and the model never saw a single line.
 *
 * WHAT TRAVELS AND HOW. At GENERATE, for every slot in the fix selection whose plate has a live
 * edit layer, the client rasterises «plate + layer» with the SAME canvas the vector editor flattens
 * with (`modals/rasterise-layer.ts` — one rasteriser, deliberately), uploads the PNG verbatim
 * through the SAME door a flatten uses (`uploadRaster` → UploadContentImage, preserve_original),
 * and sends the media ids in `params.extra_input_media_ids` — a field the contract already carries
 * for exactly this: extra media fed to a run besides the bench slots. THE PLATE IS NEVER TOUCHED
 * and nothing is filed into the band: the marked copy is run input, not a picture of the card.
 *
 * TAKEN FRESH AT LAUNCH, BY DECISION. The strokes are re-read and re-rasterised when GENERATE is
 * pressed, not when a preview was opened: the common case is the same person nudging their own
 * marks right up to the click, and a run that carried a snapshot from before the nudge would
 * honestly answer a question nobody is still asking. The preview modal below says so and names the
 * revision it shows, so a preview that has gone stale is visible as such rather than silently
 * different from what departs.
 *
 * THE RETRY MUST NOT BUY A SECOND RUN. `useStartRun` fingerprints the params to replay one
 * `client_request_id` per intent — so a retry after a failed start has to send the SAME media ids,
 * or the fingerprint moves and the idempotency ledger mints a fresh id for what the human considers
 * the same press. `useMarkedPlateUploads` therefore caches uploads by (layer, rev, base): an
 * unchanged layer re-uses its uploaded raster, and only a layer that actually moved produces a new
 * upload — which IS a new intent, because the content of the ask changed.
 */

/** The half of `FixTarget` this module reads — the wire's own two-address selection. */
export type FixSelectionShape = {
  viewKeys: readonly string[];
  slotIds: readonly number[];
};

export type MarkedPlate = {
  /** Stable identity within one band read — a side's view key or a detail's minted id. */
  key: string;
  /** front | back | side_l | side_r, or '' for a detail. */
  viewKey: string;
  /** `design_bench_slot(id)` for a detail, or 0 for a side. */
  slotId: number;
  label: string;
  picture: common_DesignPicture;
  layerId: number;
  /** The layer's rev AS THE BAND LISTS IT. A raster may be taken at a newer one — compare. */
  layerRev: number;
};

/**
 * Every slot of the selection whose plate carries a live edit layer, in bench order — sides first
 * in their fixed order, then details oldest first. The order is deterministic on purpose: it is
 * frozen into the run's params and into the idempotency fingerprint, and a reshuffle between two
 * presses of the same intent would mint a second paid run.
 */
export function markedPlatesOf(
  band: GetDesignBandResponse,
  sel: FixSelectionShape,
): MarkedPlate[] {
  // The FLAT bench: the fix selection names flat slots — the cycle only ever ran on the flats.
  const bench = readBench(band, 'flat');
  const out: MarkedPlate[] = [];
  for (const { view, slot } of bench.sides) {
    if (!sel.viewKeys.includes(view)) continue;
    const picture = slot?.picture;
    const layer = findLayerForMedia(band.layers, picture?.media?.id ?? 0);
    if (!picture || !layer?.id) continue;
    out.push({
      key: `view:${view}`,
      viewKey: view,
      slotId: 0,
      label: viewLabel(view),
      picture,
      layerId: layer.id,
      layerRev: layer.rev ?? 0,
    });
  }
  for (const slot of bench.details) {
    if (!slot.id || !sel.slotIds.includes(slot.id)) continue;
    const picture = slot.picture;
    const layer = findLayerForMedia(band.layers, picture?.media?.id ?? 0);
    if (!picture || !layer?.id) continue;
    out.push({
      key: `id:${slot.id}`,
      viewKey: '',
      slotId: slot.id,
      label: displayDetailName(bench.details, slot),
      picture,
      layerId: layer.id,
      layerRev: layer.rev ?? 0,
    });
  }
  return out;
}

export type TakenRaster = {
  /** The layer revision the strokes were actually read at — the server's answer, not the band's. */
  rev: number;
  strokeCount: number;
  /** '' when the layer holds no strokes: nothing extra travels for this plate. */
  dataUrl: string;
};

/** Full size first — this raster is what the model reads, not a 200px bench frame. */
function plateSrc(picture: common_DesignPicture): string {
  const media = picture.media?.media;
  return (
    media?.fullSize?.mediaUrl || media?.compressed?.mediaUrl || media?.thumbnail?.mediaUrl || ''
  );
}

/**
 * Read the layer's CURRENT strokes and press them into the plate. Throws with the slot's name when
 * the layer was written by a bundle this one cannot read — sending the clean plate under a screen
 * that promised marks would be the exact lie this module exists to remove, so the launch refuses
 * instead.
 */
export async function takeMarkedRaster(
  techCardId: number,
  plate: MarkedPlate,
): Promise<TakenRaster> {
  const res = await adminService.GetDesignEditLayer({ techCardId, layerId: plate.layerId });
  const layer = res.layer;
  const media = plate.picture.media?.media;
  const w = media?.fullSize?.width ?? 0;
  const h = media?.fullSize?.height ?? 0;
  const doc = readLayer(decodeStrokesWire(layer?.strokes), w > 0 && h > 0 ? w / h : DEFAULT_RATIO);
  if (doc.unreadable) {
    throw new Error(
      `the marks over ${plate.label} were written by a newer admin than this one and cannot be drawn here — reload the admin, or flatten them from edit ▸ on that slot`,
    );
  }
  const rev = layer?.rev ?? plate.layerRev;
  if (!doc.strokes.length) return { rev, strokeCount: 0, dataUrl: '' };
  const dataUrl = await rasteriseStrokesOverBase({
    baseSrc: plateSrc(plate.picture),
    strokes: doc.strokes,
    ratio: doc.ratio,
  });
  return { rev, strokeCount: doc.strokes.length, dataUrl };
}

/**
 * The launch-time preparer: rasterise and upload every marked plate of the selection, and hand
 * back the media ids for `params.extra_input_media_ids`, in bench order.
 *
 * A layer that holds no strokes adds NOTHING — its plate already goes in through the bench, and an
 * extra copy with zero marks would only pad the input. Uploads are cached per (layer, rev, base):
 * see the module comment for why the retry must replay the same ids.
 */
export function useMarkedPlateUploads(techCardId: number) {
  const uploaded = useRef(new Map<string, number>());
  return useCallback(
    async (band: GetDesignBandResponse, sel: FixSelectionShape): Promise<number[]> => {
      const ids: number[] = [];
      for (const plate of markedPlatesOf(band, sel)) {
        const taken = await takeMarkedRaster(techCardId, plate);
        if (!taken.strokeCount) continue;
        const key = `${plate.layerId}:${taken.rev}:${plate.picture.media?.id ?? 0}`;
        let mediaId = uploaded.current.get(key) ?? 0;
        if (!mediaId) {
          mediaId = (await uploadRaster(taken.dataUrl)).id ?? 0;
          if (mediaId) uploaded.current.set(key, mediaId);
        }
        if (mediaId) ids.push(mediaId);
      }
      return ids;
    },
    [techCardId],
  );
}

/* ─────────────────────────── the pre-flight preview ─────────────────────────── */

type PreviewEntry =
  | { plate: MarkedPlate; state: 'reading' }
  | { plate: MarkedPlate; state: 'ready'; rev: number; strokeCount: number; dataUrl: string }
  | { plate: MarkedPlate; state: 'empty'; rev: number }
  | { plate: MarkedPlate; state: 'failed'; error: string };

/**
 * WHAT TRAVELS MARKED UP — the plates as the model will receive them, shown BEFORE the money is
 * spent. The human pays for the run; a count in a chip is not the same as seeing the files.
 *
 * The previews here are rasterised by the same code the launch uses, and each names the layer
 * revision it was taken at. They are NOT what is uploaded — the launch re-takes everything fresh —
 * so a layer edited after this preview shows up as a stale note against the band's own rev, and
 * the note says which way the difference runs: the run gets the newer drawing.
 */
export function MarkedPlatesModal({
  open,
  onOpenChange,
  techCardId,
  band,
  sel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  techCardId: number;
  band: GetDesignBandResponse;
  sel: FixSelectionShape;
}) {
  const [entries, setEntries] = useState<PreviewEntry[]>([]);
  const [pass, setPass] = useState(0);

  /**
   * Read on opening and on an explicit retake — deliberately NOT on every band refetch. The band
   * object is replaced by every poll while a run is live, and a dependency on it would re-read the
   * layers and wipe the previews mid-look. Staleness against the LIVE band is computed at render
   * instead, from `band.layers`, which is exactly the fact that moves.
   */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const plates = markedPlatesOf(band, sel);
    setEntries(plates.map((plate) => ({ plate, state: 'reading' as const })));
    (async () => {
      for (const plate of plates) {
        try {
          const taken = await takeMarkedRaster(techCardId, plate);
          if (!alive) return;
          setEntries((prev) =>
            prev.map((e) =>
              e.plate.key === plate.key
                ? taken.strokeCount
                  ? { plate, state: 'ready', rev: taken.rev, strokeCount: taken.strokeCount, dataUrl: taken.dataUrl }
                  : { plate, state: 'empty', rev: taken.rev }
                : e,
            ),
          );
        } catch (error) {
          if (!alive) return;
          const said = error instanceof Error && error.message ? error.message : 'the layer could not be read';
          setEntries((prev) =>
            prev.map((e) => (e.plate.key === plate.key ? { plate, state: 'failed', error: said } : e)),
          );
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pass, techCardId]);

  /** The band's CURRENT rev for an entry's layer — the live half of the staleness comparison. */
  const bandRevOf = (entry: PreviewEntry): number =>
    findLayerForMedia(band.layers, entry.plate.picture.media?.id ?? 0)?.rev ?? entry.plate.layerRev;

  const staleNames = entries
    .filter((e) => (e.state === 'ready' || e.state === 'empty') && bandRevOf(e) > e.rev)
    .map((e) => e.plate.label);

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => onOpenChange(false)}
      width='lg'
      title='what travels marked up'
      // A viewer, not a decision: the head's ✕ and Esc close it, and a footer with two close
      // buttons would be two spellings of one door.
      hideActions
    >
      <div className='space-y-stack'>
        <Text size='micro' variant='label' component='p'>
          A fix reads the bench itself — every slot&rsquo;s plate goes in as it stands. These are
          the EXTRA files this screen adds for the marked slots: the plate with its edit ▸ marks
          pressed in, one picture per marked slot, straight to the run and never into the band.
        </Text>

        {entries.length === 0 ? (
          <Text size='micro' variant='label' component='p'>
            no slot in this fix carries edit ▸ marks — the plates travel alone.
          </Text>
        ) : (
          <div className='flex flex-wrap items-start gap-2.5'>
            {entries.map((entry) => (
              <PlateFrame key={entry.plate.key} entry={entry} bandRev={bandRevOf(entry)} />
            ))}
          </div>
        )}

        <Text size='nano' variant='label' component='p'>
          previews — the run re-takes every marked plate fresh at GENERATE, at the layer as it
          stands then.
        </Text>

        {staleNames.length > 0 && (
          <CalloutBox tone='warning'>
            <div className='flex flex-wrap items-baseline gap-2'>
              <Text size='micro' component='span' className='min-w-0'>
                the drawing over {staleNames.join(', ')} has moved on since this preview was taken —
                the run takes the newest either way.
              </Text>
              <Button variant='secondary' size='xs' onClick={() => setPass((n) => n + 1)}>
                retake the preview
              </Button>
            </div>
          </CalloutBox>
        )}
      </div>
    </ConfirmationModal>
  );
}

/**
 * One marked plate, in its own picture's ratio — the same discipline as the compare dialog: a
 * frame of another shape shows a difference the screen invented.
 */
function PlateFrame({ entry, bandRev }: { entry: PreviewEntry; bandRev: number }) {
  const media = entry.plate.picture.media?.media;
  const w = media?.fullSize?.width ?? 0;
  const h = media?.fullSize?.height ?? 0;
  const stale = (entry.state === 'ready' || entry.state === 'empty') && bandRev > entry.rev;

  return (
    <div className='flex-1 space-y-1' style={{ minWidth: '180px', maxWidth: '260px' }}>
      <div className='flex flex-wrap items-baseline gap-1.5'>
        <Text size='micro' variant='uppercase' tracking='label' component='span'>
          {entry.plate.label}
        </Text>
        {entry.state === 'ready' && <Pill tone='attention'>plate + marks · layer r{entry.rev}</Pill>}
        {entry.state === 'empty' && <Pill tone='mut'>layer r{entry.rev} · no strokes</Pill>}
      </div>
      {/* `items-start` on the row above is load-bearing — see compare-modal on why a stretched
          flex item collapses an aspect-ratio frame to 0×0. */}
      <div
        // мат под снимком белый (R-12)
        className='relative w-full border border-borderColor bg-bgColor'
        style={{ aspectRatio: w > 0 && h > 0 ? `${w}/${h}` : '4/5' }}
      >
        {entry.state === 'ready' ? (
          <img
            src={entry.dataUrl}
            alt={`${entry.plate.label} with its marks pressed in`}
            className='absolute inset-0 h-full w-full object-contain'
          />
        ) : (
          <span className='absolute inset-0 flex items-center justify-center px-2 text-center'>
            <Text
              size='nano'
              component='span'
              className={entry.state === 'failed' ? 'text-error' : 'text-labelColor'}
            >
              {entry.state === 'reading'
                ? 'pressing the marks in…'
                : entry.state === 'empty'
                  ? 'this layer holds no strokes — nothing extra goes for this slot'
                  : entry.error}
            </Text>
          </span>
        )}
      </div>
      {entry.state === 'ready' && (
        <Text size='nano' variant='label' component='p'>
          {entry.strokeCount} line{entry.strokeCount === 1 ? '' : 's'} pressed into the plate
        </Text>
      )}
      {stale && (
        <Text size='nano' component='p' className='text-warning'>
          taken at r{entry.rev}, the drawing is at r{bandRev} now — the run gets the newer marks
        </Text>
      )}
    </div>
  );
}
