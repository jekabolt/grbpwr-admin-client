import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
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
import { type BenchKind } from './bench-kinds';
import { shelfBatchOrdinals } from './handles';
import { MixWarn } from './mixwarn';
import { type PickTarget, usePickMode } from './pick-mode';
import { useSplitToInput } from './split-to-input';
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
 *
 * THE SHEET BAR AND THE MIXED-PROVENANCE WARNING ARE ROWS OF THIS BLOCK, not blocks of their own.
 * The prototype calls `sheetbarHtml()` and `mixwarnHtml()` from inside `slotsHtml()`'s header
 * (`proto.html:3584`), and the difference is not decoration: mounted as siblings in the studio's
 * `SectionStack` they became three white slabs in a row with 24px of ground between them, i.e.
 * three statements of equal weight, when two of them are statements ABOUT the third. Both organs
 * are still their own files and read the band themselves — only the mounting moved.
 *
 * ЦИКЛА ПОЧИНКИ ЗДЕСЬ БОЛЬШЕ НЕТ (S-14/S-15): дверь `fix ▸`, галки-шортлист и полосы состояния
 * сняты решением владельца вместе с `fix-flow.tsx`. Поля провода `fix_targets`/`fix_slot_ids`
 * живут дальше у векторного прогона (`modals/use-trace-vector.ts`) и в замороженной истории —
 * их не трогать; см. шапку `bench-slot.tsx`.
 */

/**
 * WHICH BENCH THIS FILE ADDRESSES, SAID ONCE AND OUT LOUD.
 *
 * `DesignBenchSlotRef` grew a `kind` (flat | render | threed) when the band gained a second and a
 * third bench: a render FRONT and a flat FRONT are two different slots and BOTH are addressed by the
 * view key `front`. The wire reads an empty kind as `flat`, so this file would still work spelling
 * nothing — and that is exactly the failure worth avoiding, because the day a render bench is built
 * from a copy of this component the silence would put its plates on the flat sheet. FLAT SLOTS says
 * flat — on every ref it writes AND on every read it makes: `readBench` filters by kind since L-5,
 * because a card with a render bench carries TWO rows per view and the kind-blind read handed this
 * screen the RENDER front (rev 4, empty) to display and to echo against a flat write.
 */
const FLAT_BENCH: BenchKind = 'flat';

/** A silhouette side of the FLAT bench, addressed the way it is addressed for its whole life. */
const sideRef = (view: string): DesignBenchSlotRef => ({ viewKey: view, kind: FLAT_BENCH });

/** An existing slot by its minted id. `kind` is ignored here by the contract — an id names its own
 *  bench, and a kind disagreeing with it would be a contradiction nobody could adjudicate. */
const detailRef = (slotId?: number): DesignBenchSlotRef => ({ slotId, kind: undefined });

/** `view_key = detail` is the MINT VERB, not an address: it names no row and requires a name. */
const mintDetailRef = (): DesignBenchSlotRef => ({ viewKey: 'detail', kind: FLAT_BENCH });

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

  const [optimistic, setOptimistic] = useState<Record<string, Optimistic>>({});
  /** A detail being minted has no slot to key on yet — it is born by this very write. */
  const [mintingDetail, setMintingDetail] = useState(false);

  const bench = useMemo(() => readBench(band, FLAT_BENCH), [band]);
  const candidates = useMemo(() => pickableFlats(band), [band]);
  const pickEmpty = useMemo(() => pickEmptyReason(band), [band]);
  const shelfOrdinals = useMemo(() => shelfBatchOrdinals(band.batches ?? []), [band.batches]);

  /**
   * СПЛИТ ПЛИТЫ → ВХОД (R-17, владелец: «тоже самое должно работать в FLAT SLOTS»). ТОТ ЖЕ хук,
   * что у блока референсов, — второй механизм разъехался бы с первым в значении роли. Дверь для
   * плит — `openForPicture`: плита УЖЕ картинка полосы, шаг регистрации референса здесь пропущен.
   * Роли кадрам ставит СЕРВЕР в транзакции разреза (см. шапку `split-to-input.tsx`); отсюда кропы
   * получают только строки входа, а помеченными приезжают со следующим чтением полосы.
   */
  const split = useSplitToInput({ techCardId, band });

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
          items: [{ mediaId, ghostView: ref.slotId ? 'detail' : ghostView, kind: FLAT_BENCH }],
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

  const filledSides = bench.sides.filter(
    ({ view, slot }) => !!shownPicture(sideRef(view), slot?.picture),
  ).length;

  /* РЯД ПРОСМОТРЩИКА БОЛЬШЕ НЕ СОБИРАЕТСЯ ЗДЕСЬ. Он собирался из плит ВЕРСТАКА и только из них,
     поэтому «дальше» упиралось в последнюю плиту: за краем верстака ряду просто нечего было
     показать. Теперь каждая плитка регистрируется в общий `PictureGalleryProvider` студии
     (смонтирован в `studio-tab.tsx`), а порядок ряда берётся из порядка в документе — листается
     ровно то, что человек видит, включая референсы и историю прогонов. */

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

      {/* ШАПКА БЛОКА — строка о композиции целиком, до того как речь пойдёт об отдельном слоте:
          чем нельзя поручиться за смесь происхождений. Строк было две: рядом стоял `SheetBar`,
          и он был высказыванием о ПОСЛЕДНЕЙ ВЫПУЩЕННОЙ ВЕРСИИ листа — «v3 · столько-то плит,
          верстак с тех пор разошёлся». Версии снесены целиком, вместе с бэкендом, поэтому бар
          снят, а не переписан: пересказывать его текст без версии значило бы говорить о состоянии,
          которого больше не существует. Полосы починки («fix several ▸») здесь тоже нет — цикл
          снят (S-15). */}
      <MixWarn band={band} />

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
          const ref: DesignBenchSlotRef = sideRef(view);
          const rev = slot?.slotRev ?? 0;
          const picture = shownPicture(ref, slot?.picture);
          const key = slotRefKey(ref);
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
              picking={pickingKey === key}
              pickEmpty={pickEmpty}
              disabled={disabled}
              shelfOrdinals={shelfOrdinals}
              onPlaceMedia={(media) => placeMedia(media, ref, rev)}
              onPick={() =>
                pick.start({ slot: ref, label: viewLabel(view), expectedSlotRev: rev })
              }
              onCancelPick={pick.cancel}
              onUnmark={() => unmark(ref, rev)}
              // Ручкой сплиту служит имя слота: человек режет «плиту FRONT», а не «upload 3 · b».
              onSplit={picture ? () => split.openForPicture(picture, viewLabel(view)) : undefined}
              galleryItem={
                picture?.media ? mediaFullToViewerItem(picture.media as common_MediaFull) : undefined
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
          const ref: DesignBenchSlotRef = detailRef(slot.id);
          const rev = slot.slotRev ?? 0;
          const name = displayDetailName(bench.details, slot);
          const picture = shownPicture(ref, slot.picture);
          const key = slotRefKey(ref);
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
              picking={pickingKey === key}
              pickEmpty={pickEmpty}
              disabled={disabled}
              shelfOrdinals={shelfOrdinals}
              onPlaceMedia={(media) => placeMedia(media, ref, rev)}
              onPick={() => pick.start({ slot: ref, label: name, expectedSlotRev: rev })}
              onCancelPick={pick.cancel}
              onUnmark={() => unmark(ref, rev)}
              onSplit={picture ? () => split.openForPicture(picture, name) : undefined}
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
              // СНЯТИЕ ДЕТАЛИ БОЛЬШЕ НИЧЕМ НЕ ЗАПЕРТО ОТСЮДА. Здесь стояло `deleteBlocked` с
              // единственной причиной — «выпущенный лист ссылается на этот слот по имени», и она
              // читалась из плит последней ВЕРСИИ листа. Версий больше нет — снесены целиком,
              // вместе с бэкендом, — а значит нет и замороженного состава, который мог бы
              // цитировать слот. Придумать запрету вторую причину было бы хуже, чем снять его:
              // запрет, который клиент назначает сам, разойдётся с сервером на первом же отказе.
              onDelete={() => writes.deleteDetailSlot.mutate(slot.id ?? 0)}
              galleryItem={
                picture?.media ? mediaFullToViewerItem(picture.media as common_MediaFull) : undefined
              }
            />
          );
        })}

        <NewDetailCell
          disabled={disabled}
          pickEmpty={pickEmpty}
          onPlaceMedia={(media, name) => placeMedia(media, mintDetailRef(), 0, name)}
          onPick={(name) =>
            // The label IS the name here: a detail that does not exist yet has no other identity,
            // and `new_detail_name` is required by the mint.
            pick.start({ slot: mintDetailRef(), label: name, expectedSlotRev: 0 })
          }
        />
      </Tiles>

      <Text size='nano' variant='label' component='p'>
        A slot takes a file three ways and they are equal: browse the library (an existing flat of
        this card goes straight in — no re-upload), ⌘V or drop a file, or mark a picture the band
        already holds.
      </Text>

      {/* Модалка сплита (R-17) — одна на верстак, открывается кнопкой «split» любой плиты. */}
      {split.modal}

    </Section>
  );
}
