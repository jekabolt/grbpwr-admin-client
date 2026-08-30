import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import { MediaViewer, mediaFullToViewerItem, useMediaViewer } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import {
  BenchSlot,
  NewDetailCell,
  SHEET_MIN_VIEWS,
  displayDetailName,
  findSlot,
  pickEmptyReason,
  pickableFlats,
  readBench,
  slotRefKey,
  viewLabel,
} from './bench-slot';
import { shelfBatchOrdinals } from './handles';
import { type PickTarget, usePickMode } from './pick-mode';
import { newClientRequestId, useDesignWrites } from './use-design-band';

/**
 * THE BENCH — the four silhouette sides and the named details, and the one place on the card where
 * a human says «THIS picture is the front».
 *
 * IT IS THE ASKING SIDE OF PICK MODE, AND ONLY THAT. The bench arms a pick (`start`) and registers
 * what to do with the answer (`setHandler`); the band of pictures is what becomes clickable and
 * calls `resolve`. Neither could own the state — the bench would have to reach into the band to
 * highlight it, the band would have to know which slot asked — which is exactly why it lives above
 * both in `pick-mode.tsx` and why these two signatures are not ours to change.
 *
 * EVERY WRITE GOES THROUGH `useDesignWrites`. Not tidiness: the organs of this band are built by
 * separate hands in parallel, and a second call site for the same write is where two hands disagree
 * about what to invalidate afterwards. The seam already turns a 409 into «someone changed this
 * first» plus a refetch — this file must not spell that a second time, and does not.
 *
 * OPTIMISM, AND ITS ROLLBACK. A placement paints immediately, because the alternative is a slot
 * that stares back for a round trip after the human has already decided. What it does NOT do is
 * retry: a stale `expected_slot_rev` means somebody else put a picture in that slot a second ago,
 * their state wins, and ours is thrown away on purpose. So the optimistic paint is dropped the
 * moment the write errors, and otherwise held only until the band's own read agrees — never
 * indefinitely, which is how an optimistic value becomes a second source of truth.
 */

type Optimistic = {
  ref: DesignBenchSlotRef;
  /** The CAS token this write carried. The band's rev moving off it means a fresh read landed. */
  sentRev: number;
  /** What we painted, or null when the result is a picture the server has not minted yet. */
  pictureId: number | null;
  picture: common_DesignPicture | null;
};

export function Bench({
  techCardId,
  band,
  disabled,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
}): JSX.Element {
  const writes = useDesignWrites(techCardId);
  const pick = usePickMode();
  const viewer = useMediaViewer();

  const [optimistic, setOptimistic] = useState<Record<string, Optimistic>>({});
  /** A detail being minted has no slot to key on yet — it is born by this very write. */
  const [mintingDetail, setMintingDetail] = useState(false);

  const bench = useMemo(() => readBench(band), [band]);
  const candidates = useMemo(() => pickableFlats(band), [band]);
  const pickEmpty = useMemo(() => pickEmptyReason(band), [band]);
  const shelfOrdinals = useMemo(() => shelfBatchOrdinals(band.batches ?? []), [band.batches]);

  /**
   * THE OPTIMISTIC PAINT IS RELEASED BY THE SERVER'S OWN ANSWER, not by a timer and not by the
   * mutation settling. `onSettled` fires as soon as the RPC resolves — before the invalidated read
   * has landed — so releasing there flashes the slot back to its old picture for a frame. Two
   * honest releases: the band now shows what we asked for, or the slot's rev has moved off the one
   * we wrote against, which means a fresh read arrived and disagreed.
   */
  useEffect(() => {
    setOptimistic((prev) => {
      const keys = Object.keys(prev);
      if (!keys.length) return prev;
      let changed = false;
      const next = { ...prev };
      for (const key of keys) {
        const entry = prev[key];
        const live = findSlot(band, entry.ref);
        const liveRev = live?.slotRev ?? 0;
        const livePicture = live?.pictureId ?? 0;
        if (liveRev !== entry.sentRev || (entry.pictureId !== null && livePicture === entry.pictureId)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [band]);

  const dropOptimistic = useCallback((key: string) => {
    setOptimistic((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /** Place a picture that already exists in the band. */
  const placePicture = useCallback(
    (ref: DesignBenchSlotRef, expectedSlotRev: number, pictureId: number) => {
      const key = slotRefKey(ref);
      const picture = candidates.find((p) => p.id === pictureId) ?? null;
      setOptimistic((prev) => ({
        ...prev,
        [key]: { ref, sentRev: expectedSlotRev, pictureId, picture },
      }));
      writes.setBenchSlot.mutate(
        { slot: ref, pictureId, expectedSlotRev },
        { onError: () => dropOptimistic(key) },
      );
    },
    [candidates, writes.setBenchSlot, dropOptimistic],
  );

  /**
   * THE DOOR П-Ж / Э6: an existing file of this card straight into a slot.
   *
   * Every live card in production enters this band with a filled `technical_media`, callouts, and
   * an EMPTY bench. The mechanism of the bridge existed — the bench takes a `picture_id` and
   * `RegisterDesignUpload` takes a `media_id` — but the door did not, so minting v1 on any of those
   * cards meant RE-UPLOADING files that are already in the library. That breaks «the manual path is
   * equal in rights» for exactly all of production, which is why this is not a convenience.
   *
   * One RPC does both halves in one transaction: the media is filed into the band as a batch AND
   * placed into the slot, so a card can never end up with a plate in a slot that hangs under no row.
   * The `ghost_view` we send is the slot the human just chose — a guess the human is confirming in
   * the same gesture, which is precisely what the field is for.
   */
  const placeMedia = useCallback(
    (
      media: common_MediaFull,
      ref: DesignBenchSlotRef,
      expectedSlotRev: number,
      newDetailName?: string,
    ) => {
      const mediaId = media.id ?? 0;
      if (!mediaId) return;
      const key = slotRefKey(ref);
      const ghostView = (ref.viewKey ?? '').trim().toLowerCase() || 'detail';
      const minting = ghostView === 'detail' && !ref.slotId;
      if (minting) setMintingDetail(true);
      else {
        setOptimistic((prev) => ({
          ...prev,
          [key]: { ref, sentRev: expectedSlotRev, pictureId: null, picture: null },
        }));
      }
      writes.registerUpload.mutate(
        {
          // Minted once per human intent and NOT inside the mutation: a retry that carried a fresh
          // id would make the server honestly file a second batch.
          clientRequestId: newClientRequestId(),
          items: [{ mediaId, ghostView: ref.slotId ? 'detail' : ghostView }],
          target: ref,
          expectedSlotRev,
          newDetailName,
        },
        {
          onSettled: () => {
            if (minting) setMintingDetail(false);
            else dropOptimistic(key);
          },
        },
      );
    },
    [writes.registerUpload, dropOptimistic],
  );

  const unmark = useCallback(
    (ref: DesignBenchSlotRef, expectedSlotRev: number) => {
      const key = slotRefKey(ref);
      setOptimistic((prev) => ({
        ...prev,
        // `picture_id = 0` is UNMARK — empty the slot without deleting it. A different act from
        // deleting a detail slot, and it has to stay different.
        [key]: { ref, sentRev: expectedSlotRev, pictureId: 0, picture: null },
      }));
      writes.setBenchSlot.mutate(
        { slot: ref, pictureId: 0, expectedSlotRev },
        { onError: () => dropOptimistic(key) },
      );
    },
    [writes.setBenchSlot, dropOptimistic],
  );

  /**
   * PICK MODE'S ANSWER LANDS HERE — and the handler is registered ONCE, with a stable identity.
   *
   * The provider rebuilds its context value whenever the handler changes (its `resolve` closes over
   * it), so `setHandler` gets a new identity on every registration. Putting it in the effect's deps
   * would then be a loop: register → value changes → effect re-runs → cleanup nulls the handler →
   * value changes → register → … The identity below never changes and the effect runs on mount
   * only; the freshness that a re-registration would have bought is bought by a ref instead.
   */
  const answerRef = useRef<(pictureId: number, target: PickTarget) => void>(() => {});
  answerRef.current = (pictureId: number, target: PickTarget) => {
    const ref = target.slot;
    const minting = (ref.viewKey ?? '').trim().toLowerCase() === 'detail' && !ref.slotId;
    if (minting) {
      // A detail is minted by the placement itself, and the name it is minted with is the one the
      // human typed — which the target carries as its label, because a nameless mint is refused.
      setMintingDetail(true);
      writes.setBenchSlot.mutate(
        { slot: ref, pictureId, expectedSlotRev: 0, newDetailName: target.label },
        { onSettled: () => setMintingDetail(false) },
      );
      return;
    }
    placePicture(ref, target.expectedSlotRev, pictureId);
  };
  const stableAnswer = useRef((pictureId: number, target: PickTarget) =>
    answerRef.current(pictureId, target),
  ).current;

  const pickRef = useRef(pick);
  pickRef.current = pick;
  useEffect(() => {
    pickRef.current.setHandler(stableAnswer);
    return () => pickRef.current.setHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** What stands in a slot right now — the optimistic value where there is one. */
  const shownPicture = (
    ref: DesignBenchSlotRef,
    stored: common_DesignPicture | null | undefined,
  ): common_DesignPicture | null => {
    const entry = optimistic[slotRefKey(ref)];
    if (!entry) return stored ?? null;
    if (entry.pictureId === 0) return null;
    // `pictureId === null` is a RegisterDesignUpload in flight: the picture it will mint does not
    // exist yet, so the honest paint is the one already standing there, not an empty frame.
    return entry.picture ?? stored ?? null;
  };

  const isSaving = (ref: DesignBenchSlotRef) => !!optimistic[slotRefKey(ref)];

  /** Which slot the current pick is armed for — this bench's own affordance, not the band's. */
  const pickingKey = pick.target ? slotRefKey(pick.target.slot) : null;

  const detailsCitedByLatest = useMemo(() => {
    const cited = new Set<number>();
    for (const plate of band.latestVersion?.plates ?? []) {
      if (plate.slotId) cited.add(plate.slotId);
    }
    return cited;
  }, [band.latestVersion]);

  const filledSides = bench.sides.filter(
    ({ view, slot }) => !!shownPicture({ viewKey: view }, slot?.picture),
  ).length;

  /** Everything the viewer can page through, in the order the bench draws it. */
  const viewerPictures: common_DesignPicture[] = [];
  for (const { view, slot } of bench.sides) {
    const p = shownPicture({ viewKey: view }, slot?.picture);
    if (p?.media) viewerPictures.push(p);
  }
  for (const slot of bench.details) {
    const p = shownPicture({ slotId: slot.id }, slot.picture);
    if (p?.media) viewerPictures.push(p);
  }
  const viewerItems = viewerPictures.map((p) => mediaFullToViewerItem(p.media as common_MediaFull));

  return (
    <Section
      id='design-bench'
      title='flat slots'
      question='— whatever is marked here is what the sheet and the tech pack read'
      action={
        mintingDetail ? (
          <Text size='micro' variant='label' component='span' className='uppercase'>
            adding a detail…
          </Text>
        ) : undefined
      }
    >
      {/* NO BANNER HERE. The composer (`studio-tab`) owns the one that says «choosing for FRONT —
          click a picture in the band», because it owns both the asking side and the answering one.
          What the bench adds instead is WHICH slot is armed — a thing said positionally, on the slot
          itself, which a page-level banner cannot do. */}

      <GroupLabel
        flush
        action={
          <Text size='micro' variant='label' component='span'>
            {filledSides} of 4 · the sheet needs front and back
          </Text>
        }
      >
        sides
      </GroupLabel>

      <Tiles min={190}>
        {bench.sides.map(({ view, slot }) => {
          const ref: DesignBenchSlotRef = { viewKey: view };
          const rev = slot?.slotRev ?? 0;
          const picture = shownPicture(ref, slot?.picture);
          return (
            <BenchSlot
              key={view}
              band={band}
              techCardId={techCardId}
              slotRef={ref}
              slot={slot}
              label={viewLabel(view)}
              picture={picture}
              slotRev={rev}
              required={SHEET_MIN_VIEWS.includes(view)}
              saving={isSaving(ref)}
              picking={pickingKey === slotRefKey(ref)}
              pickEmpty={pickEmpty}
              disabled={disabled}
              shelfOrdinals={shelfOrdinals}
              onPlaceMedia={(media) => placeMedia(media, ref, rev)}
              onPick={() =>
                pick.start({ slot: ref, label: viewLabel(view), expectedSlotRev: rev })
              }
              onCancelPick={pick.cancel}
              onUnmark={() => unmark(ref, rev)}
              onOpenViewer={
                picture?.media
                  ? () => viewer.openAt(viewerPictures.findIndex((p) => p.id === picture.id))
                  : undefined
              }
            />
          );
        })}
      </Tiles>

      <GroupLabel
        action={
          <Text size='micro' variant='label' component='span'>
            {bench.details.length} · the sheet cites a detail by its own name
          </Text>
        }
      >
        details
      </GroupLabel>

      <Tiles min={160}>
        {bench.details.map((slot) => {
          const ref: DesignBenchSlotRef = { slotId: slot.id };
          const rev = slot.slotRev ?? 0;
          const name = displayDetailName(bench.details, slot);
          const picture = shownPicture(ref, slot.picture);
          const cited = slot.id ? detailsCitedByLatest.has(slot.id) : false;
          return (
            <BenchSlot
              key={slot.id}
              band={band}
              techCardId={techCardId}
              slotRef={ref}
              slot={slot}
              label={name}
              picture={picture}
              slotRev={rev}
              detail
              saving={isSaving(ref)}
              picking={pickingKey === slotRefKey(ref)}
              pickEmpty={pickEmpty}
              disabled={disabled}
              shelfOrdinals={shelfOrdinals}
              onPlaceMedia={(media) => placeMedia(media, ref, rev)}
              onPick={() => pick.start({ slot: ref, label: name, expectedSlotRev: rev })}
              onCancelPick={pick.cancel}
              onUnmark={() => unmark(ref, rev)}
              onRename={(next) =>
                writes.setBenchSlot.mutate({
                  slot: ref,
                  // A rename must ECHO the plate. `picture_id` is not optional and 0 means UNMARK,
                  // so a rename that sent 0 would quietly empty the slot it was renaming.
                  pictureId: slot.pictureId ?? 0,
                  expectedSlotRev: rev,
                  newDetailName: next,
                })
              }
              onDelete={() => writes.deleteDetailSlot.mutate(slot.id ?? 0)}
              deleteBlocked={
                cited
                  ? 'the issued sheet cites this slot by name — it cannot be removed'
                  : null
              }
              onOpenViewer={
                picture?.media
                  ? () => viewer.openAt(viewerPictures.findIndex((p) => p.id === picture.id))
                  : undefined
              }
            />
          );
        })}

        <NewDetailCell
          disabled={disabled}
          pickEmpty={pickEmpty}
          onPlaceMedia={(media, name) => placeMedia(media, { viewKey: 'detail' }, 0, name)}
          onPick={(name) =>
            // The label IS the name here: a detail that does not exist yet has no other identity,
            // and `new_detail_name` is required by the mint.
            pick.start({ slot: { viewKey: 'detail' }, label: name, expectedSlotRev: 0 })
          }
        />
      </Tiles>

      <Text size='nano' variant='label' component='p'>
        A slot takes a file three ways and they are equal: browse the library (an existing flat of
        this card goes straight in — no re-upload), ⌘V or drop a file, or mark a picture the band
        already holds.
      </Text>

      <MediaViewer items={viewerItems} {...viewer} />
    </Section>
  );
}
