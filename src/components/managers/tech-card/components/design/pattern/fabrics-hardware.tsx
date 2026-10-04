import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignAsset,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useMediaIntake } from 'components/managers/media/utils/useMediaIntake';
import { PantonePicker } from 'components/managers/tech-card/components/pantone-picker';
import {
  ensurePantoneLibrary,
  pantoneLibraryState,
  pantoneVersion,
  subscribePantone,
} from 'components/managers/tech-card/components/pantone-swatches';
import { useMutationState } from '@tanstack/react-query';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Chip, ChipRow } from 'ui/components/chip';
import { Section } from 'ui/components/section';
import { HeaderCount } from 'ui/components/section-header';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';

import { kindLabel } from '../../bom-kind';
import { wireInt } from '../../wire-int';
import {
  ASSETS_PER_CARD_MAX,
  ASSET_FABRIC,
  ASSET_HARDWARE,
  assetFull,
  assetLabel,
  assetThumb,
} from '../assets/model';
import { useAssetBindingWrites, useAssetWrites } from '../assets/use-assets';
import { BENCH_CELL_STYLE, BENCH_FRAME_ASPECT, InertDoor, SlotCap } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { archivedRef, colorwayLabel } from '../colorway-picker';
import { ColourwayStrip } from '../colourway-strip';
import { EmptyState, Money, PlaceOrDrawCell } from '../core';
import { FlatCustom } from '../flat-custom';
import { openStepOf, type StepId } from '../core/chain';
import { useElapsed, useRunPolling } from '../generation';
import { RunCancelCorner, useCancelRun } from '../generation/live-tiles';
import { isCancelling, isRunLive } from '../generation/run-state';
import { PictureSlotEmpty, PictureSlotFilled } from '../playground/fields/image-slots';
import { PictureTile, useGalleryGroup, useOpenGalleryGroup } from '../picture-tile';
import { GenerateRow, RunRefusal } from '../render/generate-row';
import { archivedColorwayGate, type Gate } from '../render/model';
import {
  startRunKey,
  useStartDesignRun,
  type StartRunInput,
  type StartRunState,
} from '../render/use-design-run';
import { patternRuns } from './model';
import {
  NO_BINDINGS_REASON,
  PANTONE_LOADING_REASON,
  READ_ONLY_RUN_REASON,
  LABEL_LOOKS,
  LABEL_PLACES,
  SILENT_SERVER_REASON,
  SLOT_WORDS_MAX,
  bindingsSpoken,
  boundAssetsByPair,
  colourIsStated,
  isLabelSlot,
  mintSlotName,
  pairKey,
  pairOfRun,
  placementChip,
  shelfCeiling,
  swatchColour,
  withOwnHex,
  type LabelSeed,
  type MaterialSlot,
  type SwatchColour,
} from './slot-fabrics';
import { TrimPictogramBackdrop } from './trim-pictograms';

/**
 * STEP 3 · MATERIALS — two blocks:
 *   · `colourways` — large swatch tiles on the studio's one colourway axis;
 *   · `materials` — one cell per material slot; ONE slot is selected, and the GENERATE panel
 *     under the cells is that slot's spec (colour · pictures · words). GENERATE makes that slot;
 *     `all empty slots · N` makes every empty slot from its own spec.
 * A run lands server-side and binds itself to (colourway, slot); an own picture is
 * UpsertDesignAsset → SetDesignAssetBinding. Both carry the spec (`note` = words, colour code).
 */
export type FabricsHardwareProps = {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  colorways: common_AdminColorwayRef[];
  colorwayId: number;
  onColorwayChange: (id: number) => void;
  slots: MaterialSlot[];
  /** Card LABELS rows by BOM line: a label slot seeds placement · fold · size from its row. */
  labelSeeds?: ReadonlyMap<number, LabelSeed>;
  onGoStep: (step: StepId) => void;
  loading?: boolean;
};

const NO_LABEL_SEEDS: ReadonlyMap<number, LabelSeed> = new Map();

const REFS_MAX = 4;
/** One scope for the bench's presses: «starting…» and per-press outcomes are read from the cache. */
const RUN_SCOPE = 'fabrics-hardware';

/** A press on its way: added before `start`, gone once its run is live, refused or re-read. */
type Launch = { id: string; done: boolean; at: number; bandAt?: GetDesignBandResponse };

/** A press that has not landed a run by now is dropped, so GENERATE is never blocked for good. */
const LAUNCH_EXPIRY_MS = 30_000;

export function FabricsHardware({
  band,
  techCardId,
  disabled,
  colorways,
  colorwayId,
  onColorwayChange,
  slots,
  labelSeeds = NO_LABEL_SEEDS,
  onGoStep,
  loading,
}: FabricsHardwareProps): JSX.Element {
  // One poll per step: live runs end on screen.
  useRunPolling(techCardId, band);

  const shown = colorways.filter((colorway) => (colorway.colorwayId ?? 0) > 0);

  return (
    <>
      <Section id='design-colourways' title='colourways' question='· material packs'>
        {/* V6: `+ new` deep-links to the moodboard's colourways block. */}
        <ColourwayStrip
          colorways={shown}
          selectedId={colorwayId}
          onSelect={onColorwayChange}
          onCreate={() => openStepOf('colorways')}
          disabled={disabled}
          loading={loading}
        />
      </Section>

      <MaterialBench
        band={band}
        techCardId={techCardId}
        disabled={disabled}
        colorway={colorways.find((c) => (c.colorwayId ?? 0) === colorwayId && colorwayId > 0)}
        slots={slots}
        labelSeeds={labelSeeds}
        onGoStep={onGoStep}
      />
    </>
  );
}

function MaterialBench({
  band,
  techCardId,
  disabled,
  colorway,
  slots,
  labelSeeds,
  onGoStep,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  colorway?: common_AdminColorwayRef;
  slots: MaterialSlot[];
  labelSeeds: ReadonlyMap<number, LabelSeed>;
  onGoStep: (step: StepId) => void;
}): JSX.Element {
  const { showMessage } = useSnackBarStore();
  const speaks = serverSpeaksDesign();
  const capable = bindingsSpoken(band);
  const run = useStartDesignRun(techCardId, { scope: RUN_SCOPE });
  const writes = useAssetWrites(techCardId);
  const binds = useAssetBindingWrites(techCardId);

  const cwId = colorway?.colorwayId ?? 0;
  const cwName = colorway ? colorwayLabel(colorway) : '';
  const archived = archivedRef(colorway);

  // Full Pantone library from the first frame, so a recipe code outside the shortlist has a hex.
  useEffect(() => {
    if (capable) void ensurePantoneLibrary();
  }, [capable]);
  useSyncExternalStore(subscribePantone, pantoneVersion, pantoneVersion);
  const libraryState = pantoneLibraryState();
  const pantonePending = libraryState === 'idle' || libraryState === 'loading';

  const ownPantone = (colorway?.pantone ?? '').trim();
  const ownHex = (colorway?.devHex ?? '').trim();

  /* ─── slot specs: card-scoped drafts keyed by (colourway, slot) ─── */
  const [specState, setSpecState] = useState<{ card: number; map: ReadonlyMap<string, Spec> }>({
    card: techCardId,
    map: new Map(),
  });
  const drafts = specState.card === techCardId ? specState.map : new Map<string, Spec>();
  const setSpec = (slot: MaterialSlot, spec: Spec) =>
    setSpecState((prev) => ({
      card: techCardId,
      map: new Map(prev.card === techCardId ? prev.map : []).set(
        pairKey(cwId, slot.bomItemId),
        spec,
      ),
    }));

  const byPair = useMemo(() => boundAssetsByPair(band), [band]);
  const ceiling = useMemo(() => shelfCeiling(band), [band]);
  const liveByPair = useMemo(() => {
    const out = new Map<string, common_DesignRun>();
    for (const r of patternRuns(band).filter(isRunLive)) {
      const key = pairOfRun(r);
      if (key && !out.has(key)) out.set(key, r);
    }
    return out;
  }, [band]);

  // Seed when a pair has no draft: bound asset → defaults (BOM words, colourway pantone).
  const seedOf = (slot: MaterialSlot): Spec => {
    const fabric = slot.family === 'fabric';
    const asset = cwId > 0 ? byPair.get(pairKey(cwId, slot.bomItemId)) : undefined;
    if (asset) {
      const code = (asset.colourCode ?? '').trim();
      return {
        colourCode: code || (fabric ? ownPantone : ''),
        words: (asset.note ?? '').trim(),
        pictures: [],
      };
    }
    if (fabric) return { colourCode: ownPantone, words: slot.detail, pictures: [] };
    if (isLabelSlot(slot)) {
      // Label: BOM detail · card row placement (as a chip word) · fold (unless flat) · size.
      const row = labelSeeds.get(slot.bomItemId);
      const folding = row?.folding ?? '';
      return {
        colourCode: '',
        words: [
          ...slot.detail.split(' · '),
          placementChip(row?.placement ?? ''),
          sameWord(folding, 'flat') ? '' : folding,
          row?.size ?? '',
        ]
          .map((w) => w.trim())
          .filter(Boolean)
          .join(', '),
        pictures: [],
      };
    }
    const kind = kindLabel(slot.kind) ?? '';
    return {
      colourCode: '',
      words: [kind && !sameWord(kind, slot.name) ? kind : '', slot.detail]
        .filter(Boolean)
        .join(' · '),
      pictures: [],
    };
  };
  const specOf = (slot: MaterialSlot): Spec =>
    drafts.get(pairKey(cwId, slot.bomItemId)) ?? seedOf(slot);
  // The colour a spec sends: the colourway's own code shows its own hex. An untouched fabric of a
  // colourway without a Pantone falls back to the colourway's screen hex.
  const colourOf = (slot: MaterialSlot, spec: Spec): SwatchColour | null => {
    const picked = withOwnHex(swatchColour(spec.colourCode), ownPantone, ownHex);
    if (picked) return picked;
    const drafted = drafts.has(pairKey(cwId, slot.bomItemId));
    return slot.family === 'fabric' && !drafted && ownHex
      ? { code: '', hex: ownHex, words: '' }
      : null;
  };

  /* ─── presses in flight (one hook instance tracks only its last mutation) ─── */
  const [launching, setLaunching] = useState<ReadonlyMap<string, Launch>>(new Map());
  // A card switch drops every press in flight (render-body reset, like the drafts above).
  const [launchCard, setLaunchCard] = useState(techCardId);
  if (launchCard !== techCardId) {
    setLaunchCard(techCardId);
    setLaunching(new Map());
  }
  // A tick while anything is in flight, so an entry past its expiry is dropped without a band change.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (launching.size === 0) return;
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, [launching.size]);
  const pressStates = useMutationState({
    filters: { mutationKey: startRunKey(techCardId, RUN_SCOPE) },
    select: (m) => ({
      id: (m.state.variables as { clientRequestId?: string } | undefined)?.clientRequestId ?? '',
      status: m.state.status,
    }),
  });
  useEffect(() => {
    if (launching.size === 0) return;
    let changed = false;
    const next = new Map(launching);
    for (const [key, l] of launching) {
      const states = pressStates.filter((p) => p.id === l.id);
      const last = states[states.length - 1];
      if (liveByPair.has(key) || last?.status === 'error' || now - l.at > LAUNCH_EXPIRY_MS) {
        next.delete(key);
        changed = true;
      } else if (l.done && l.bandAt !== band) {
        next.delete(key);
        changed = true;
      } else if (!l.done && last?.status === 'success') {
        next.set(key, { ...l, done: true, bandAt: band });
        changed = true;
      }
    }
    if (changed) setLaunching(next);
  }, [launching, pressStates, liveByPair, band, now]);

  // The hook clears its refusal on the next accepted press; the bench keeps it until dismissed.
  const [shownRefusal, setShownRefusal] = useState<{
    card: number;
    refusal: NonNullable<StartRunState['refusal']>;
  } | null>(null);
  useEffect(() => {
    if (run.refusal) setShownRefusal({ card: techCardId, refusal: run.refusal });
  }, [run.refusal, techCardId]);
  const refusal = shownRefusal?.card === techCardId ? shownRefusal.refusal : null;

  // Free room on the shelf: every live pattern run and every press in flight lands one asset.
  const room =
    ASSETS_PER_CARD_MAX -
    (band.assets ?? []).length -
    patternRuns(band).filter(isRunLive).length -
    launching.size;

  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const mark = (key: string, on: boolean) =>
    setSaving((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  /*
   * UNDO = (previous asset, what our clear/replace set). It is offered only while the pair's
   * binding is still exactly what we set and the previous asset is still on the shelf — so an
   * undo never overwrites a later binding (another tab, a landed run, a second replace).
   */
  const [undoState, setUndoState] = useState<{
    card: number;
    pairs: ReadonlyMap<string, UndoEntry>;
  }>({ card: techCardId, pairs: new Map() });
  if (undoState.card !== techCardId) {
    setUndoState({ card: techCardId, pairs: new Map() });
  }
  const undos = undoState.card === techCardId ? undoState.pairs : new Map<string, UndoEntry>();
  const rawBound = useMemo(() => {
    const out = new Map<string, number>();
    for (const b of band.assetBindings ?? []) {
      out.set(pairKey(wireInt(b.colorwayId), wireInt(b.bomItemId)), wireInt(b.assetId));
    }
    return out;
  }, [band]);
  const shelfIds = useMemo(
    () => new Set((band.assets ?? []).map((a) => wireInt(a.id)).filter((id) => id > 0)),
    [band],
  );
  const undoLive = (key: string, e: UndoEntry) =>
    (rawBound.get(key) ?? 0) === e.setTo && shelfIds.has(e.prevId);
  // Drop entries the band has moved past: the pair now holds neither what we set nor what we
  // replaced (the latter is the window before the re-read lands), or the previous asset is gone.
  useEffect(() => {
    let stale = false;
    for (const [key, e] of undos) {
      const now = rawBound.get(key) ?? 0;
      if (!shelfIds.has(e.prevId) || (now !== e.setTo && now !== e.prevId)) stale = true;
    }
    if (!stale) return;
    setUndoState((prev) => {
      const next = new Map(prev.pairs);
      for (const [key, e] of prev.pairs) {
        const now = rawBound.get(key) ?? 0;
        if (!shelfIds.has(e.prevId) || (now !== e.setTo && now !== e.prevId)) next.delete(key);
      }
      return { card: prev.card, pairs: next };
    });
  }, [undos, rawBound, shelfIds]);
  const rememberUndo = (key: string, prevId: number, setTo: number) => {
    if (prevId <= 0) return;
    setUndoState((prev) => ({
      card: techCardId,
      pairs: new Map(prev.card === techCardId ? prev.pairs : []).set(key, { prevId, setTo }),
    }));
  };
  const forgetUndo = (key: string) =>
    setUndoState((prev) => {
      if (prev.card !== techCardId || !prev.pairs.has(key)) return prev;
      const next = new Map(prev.pairs);
      next.delete(key);
      return { card: techCardId, pairs: next };
    });

  /* ─── gates ─── */
  const archivedGate = archivedColorwayGate(archived, cwName, 'materials');
  const baseGate: Gate = disabled
    ? { ok: false, reason: READ_ONLY_RUN_REASON }
    : !capable
      ? { ok: false, reason: NO_BINDINGS_REASON }
      : !speaks
        ? { ok: false, reason: SILENT_SERVER_REASON }
        : cwId <= 0
          ? { ok: false, reason: 'pick a colourway above' }
          : !archivedGate.ok
            ? archivedGate
            : ceiling.full
              ? { ok: false, reason: ceiling.reason }
              : { ok: true };

  const slotGate = (slot: MaterialSlot): Gate => {
    if (!baseGate.ok) return baseGate;
    const k = pairKey(cwId, slot.bomItemId);
    if (liveByPair.has(k) || launching.has(k)) {
      return { ok: false, reason: 'being made — it lands in the cell by itself' };
    }
    const colour = colourOf(slot, specOf(slot));
    if (slot.family === 'fabric' && !colourIsStated(colour)) {
      return { ok: false, reason: 'a fabric is dyed from a colour · pick one' };
    }
    if (pantonePending && colour?.code.trim() && !colour.hex.trim()) {
      return { ok: false, reason: PANTONE_LOADING_REASON };
    }
    return { ok: true };
  };

  const ROOM_REASON =
    'the shelf has no room for another run until the ones being made land — or delete a fabric';
  const roomReason = ceiling.full ? ceiling.reason : ROOM_REASON;
  // An own picture waits for no run: only the real shelf count can refuse it (owner 04.10: «в
  // материалы теперь нельзя загрузить свои медиа так не должно быть»).
  const shelfRoom = ASSETS_PER_CARD_MAX - (band.assets ?? []).length > 0;
  const SHELF_REASON = ceiling.full
    ? ceiling.reason
    : `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets — remove one to make room`;
  const cellGate = (slot: MaterialSlot): Gate => {
    const g = slotGate(slot);
    return !g.ok ? g : room <= 0 ? { ok: false, reason: ROOM_REASON } : g;
  };

  /* ─── selection: one slot; fallback = first empty slot of the colourway, else the first ─── */
  const [selectedState, setSelectedState] = useState<{ card: number; bomItemId: number }>({
    card: techCardId,
    bomItemId: 0,
  });
  const pickedId = selectedState.card === techCardId ? selectedState.bomItemId : 0;
  const selected =
    slots.find((s) => s.bomItemId === pickedId) ??
    slots.find((s) => !byPair.has(pairKey(cwId, s.bomItemId))) ??
    slots[0];
  const pick = (slot: MaterialSlot) =>
    setSelectedState({ card: techCardId, bomItemId: slot.bomItemId });

  // Every empty slot that can run now, fabrics first, capped by shelf room.
  const emptyRunnable = slots
    .filter((s) => !byPair.has(pairKey(cwId, s.bomItemId)) && slotGate(s).ok)
    .sort((a, b) => (a.family === b.family ? 0 : a.family === 'fabric' ? -1 : 1));
  const emptyBatch = emptyRunnable.slice(0, Math.max(0, room));
  const emptyGate: Gate =
    launching.size > 0
      ? { ok: false, reason: 'starting — wait for the runs already sent' }
      : emptyBatch.length === 0
        ? { ok: false, reason: roomReason }
        : { ok: true };

  /* ─── runs ─── */
  const runInput = (slot: MaterialSlot, spec0: Spec): StartRunInput => {
    // `logo = picture 1` is reserved for the logo tile: never let typed words carry it.
    const spec = { ...spec0, words: spec0.words.replace(/logo\s*=\s*picture\s*1/gi, '').trim() };
    const hardware = slot.family === 'hardware';
    const label = isLabelSlot(slot);
    const c = colourOf(slot, spec);
    const idsOf = (list: common_MediaFull[] | undefined) =>
      (list ?? []).map((m) => m.id ?? 0).filter((id) => id > 0);
    const logoIds = label ? idsOf(spec.pictures).slice(0, 1) : [];
    // Label: [logo (if any), ...references]; the marker tells the model which picture is the logo.
    const pictureIds = label
      ? [...logoIds, ...idsOf(spec.refs).slice(0, LABEL_REFS_MAX)]
      : idsOf(spec.pictures);
    // Label: placement chips ride as «sewn at …» context, the rest is the label itself.
    const said = wordList(spec.words);
    const place = said.filter((w) => LABEL_PLACES.some((p) => sameWord(p, w))).join(', ');
    const rest = said.filter((w) => !LABEL_PLACES.some((p) => sameWord(p, w))).join(', ');
    const words = label
      ? uniqueWords([
          c?.words ?? '',
          rest,
          place ? `sewn at ${place}` : '',
          slot.name,
          'label',
          logoIds.length > 0 ? 'logo = picture 1' : '',
        ])
      : hardware
        ? uniqueWords([c?.words ?? '', spec.words, slot.name, kindLabel(slot.kind) ?? ''])
        : [c?.words ?? '', spec.words.trim() || slot.words].filter(Boolean).join(' · ');
    return {
      kind: 'pattern',
      // Lands as the asset's note (what it is made of).
      ask: spec.words.trim(),
      params: {
        views: [],
        colorwayId: cwId,
        layout: '',
        colour: {
          source: '',
          code: c?.code ?? '',
          hex: c?.hex ?? '',
          words,
          fabricMediaId: 0,
          fabrics: [],
          colourMaps: [],
        },
        threed: undefined,
        fixTarget: '',
        // Fabric: one texture picture; label: logo + references; hardware: up to four references.
        extraInputMediaIds: pictureIds.slice(0, hardware ? REFS_MAX : 1),
        fixTargets: [],
        fixSlotIds: [],
        autoSplit: false,
        detailSlotIds: [],
        pattern: {
          repeatMm: 0,
          name: mintSlotName(band, cwName, slot.name),
          sourceAssetId: 0,
          mode: label ? 'label' : hardware ? 'hardware' : 'swatch',
          bomItemId: slot.bomItemId,
        },
        freeform: undefined,
        useFlatSlots: false,
        flatSlotIds: [],
        image: undefined,
        inpaint: undefined,
        extend: undefined,
        video: undefined,
      },
    };
  };

  // Each slot runs from its own spec (draft → asset → defaults).
  const generate = (list: MaterialSlot[]) => {
    for (const slot of list) {
      if (!slotGate(slot).ok) continue;
      const key = pairKey(cwId, slot.bomItemId);
      let id = '';
      run.start(runInput(slot, specOf(slot)), {
        beforeSend: (clientRequestId) => {
          id = clientRequestId;
          return true;
        },
      });
      // `beforeSend` runs synchronously inside `start`; no id means nothing was sent.
      if (id) {
        setLaunching((prev) => new Map(prev).set(key, { id, done: false, at: Date.now() }));
      }
    }
  };

  /* ─── own pictures ─── */
  const arrivedCw = useRef(new Map<number, number>());
  const place = async (slot: MaterialSlot, media: common_MediaFull) => {
    const mediaId = media.id ?? 0;
    if (mediaId <= 0 || cwId <= 0) return;
    const key = pairKey(cwId, slot.bomItemId);
    const prev = byPair.get(key);
    const prevId = wireInt(prev?.id);
    // The previous asset is kept for undo, so a replace takes one shelf place — but no more: runs
    // in flight do not hold an own picture back.
    if (!shelfRoom) {
      showMessage(SHELF_REASON, 'error');
      return;
    }
    // The picture carries THIS slot's spec (not necessarily the selected one's).
    const spec = specOf(slot);
    const colour = colourOf(slot, spec);
    mark(key, true);
    try {
      const res = await writes.upsertAsset.mutateAsync({
        assetId: 0,
        kind: slot.family === 'hardware' ? ASSET_HARDWARE : ASSET_FABRIC,
        name: mintSlotName(band, cwName, slot.name),
        mediaId,
        note: spec.words.trim(),
        colourCode: colour?.code ?? '',
        colourHex: colour?.hex ?? '',
      });
      const assetId = wireInt(res.asset?.id);
      if (assetId > 0) {
        await binds.setBinding.mutateAsync({
          colorwayId: cwId,
          bomItemId: slot.bomItemId,
          assetId,
        });
        if (prevId !== assetId) rememberUndo(key, prevId, assetId);
      }
    } catch {
      // The write hooks already said what went wrong. A picture made for a failed binding stays on
      // the shelf: a lost response may still have committed the binding.
    } finally {
      mark(key, false);
    }
  };

  // An own picture gets its words/colour without a run: rewrite the asset with the new spec.
  const saveWords = (slot: MaterialSlot, asset: common_DesignAsset) => {
    const key = pairKey(cwId, slot.bomItemId);
    const spec = specOf(slot);
    const colour = colourOf(slot, spec);
    mark(key, true);
    writes.upsertAsset
      .mutateAsync({
        assetId: wireInt(asset.id),
        kind: asset.kind ?? '',
        name: asset.name ?? '',
        mediaId: wireInt(asset.mediaId),
        derivedFromAssetId: wireInt(asset.derivedFromAssetId),
        repeatMm: wireInt(asset.repeatMm),
        rotationDeg: wireInt(asset.rotationDeg),
        ordinal: wireInt(asset.ordinal),
        note: spec.words.trim(),
        colourCode: colour?.code ?? '',
        colourHex: colour?.hex ?? '',
      })
      .catch(() => {})
      .finally(() => mark(key, false));
  };

  const clear = (slot: MaterialSlot) => {
    const key = pairKey(cwId, slot.bomItemId);
    const prevId = wireInt(byPair.get(key)?.id);
    if (prevId <= 0) return;
    const colorwayId = cwId;
    mark(key, true);
    binds.setBinding
      .mutateAsync({ colorwayId, bomItemId: slot.bomItemId, assetId: 0 })
      .then(() => rememberUndo(key, prevId, 0))
      .catch(() => {})
      .finally(() => mark(key, false));
  };

  const undo = (slot: MaterialSlot) => {
    const key = pairKey(cwId, slot.bomItemId);
    const entry = undos.get(key);
    if (!entry || !undoLive(key, entry)) {
      forgetUndo(key);
      return;
    }
    mark(key, true);
    binds.setBinding
      .mutateAsync({ colorwayId: cwId, bomItemId: slot.bomItemId, assetId: entry.prevId })
      .then(() => forgetUndo(key))
      .catch(() => {})
      .finally(() => mark(key, false));
  };

  // One library dialog for every `replace…`: the menu clicks its hidden trigger.
  const replaceTarget = useRef<{ slot: MaterialSlot; cw: number } | null>(null);
  const replaceTrigger = useRef<HTMLButtonElement>(null);
  const replace = (slot: MaterialSlot) => {
    // Pin the colourway too: a switch while the dialog is open must not land the picture there.
    replaceTarget.current = { slot, cw: cwId };
    replaceTrigger.current?.click();
  };

  const writable = !disabled && capable && cwId > 0 && !archived;
  const fabrics = slots.filter((s) => s.family === 'fabric');
  const hardware = slots.filter((s) => s.family === 'hardware');
  const dressed = (list: MaterialSlot[]) =>
    list.filter((s) => byPair.has(pairKey(cwId, s.bomItemId))).length;

  /* ─── the panel: the selected slot's spec ─── */
  const selKey = selected ? pairKey(cwId, selected.bomItemId) : '';
  const selAsset = selected && cwId > 0 ? byPair.get(selKey) : undefined;
  const selSpec = selected ? specOf(selected) : null;
  const selColour = selected && selSpec ? colourOf(selected, selSpec) : null;
  const selGate: Gate = selected ? cellGate(selected) : { ok: false, reason: 'no slot' };
  const selSeed = selected ? seedOf(selected) : null;
  // `save words` only when the filled slot's spec moved away from what the asset says.
  const wordsChanged =
    !!selAsset &&
    !!selSpec &&
    !!selSeed &&
    (selSpec.words.trim() !== selSeed.words.trim() ||
      selSpec.colourCode.trim() !== selSeed.colourCode.trim());
  // `use own picture`: the library dialog for the SELECTED slot; placed with its spec.
  const ownGate: Gate = !selected
    ? { ok: false, reason: 'no slot' }
    : !writable
      ? !baseGate.ok
        ? baseGate
        : { ok: false, reason: READ_ONLY_RUN_REASON }
      : liveByPair.has(selKey) || launching.has(selKey) || saving.has(selKey)
        ? { ok: false, reason: 'being made — it lands in the cell by itself' }
        : !shelfRoom
          ? { ok: false, reason: SHELF_REASON }
          : { ok: true };
  const selName = selected ? selected.name.toUpperCase() : '';
  const verbName = selName.length > 24 ? `${selName.slice(0, 23)}…` : selName;
  const emptyN = emptyRunnable.length;

  /* ─── `custom ▸`: the chip rows fold behind FLAT's door (owner 04.10: «это все скрывается как в
     flat custom»). Closed by default; open state resets when the selected slot changes family
     (label · hardware · fabric — fabric has no chips, so no door). ─── */
  const chipFamily = !selected ? '' : isLabelSlot(selected) ? 'label' : selected.family;
  const chipRows = chipRowsOf(chipFamily);
  const [customState, setCustomState] = useState<{ family: string; open: boolean }>({
    family: chipFamily,
    open: false,
  });
  const customOpen = customState.family === chipFamily && customState.open;
  const litWords =
    selSpec && chipRows
      ? chipRows.flatMap((r) => r.words.filter((w) => hasWord(selSpec.words, w)))
      : [];

  /* ─── cancel: a making cell's corner, and `cancel all` while ≥2 runs of this colourway live ─── */
  const cancelRun = useCancelRun(techCardId);
  const liveHere =
    cwId > 0
      ? slots
          .map((s) => liveByPair.get(pairKey(cwId, s.bomItemId)))
          .filter((r): r is common_DesignRun => !!r && !isCancelling(r))
      : [];

  /* ─── batch fill (round 6 · X4): a block-level action in the MATERIALS header aside. The door
     `fill N empty` never fires on one click — it turns into `make N pictures · yes · no`; hover
     or focus on it (and the asking itself) marks exactly the cells it will make. ─── */
  const [confirmAll, setConfirmAll] = useState(false);
  const [fillHover, setFillHover] = useState(false);
  const fillMarks = new Set(fillHover || confirmAll ? emptyBatch.map((s) => s.bomItemId) : []);
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirmAll) return;
    yesRef.current?.focus();
    const t = setTimeout(() => setConfirmAll(false), 5_000);
    return () => clearTimeout(t);
  }, [confirmAll]);

  const fillLabel =
    emptyBatch.length < emptyN
      ? `fill ${emptyBatch.length} of ${emptyN} empty`
      : `fill ${emptyN} empty`;
  const dot = (
    <Text size='micro' variant='label' component='span'>
      ·
    </Text>
  );
  const batchAside = (
    <span className='flex flex-wrap items-center justify-end gap-1.5' data-fh-batch=''>
      <Text size='micro' variant='label' component='span' data-fh-filled=''>
        {dressed(slots)} of {slots.length} filled
      </Text>
      {liveHere.length > 0 && (
        <>
          {dot}
          <Text
            size='micro'
            component='span'
            className='uppercase'
            data-fh-making={liveHere.length}
          >
            making {liveHere.length}
          </Text>
          {liveHere.length >= 2 && (
            <>
              {dot}
              <Button
                variant='underline'
                size='xs'
                title='stop every run of this colourway — calls already sent cannot be recalled; answers that still arrive are recorded and paid for'
                onClick={() => liveHere.forEach((r) => cancelRun(r.id ?? 0))}
                data-fh-cancel-all={liveHere.length}
              >
                cancel all
              </Button>
            </>
          )}
        </>
      )}
      {emptyN > 0 && confirmAll && (
        <span
          className='flex items-center gap-1.5'
          data-fh-all-confirm={emptyBatch.length}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setConfirmAll(false);
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setConfirmAll(false);
          }}
        >
          {dot}
          <Text size='micro' component='span' className='uppercase'>
            make {emptyBatch.length} picture{emptyBatch.length === 1 ? '' : 's'}
          </Text>
          {dot}
          <Button
            ref={yesRef}
            variant='underline'
            size='xs'
            disabled={!emptyGate.ok}
            onClick={() => {
              setConfirmAll(false);
              setFillHover(false);
              generate(emptyBatch);
            }}
            data-fh-all-yes=''
          >
            yes
          </Button>
          {dot}
          <Button
            variant='underline'
            size='xs'
            onClick={() => setConfirmAll(false)}
            data-fh-all-no=''
          >
            no
          </Button>
        </span>
      )}
      {emptyN > 0 && !confirmAll && (
        <>
          {dot}
          <Button
            variant='underline'
            size='xs'
            disabled={!emptyGate.ok}
            title={
              !emptyGate.ok
                ? emptyGate.reason
                : emptyBatch.length < emptyN
                  ? `shelf room for ${emptyBatch.length} of ${emptyN}`
                  : 'makes every empty slot from its own words — fabrics in their colour, hardware without one'
            }
            onPointerEnter={() => setFillHover(true)}
            onPointerLeave={() => setFillHover(false)}
            onFocus={() => setFillHover(true)}
            onBlur={() => setFillHover(false)}
            onClick={() => {
              // The marks stay on through `confirmAll`; the door itself unmounts.
              setFillHover(false);
              setConfirmAll(true);
            }}
            data-fh-all-empty={emptyBatch.length}
          >
            {fillLabel}
          </Button>
        </>
      )}
    </span>
  );

  const group = (title: string, list: MaterialSlot[]) =>
    list.length === 0 ? null : (
      <div className='min-w-0' data-fh-group={title}>
        <GroupLabel
          flush
          action={
            <HeaderCount
              n={dressed(list)}
              total={list.length}
              noun={title === 'fabrics' ? 'fabric' : title}
              plural={title}
            />
          }
        >
          {title}
        </GroupLabel>
        <div className='flex flex-wrap items-start gap-2.5 pt-1.5'>
          {list.map((slot) => {
            const key = pairKey(cwId, slot.bomItemId);
            const gate = cellGate(slot);
            const current = cwId > 0 ? byPair.get(key) : undefined;
            const undoEntry = undos.get(key);
            const canUndo = !!undoEntry && undoLive(key, undoEntry);
            const isSelected = selected?.bomItemId === slot.bomItemId;
            return (
              <div
                key={slot.bomItemId}
                style={BENCH_CELL_STYLE}
                className='flex min-w-0 flex-col items-start gap-1'
                data-fh-slot={slot.bomItemId}
                data-fh-selected={isSelected ? '' : undefined}
              >
                {/* The cell is a SELECTOR only: click (captured) or Enter/Space selects the slot.
                    It never opens the library — `use own picture` in the panel does that. */}
                <IntakeCell
                  marked={fillMarks.has(slot.bomItemId)}
                  enabled={writable && !saving.has(key)}
                  purpose={`design · ${slot.name}`}
                  onArrive={() => {
                    pick(slot);
                    arrivedCw.current.set(slot.bomItemId, cwId);
                  }}
                  onMedia={(media) => {
                    // The upload may finish after a colourway switch: bind only to the one it arrived on.
                    const at = arrivedCw.current.get(slot.bomItemId);
                    arrivedCw.current.delete(slot.bomItemId);
                    if (at !== undefined && at !== cwId) {
                      showMessage('the colourway changed while the picture uploaded · drop it again', 'error');
                      return;
                    }
                    pick(slot);
                    void place(slot, media);
                  }}
                  role='button'
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`select ${slot.name}`}
                  data-fh-cell={slot.bomItemId}
                  className='group w-full min-w-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                  onClickCapture={() => pick(slot)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    pick(slot);
                  }}
                >
                  <SlotCell
                    slot={slot}
                    asset={current}
                    selected={isSelected}
                    liveRun={cwId > 0 ? liveByPair.get(key) : undefined}
                    saving={saving.has(key)}
                    launching={launching.has(key)}
                    writable={writable}
                    full={!shelfRoom}
                    fullReason={SHELF_REASON}
                    onUpload={() => replace(slot)}
                    generateGate={gate}
                    onPick={() => pick(slot)}
                    liveCorner={
                      cwId > 0 && liveByPair.get(key) ? (
                        <RunCancelCorner
                          techCardId={techCardId}
                          run={liveByPair.get(key) as common_DesignRun}
                          disabled={disabled || !speaks}
                        />
                      ) : null
                    }
                    onReplace={() => replace(slot)}
                    onGenerate={() => {
                      pick(slot);
                      generate([slot]);
                    }}
                    onClear={() => clear(slot)}
                  />
                </IntakeCell>
                {canUndo && (
                  <Button
                    variant='underline'
                    size='xs'
                    disabled={saving.has(key)}
                    title='restore the previous picture'
                    onClick={() => undo(slot)}
                    data-fh-undo={slot.bomItemId}
                  >
                    undo
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );

  return (
    <Section
      id='design-pattern'
      title='materials'
      question={cwName ? `· ${cwName}` : '· pick a colourway'}
      action={slots.length > 0 && cwId > 0 ? batchAside : undefined}
    >
      {slots.length === 0 ? (
        <EmptyState
          action={
            <Button
              variant='underline'
              size='xs'
              className='text-labelColor hover:text-textColor'
              onClick={() => onGoStep('mood')}
            >
              moodboard ›
            </Button>
          }
        >
          no materials yet
        </EmptyState>
      ) : (
        <>
          {group('fabrics', fabrics)}
          {group('hardware', hardware)}

          {selected && selSpec && (
            <div data-fh-generate={selGate.ok ? 'live' : 'inert'} data-fh-for={selected.bomItemId}>
              <GroupLabel
                action={
                  <Text size='micro' variant='label' component='span'>
                    {isLabelSlot(selected) ? 'label' : selected.family}
                  </Text>
                }
              >
                generate ·{' '}
                <span className='text-textColor' data-fh-subject=''>
                  {selected.name}
                </span>
              </GroupLabel>
              <SpecPanel
                key={selKey}
                slot={selected}
                spec={selSpec}
                colour={selColour}
                disabled={!writable}
                colorwayId={cwId}
                colorwayName={cwName}
                ownPantone={ownPantone}
                onChange={(next) => setSpec(selected, next)}
              />
              {!selGate.ok && (
                <Text
                  size='micro'
                  variant='label'
                  component='p'
                  className='mt-2 normal-case'
                  data-fh-generate-reason=''
                >
                  {selGate.reason}
                </Text>
              )}
              <GenerateRow
                gate={selGate}
                pending={run.isPending}
                label={`GENERATE ${verbName}`}
                onGenerate={() => generate([selected])}
                trailing={
                  <MaybeCustom
                    rows={chipRows}
                    open={customOpen}
                    onToggle={() => setCustomState({ family: chipFamily, open: !customOpen })}
                    lit={litWords}
                    spec={selSpec}
                    disabled={!writable}
                    onChange={(next) => setSpec(selected, next)}
                  >
                    <span className='flex flex-wrap items-center gap-2'>
                      {ownGate.ok ? (
                        <Button
                          variant='secondary'
                          size='sm'
                          title='pick or upload a picture for this slot — it takes these words and colour'
                          onClick={() => replace(selected)}
                          data-fh-own-picture=''
                        >
                          use own picture
                        </Button>
                      ) : (
                        <>
                          <InertDoor label='use own picture' reason={ownGate.reason} size='sm' />
                          {/* Said once: the GENERATE reason line above already says the same. */}
                          {(selGate.ok || selGate.reason !== ownGate.reason) && (
                            <Text
                              size='micro'
                              variant='label'
                              component='span'
                              className='normal-case'
                              data-fh-own-reason=''
                            >
                              {ownGate.reason}
                            </Text>
                          )}
                        </>
                      )}
                      <Money data-probe='run-price' />
                      {wordsChanged && selAsset && writable && (
                        <Button
                          variant='underline'
                          size='xs'
                          disabled={saving.has(selKey)}
                          title='writes these words and colour onto the picture in the cell'
                          onClick={() => saveWords(selected, selAsset)}
                          data-fh-save-words=''
                        >
                          save words
                        </Button>
                      )}
                    </span>
                  </MaybeCustom>
                }
              />
            </div>
          )}

          <RunRefusal
            refusal={refusal}
            onDismiss={() => {
              setShownRefusal(null);
              run.dismissRefusal();
            }}
          />
        </>
      )}

      <MediaSelector
        label='replace'
        purpose='design · a picture for this slot'
        aspectRatio={['Custom']}
        allowMultiple={false}
        showVideos={false}
        saveSelectedMedia={(media) => {
          const target = replaceTarget.current;
          const first = media[0];
          if (!target || !first?.id) return;
          if (target.cw !== cwId) {
            showMessage('the colourway changed while the library was open · pick again', 'error');
            return;
          }
          void place(target.slot, first);
        }}
        trigger={<button ref={replaceTrigger} type='button' hidden aria-hidden tabIndex={-1} />}
      />
    </Section>
  );
}

type UndoEntry = { prevId: number; setTo: number };

/** A slot's spec: colour (Pantone code, '' = none), what it is made of, its input pictures. */
type Spec = {
  colourCode: string;
  words: string;
  pictures: common_MediaFull[];
  /** Label only: up to `LABEL_REFS_MAX` reference pictures of a label, beside the logo. */
  refs?: common_MediaFull[];
};

/** A label takes its logo plus this many reference pictures (≤ 4 inputs in all). */
const LABEL_REFS_MAX = 3;

const sameWord = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Non-empty parts joined by ` · `, each said once. */
function uniqueWords(parts: string[]): string {
  const out: string[] = [];
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    if (!out.some((o) => sameWord(o, p))) out.push(p);
  }
  return out.join(' · ');
}

/** Hardware material words: a chip toggles its word in the `, `-separated list. */
const MATERIAL_WORDS = ['horn', 'metal', 'brass', 'resin', 'plastic', 'corozo', 'wood', 'woven'];
const wordList = (words: string) =>
  words
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
const hasWord = (words: string, word: string) => wordList(words).some((w) => sameWord(w, word));
const toggleWord = (words: string, word: string): string =>
  hasWord(words, word)
    ? wordList(words)
        .filter((w) => !sameWord(w, word))
        .join(', ')
    : [...wordList(words), word].join(', ');

const INPUT_CELL = 'w-24 shrink-0';

/** Empty caption line under a picture: keeps it the colour tile's height. */
function InputCaption(): JSX.Element {
  return (
    <Text size='micro' variant='label' component='span' className='block h-4 w-full truncate'>
      {' '}
    </Text>
  );
}

/** The selected slot's spec: colour · pictures in one row, then its words. */
function SpecPanel({
  slot,
  spec,
  colour,
  disabled,
  colorwayId,
  colorwayName,
  ownPantone,
  onChange,
}: {
  slot: MaterialSlot;
  spec: Spec;
  colour: SwatchColour | null;
  disabled?: boolean;
  colorwayId: number;
  colorwayName: string;
  ownPantone: string;
  onChange: (spec: Spec) => void;
}): JSX.Element {
  const { showMessage } = useSnackBarStore();
  const hardware = slot.family === 'hardware';
  const label = isLabelSlot(slot);
  const max = hardware && !label ? REFS_MAX : 1;
  const pictures = spec.pictures;
  const room = Math.max(0, max - pictures.length);
  const add = (incoming: common_MediaFull[]) => {
    const have = new Set(pictures.map((m) => m.id ?? 0));
    const fresh = incoming.filter((m) => (m.id ?? 0) > 0 && !have.has(m.id ?? 0));
    const kept = fresh.slice(0, room);
    if (fresh.length > kept.length) {
      showMessage(
        `took ${kept.length} of ${fresh.length}: this slot holds ${max} at most`,
        'error',
      );
    }
    if (kept.length > 0) onChange({ ...spec, pictures: [...pictures, ...kept] });
  };
  const refs = label ? spec.refs ?? [] : [];
  const refRoom = label ? Math.max(0, LABEL_REFS_MAX - refs.length) : 0;
  const addRefs = (incoming: common_MediaFull[]) => {
    const have = new Set(refs.map((m) => m.id ?? 0));
    const fresh = incoming.filter((m) => (m.id ?? 0) > 0 && !have.has(m.id ?? 0));
    const kept = fresh.slice(0, refRoom);
    if (fresh.length > kept.length) {
      showMessage(
        `took ${kept.length} of ${fresh.length}: a label holds ${LABEL_REFS_MAX} references at most`,
        'error',
      );
    }
    if (kept.length > 0) onChange({ ...spec, refs: [...refs, ...kept] });
  };

  return (
    <div className='flex flex-col gap-2 pt-1.5' data-fh-inputs=''>
      <div className='flex flex-wrap items-start gap-2.5'>
        <div className={INPUT_CELL} data-fh-colour={colour?.code || colour?.hex || 'none'}>
          <PantonePicker
            name={`fh-colour-${colorwayId}-${slot.bomItemId}`}
            value={spec.colourCode}
            label={colour?.code || colour?.hex || (hardware ? 'no colour' : '+ colour')}
            swatchHex={colour?.hex}
            suggested={
              ownPantone ? [{ code: ownPantone, label: `${colorwayName} · colourway` }] : []
            }
            disabled={disabled}
            tile
            onPick={(code) => onChange({ ...spec, colourCode: code.trim() })}
          />
        </div>
        {pictures.map((media, index) => (
          <div key={media.id ?? index} className={INPUT_CELL} data-fh-look={index + 1}>
            <PictureSlotFilled
              media={media}
              alt={label ? `${slot.name} logo` : `${slot.name} picture ${index + 1}`}
              disabled={disabled}
              onRemove={() =>
                onChange({ ...spec, pictures: pictures.filter((_, at) => at !== index) })
              }
            />
            <InputCaption />
          </div>
        ))}
        {room > 0 && (
          <div className={INPUT_CELL} data-fh-look-door=''>
            <PictureSlotEmpty
              purpose={label ? `design · ${slot.name} · logo` : `design · ${slot.name}`}
              label={label ? '+ logo' : undefined}
              multiple={room > 1}
              limit={room}
              disabled={disabled}
              onSelect={add}
            />
            <InputCaption />
          </div>
        )}
        {refs.map((media, index) => (
          <div key={media.id ?? index} className={INPUT_CELL} data-fh-ref={index + 1}>
            <PictureSlotFilled
              media={media}
              alt={`${slot.name} reference ${index + 1}`}
              disabled={disabled}
              onRemove={() => onChange({ ...spec, refs: refs.filter((_, at) => at !== index) })}
            />
            <InputCaption />
          </div>
        ))}
        {refRoom > 0 && (
          <div className={INPUT_CELL} data-fh-ref-door=''>
            <PictureSlotEmpty
              purpose={`design · ${slot.name} · reference`}
              label='+ reference'
              multiple={refRoom > 1}
              limit={refRoom}
              disabled={disabled}
              onSelect={addRefs}
            />
            <InputCaption />
          </div>
        )}
      </div>

      {/* Words: label above, a real (vertical-resize) textarea capped in width, chips under it. */}
      <div className='flex max-w-xl flex-col gap-1'>
        <Text
          size='micro'
          variant='uppercase'
          tracking='label'
          component='label'
          htmlFor={`fh-words-${slot.bomItemId}`}
          className='text-labelColor'
        >
          {label ? 'label' : hardware ? 'material' : 'cloth'}
        </Text>
        <Textarea
          id={`fh-words-${slot.bomItemId}`}
          name={`fh-words-${slot.bomItemId}`}
          value={spec.words}
          maxLength={SLOT_WORDS_MAX}
          disabled={disabled}
          rows={2}
          autoGrow={false}
          placeholder={
            label
              ? 'woven, centre back neck'
              : hardware
                ? 'horn, black'
                : '100% cotton twill, 300 gsm'
          }
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            onChange({ ...spec, words: e.target.value })
          }
          style={{ minHeight: 44 }}
          className='resize-y'
          data-fh-words=''
        />
      </div>
    </div>
  );
}

type ChipRowSpec = { lead?: string; words: readonly string[] };

/** The chip rows a slot family offers; fabric has none (→ no `custom ▸` door). */
function chipRowsOf(family: string): ChipRowSpec[] | null {
  if (family === 'label')
    return [
      { lead: 'look', words: LABEL_LOOKS },
      { lead: 'sewn at', words: LABEL_PLACES },
    ];
  if (family === 'hardware') return [{ words: MATERIAL_WORDS }];
  return null;
}

/**
 * The run row's tail, wrapped in FLAT's `custom ▸` door when the slot has chip rows: the door
 * stands right after GENERATE, `after` keeps the row's own doors, and open draws the chip rows on
 * their own line under the run row. `custom •` while any chip word sits in the words.
 */
function MaybeCustom({
  rows,
  open,
  onToggle,
  lit,
  spec,
  disabled,
  onChange,
  children,
}: {
  rows: ChipRowSpec[] | null;
  open: boolean;
  onToggle: () => void;
  lit: string[];
  spec: Spec | null;
  disabled?: boolean;
  onChange: (spec: Spec) => void;
  children: React.ReactNode;
}): JSX.Element {
  if (!rows || !spec) return <>{children}</>;
  return (
    <FlatCustom
      open={open}
      onToggle={onToggle}
      modified={lit.length > 0}
      summary={lit.join(', ')}
      closedTitle='words to tick into the description'
      after={children}
    >
      <div className='flex basis-full flex-col gap-2' data-fh-chips=''>
        {rows.map((r) => (
          <WordChips
            key={r.lead ?? 'words'}
            lead={r.lead}
            words={r.words}
            spec={spec}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </div>
    </FlatCustom>
  );
}

/** A chip row toggling words in the spec's `, `-list; `lead` names the row on its left. */
function WordChips({
  lead,
  words,
  spec,
  disabled,
  onChange,
}: {
  lead?: string;
  words: readonly string[];
  spec: Spec;
  disabled?: boolean;
  onChange: (spec: Spec) => void;
}): JSX.Element {
  const chips = (
    <ChipRow className={lead ? 'min-w-0 flex-1' : 'max-w-xl'}>
      {words.map((word) => (
        <Chip
          key={word}
          selected={hasWord(spec.words, word)}
          pressed={hasWord(spec.words, word)}
          disabled={disabled}
          onClick={() => onChange({ ...spec, words: toggleWord(spec.words, word) })}
          data-fh-chip={word}
        >
          {word}
        </Chip>
      ))}
    </ChipRow>
  );
  if (!lead) return chips;
  // The lead sits beside the row, so a wrapped chip line stays indented under the chips.
  return (
    <div className='flex max-w-xl items-start gap-1'>
      <Text size='micro' variant='label' component='span' className='w-16 shrink-0 pt-1'>
        {lead}
      </Text>
      {chips}
    </div>
  );
}

/** The live-run word with its clock — the `instead` face of a pending cell. */
function LiveWord({ startedAt, word }: { startedAt?: string; word: string }): JSX.Element {
  const elapsed = useElapsed(startedAt);
  return (
    <span className='flex flex-col items-center gap-0.5'>
      <Text size='micro' variant='label' component='span'>
        {word}
      </Text>
      {startedAt !== undefined && (
        <Text size='nano' variant='label' component='span'>
          {elapsed || '0:00'}
        </Text>
      )}
    </span>
  );
}

function SlotCell({
  slot,
  asset,
  selected,
  liveRun,
  saving,
  launching,
  writable,
  full,
  fullReason,
  generateGate,
  onPick,
  liveCorner,
  onReplace,
  onGenerate,
  onClear,
  onUpload,
}: {
  slot: MaterialSlot;
  asset?: common_DesignAsset;
  selected: boolean;
  liveRun?: common_DesignRun;
  saving: boolean;
  launching: boolean;
  writable: boolean;
  full: boolean;
  fullReason: string;
  generateGate: Gate;
  onPick: () => void;
  /** The live run's cancel corner (the studio's own, `RunCancelCorner`). */
  liveCorner?: React.ReactNode;
  onReplace: () => void;
  onGenerate: () => void;
  onClear: () => void;
  /** Opens the library dialog for THIS cell (empty face's `upload` word). */
  onUpload: () => void;
}): JSX.Element {
  const cap = (
    <SlotCap
      label={slot.name}
      title={[slot.name, slot.purposeLabel, slot.detail].filter(Boolean).join(' · ')}
      strong={selected}
      quiet
      trailing={
        slot.purposeLabel ? (
          <Text size='nano' variant='label' component='span' className='ml-auto min-w-0 truncate'>
            {slot.purposeLabel}
          </Text>
        ) : null
      }
    />
  );

  if (liveRun || saving || launching) {
    return (
      <PlaceOrDrawCell
        label={slot.name}
        aspect={BENCH_FRAME_ASPECT}
        purpose=''
        selected={selected}
        className={HOVER_INK}
        // The backdrop slot makes the frame `relative`: the cancel corner sits in it.
        backdrop={liveRun ? liveCorner : undefined}
        instead={
          liveRun ? (
            <LiveWord startedAt={liveRun.startedAt ?? liveRun.createdAt ?? ''} word='making…' />
          ) : launching ? (
            <LiveWord word='making…' />
          ) : (
            <LiveWord word='saving…' />
          )
        }
        cap={cap}
        data-fh-pending={slot.bomItemId}
      />
    );
  }

  if (asset) {
    return (
      <FilledCell
        slot={slot}
        asset={asset}
        selected={selected}
        cap={cap}
        writable={writable}
        full={full}
        fullReason={fullReason}
        generateGate={generateGate}
        onPick={onPick}
        onReplace={onReplace}
        onGenerate={onGenerate}
        onClear={onClear}
      />
    );
  }

  // Empty face = the pictogram only: the cell is a selector, not an upload button.
  return (
    <PlaceOrDrawCell
      label={slot.name}
      aspect={BENCH_FRAME_ASPECT}
      purpose=''
      selected={selected}
      className={HOVER_INK}
      instead={
        writable && !full ? (
          // The cell's own capture click selects first; this word then opens the library.
          <Button
            variant='underline'
            size='xs'
            className={cn(
              'relative z-10 mb-1 self-end',
              !selected && 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
            )}
            title='pick or upload a picture for this slot'
            onClick={onUpload}
            data-fh-upload={slot.bomItemId}
          >
            upload
          </Button>
        ) : (
          <span />
        )
      }
      backdrop={<TrimPictogramBackdrop slot={slot} />}
      cap={cap}
      data-fh-empty={slot.bomItemId}
    />
  );
}

/**
 * A slot cell's selector that also takes a dropped or pasted image (⌘V while hovered/focused): the
 * same intake dialog as every media slot, then the picture is placed in THIS slot. Click selects.
 */
function IntakeCell({
  enabled,
  purpose,
  onMedia,
  onArrive,
  marked,
  className,
  children,
  ...rest
}: {
  /** Batch-fill preview: this cell is one the `fill N empty` door will make. */
  marked?: boolean;
  enabled: boolean;
  purpose: string;
  onMedia: (media: common_MediaFull) => void;
  /** A file was dropped or pasted onto this cell: select it before the intake dialog opens. */
  onArrive: () => void;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
    [k: `data-${string}`]: unknown;
  }): JSX.Element {
  const intake = useMediaIntake({
    enabled,
    accept: 'image',
    limit: 1,
    purpose,
    onMedia: (media) => {
      const first = media[0];
      if (first?.id) onMedia(first);
    },
  });
  // ⌘V goes to the hovered/focused cell (`hot`); the cell is selected the moment it arrives.
  const arrive = useRef(onArrive);
  arrive.current = onArrive;
  const hot = enabled && intake.hot;
  useEffect(() => {
    if (!hot) return;
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.items ?? []).filter((i) => i.kind === 'file');
      if (files.length > 0) arrive.current();
    };
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, [hot]);
  return (
    <>
      <div
        {...rest}
        {...intake.regionHandlers}
        onDrop={(e) => {
          if (enabled && Array.from(e.dataTransfer.types).includes('Files')) onArrive();
          intake.regionHandlers.onDrop(e);
        }}
        data-fh-dragging={intake.dragging ? '' : undefined}
        data-fh-fill-mark={marked ? '' : undefined}
        className={cn(
          className,
          marked &&
            'outline-1 outline-offset-2 outline-textColor outline-dashed [&_[data-bench-cap]_span]:text-textColor',
          intake.dragging && 'outline outline-2 outline-offset-2 outline-textColor',
        )}
      >
        {children}
      </div>
      {intake.dialog}
    </>
  );
}

/** Hover of the enclosing selector (`group`): the 1px frame goes solid ink. */
const HOVER_INK = 'cursor-pointer group-hover:border-solid group-hover:border-textColor';

/** A dressed cell: surface click selects (double click zooms); `zoom` also lives in the menu. */
function FilledCell({
  slot,
  asset,
  selected,
  cap,
  writable,
  full,
  fullReason,
  generateGate,
  onPick,
  onReplace,
  onGenerate,
  onClear,
}: {
  slot: MaterialSlot;
  asset: common_DesignAsset;
  selected: boolean;
  cap: React.ReactNode;
  writable: boolean;
  full: boolean;
  fullReason: string;
  generateGate: Gate;
  onPick: () => void;
  onReplace: () => void;
  onGenerate: () => void;
  onClear: () => void;
}): JSX.Element {
  const url = assetFull(asset);
  const label = assetLabel(asset);
  const hardware = slot.family === 'hardware';
  const items = useMemo(
    () =>
      url
        ? [{ src: url, thumbnail: assetThumb(asset) || url, type: 'image' as const, alt: label }]
        : [],
    [url, asset, label],
  );
  const zoomGroup = useGalleryGroup(items);
  const openGroup = useOpenGalleryGroup();
  return (
    <div
      ref={zoomGroup.anchorRef}
      className={cn(
        'group flex w-full min-w-0 flex-col overflow-hidden border border-textColor',
        selected && 'outline outline-2 -outline-offset-2 outline-textColor',
      )}
    >
      <PictureTile
        url={url}
        alt={label}
        aspect={BENCH_FRAME_ASPECT}
        fit={hardware ? 'contain' : 'cover'}
        ground={hardware ? 'neutral' : undefined}
        className='w-full border-0'
        galleryGroup={url ? { key: zoomGroup.key, index: 0 } : undefined}
        onOpen={onPick}
        menu={{
          label: 'more',
          ariaLabel: `more for ${slot.name}`,
          items: [
            { value: 'zoom', label: 'zoom', disabled: !url },
            ...(writable
              ? [
                  {
                    value: 'replace',
                    label: 'replace…',
                    disabled: full,
                    title: full ? fullReason : undefined,
                  },
                  {
                    value: 'generate',
                    label: 'generate',
                    disabled: !generateGate.ok,
                    title: generateGate.ok ? undefined : generateGate.reason,
                  },
                  { value: 'clear', label: 'clear' },
                ]
              : []),
          ],
          onPick: (v) =>
            v === 'zoom'
              ? openGroup(zoomGroup.key, 0)
              : v === 'replace'
                ? onReplace()
                : v === 'generate'
                  ? onGenerate()
                  : onClear(),
          'data-menu': `fh:${slot.bomItemId}`,
        }}
      />
      {cap}
    </div>
  );
}
