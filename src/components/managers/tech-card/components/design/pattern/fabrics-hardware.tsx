import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignAsset,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import { adminService } from 'api/api';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useMediaIntake } from 'components/managers/media/utils/useMediaIntake';
import { PantonePicker } from 'components/managers/tech-card/components/pantone-picker';
import {
  ensurePantoneLibrary,
  pantoneLibraryState,
  pantoneVersion,
  subscribePantone,
} from 'components/managers/tech-card/components/pantone-swatches';
import { useMutationState, useQueryClient } from '@tanstack/react-query';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Section } from 'ui/components/section';
import { HeaderCount } from 'ui/components/section-header';
import Text from 'ui/components/text';
import Select from 'ui/components/select';
import Textarea from 'ui/components/text-area';

import { kindLabel } from '../../bom-kind';
import { bornBomLine, patchBomLine } from '../../form-writers';
import type { TechCardFormData } from '../../schema';
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
import { BENCH_FRAME_ASPECT, FLAT_CELL_STYLE, InertDoor, SlotCap } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { flushRefusalSentence, useTechCardAutosave } from '../autosave-contract';
import { archivedRef, colorwayLabel } from '../colorway-picker';
import { ColourwayStrip } from '../colourway-strip';
import { EmptyState, Money, PlaceOrDrawCell } from '../core';
import { FlatCustom } from '../flat-custom';
import { openStepOf, type StepId } from '../core/chain';
import { useElapsed, useRunPolling } from '../generation';
import { RunCancelCorner, useCancelRun } from '../generation/live-tiles';
import { isCancelling, isRunLive, runStatus } from '../generation/run-state';
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
import { designKeys } from '../use-design-band';
import { selectVisiblePictures } from '../visibility';
import { patternRuns } from './model';
import {
  ARTWORK_SECTION,
  ARTWORK_TECHNIQUES,
  artworkKindOf,
  artworkSlotsOf,
  artworkTechniqueOf,
  nextArtworkName,
  isArtworkSlot,
  NO_BINDINGS_REASON,
  PANTONE_LOADING_REASON,
  READ_ONLY_RUN_REASON,
  READ_ONLY_SHELF_REASON,
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
 *   · `materials` — one cell per material slot; ONE slot is selected, and the `generate` block
 *     under MATERIALS is that slot's spec (colour · pictures · dropdowns · words). GENERATE makes that slot;
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
  /** The composition label's logo (care label override): a label slot seeds it as its logo. */
  labelLogo?: common_MediaFull;
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
  labelLogo,
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
        labelLogo={labelLogo}
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
  labelLogo,
  onGoStep,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  colorway?: common_AdminColorwayRef;
  slots: MaterialSlot[];
  labelSeeds: ReadonlyMap<number, LabelSeed>;
  labelLogo?: common_MediaFull;
  onGoStep: (step: StepId) => void;
}): JSX.Element {
  const { showMessage } = useSnackBarStore();
  const speaks = serverSpeaksDesign();
  const capable = bindingsSpoken(band);
  const run = useStartDesignRun(techCardId, { scope: RUN_SCOPE });
  const writes = useAssetWrites(techCardId);
  const binds = useAssetBindingWrites(techCardId);
  // The card form (null outside one): `+ artwork` writes a DECORATION line into `bomItems`.
  const form = useFormContext<TechCardFormData>() as ReturnType<
    typeof useFormContext<TechCardFormData>
  > | null;
  const autosave = useTechCardAutosave();

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
    // A label's logo: the composition label's own, when it has one and it is a raster picture
    // (an SVG/PDF cannot be sent to the image model; a raster logo can still be added by hand).
    const logo =
      labelLogo && (labelLogo.id ?? 0) > 0 && isLabelSlot(slot) && isRasterPicture(labelLogo)
        ? [labelLogo]
        : [];
    const asset = cwId > 0 ? byPair.get(pairKey(cwId, slot.bomItemId)) : undefined;
    if (asset) {
      const code = (asset.colourCode ?? '').trim();
      return {
        colourCode: code || (fabric ? ownPantone : ''),
        words: noteWords(asset),
        pictures: logo,
      };
    }
    if (fabric) return { colourCode: ownPantone, words: slot.detail, pictures: [] };
    // Artwork: the technique the line was born with (its BOM spec); no width words (round 7).
    if (isArtworkSlot(slot)) return { colourCode: '', words: slot.detail, pictures: [] };
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
        pictures: logo,
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
  // Asset ids whose `save words` is in flight: the cut-out swap waits for them (one writer per asset).
  const [wordsSaving, setWordsSaving] = useState<ReadonlySet<number>>(new Set());
  const markWords = (assetId: number, on: boolean) =>
    setWordsSaving((prev) => {
      const next = new Set(prev);
      if (on) next.add(assetId);
      else next.delete(assetId);
      return next;
    });
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

  /* ─── born artworks (owner 04.10): a `+ artwork` line is a cell and selectable at once, before
     the autosave gives it an id. Until then it is a PENDING slot (negative id, never sent): its
     cell's halves and GENERATE are inert with the reason below. ─── */
  const [bornState, setBornState] = useState<{ card: number; rows: BornLine[] }>({
    card: techCardId,
    rows: [],
  });
  const bornSeq = useRef(0);
  const bornRows = bornState.card === techCardId ? bornState.rows : [];
  const landedKeys = new Set(slots.filter((s) => s.bomItemId > 0).map((s) => s.lineKey));
  const formKeys = form
    ? new Set((form.getValues('bomItems') ?? []).map((b) => (b.lineKey ?? '').trim()))
    : null;
  const pendingSlots: MaterialSlot[] = bornRows
    .filter((r) => !landedKeys.has(r.lineKey) && (!formKeys || formKeys.has(r.lineKey)))
    .map((r) => ({
      bomItemId: r.seq,
      lineKey: r.lineKey,
      name: r.name,
      kind: artworkKindOf(r.technique),
      purpose: '',
      purposeLabel: kindLabel(artworkKindOf(r.technique)) ?? '',
      section: ARTWORK_SECTION,
      detail: r.technique,
      words: [r.name, r.technique].filter(Boolean).join(' · '),
      family: 'hardware',
    }));
  const artworkCells = [...artworkSlotsOf(slots), ...pendingSlots];
  const bornReason =
    autosave.status === 'invalid' ||
    autosave.status === 'error' ||
    autosave.status === 'conflict' ||
    autosave.status === 'needs-confirm'
      ? `not saved yet — ${flushRefusalSentence(autosave.status, autosave.errorsCount, autosave.refusal)}`
      : 'saving…';

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
    if (slot.bomItemId <= 0) return { ok: false, reason: bornReason };
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
  // `lineKey`: a born artwork picked before its id landed — it resolves to the saved slot once
  // it has one, so the selection rides through the autosave without an effect.
  const [selectedState, setSelectedState] = useState<{
    card: number;
    bomItemId: number;
    lineKey?: string;
  }>({
    card: techCardId,
    bomItemId: 0,
  });
  const pickedId = selectedState.card === techCardId ? selectedState.bomItemId : 0;
  const pickedLine = selectedState.card === techCardId ? selectedState.lineKey ?? '' : '';
  const selected =
    (pickedLine
      ? slots.find((s) => s.bomItemId > 0 && s.lineKey === pickedLine) ??
        pendingSlots.find((s) => s.lineKey === pickedLine)
      : undefined) ??
    slots.find((s) => s.bomItemId === pickedId) ??
    slots.find((s) => !byPair.has(pairKey(cwId, s.bomItemId))) ??
    slots[0];
  const pick = (slot: MaterialSlot) =>
    setSelectedState(
      slot.bomItemId > 0
        ? { card: techCardId, bomItemId: slot.bomItemId }
        : { card: techCardId, bomItemId: 0, lineKey: slot.lineKey },
    );

  /* T63 (05.10): «при клике на какой то из материалов … анкорить в раздел generate и на секундочку
     его как-то блинкать». Только по выбору самой ячейки (щелчок мимо её дверей, Enter/Space) —
     загрузка, меню и ✕ внутри ячейки страницу не уводят. */
  const generateRef = useRef<HTMLDivElement | null>(null);
  const anchorGenerate = () =>
    requestAnimationFrame(() => {
      const el = generateRef.current;
      if (!el) return;
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
      el.animate?.(
        [
          { outlineColor: 'transparent' },
          { outlineColor: 'var(--color-textColor, #000)' },
          { outlineColor: 'transparent' },
          { outlineColor: 'var(--color-textColor, #000)' },
          { outlineColor: 'transparent' },
        ],
        { duration: 1100, easing: 'ease-in-out', delay: still ? 0 : 250 },
      );
    });

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
    // `logo = picture 1` / `artwork = picture 1` are reserved for the picture tiles: never let
    // typed words carry them.
    const spec = {
      ...spec0,
      words: spec0.words.replace(/(logo|artwork)\s*=\s*picture\s*1/gi, '').trim(),
    };
    const hardware = slot.family === 'hardware';
    const artwork = isArtworkSlot(slot);
    const label = isLabelSlot(slot);
    const c = colourOf(slot, spec);
    const idsOf = (list: common_MediaFull[] | undefined) =>
      (list ?? []).map((m) => m.id ?? 0).filter((id) => id > 0);
    const logoIds = label || artwork ? idsOf(spec.pictures).slice(0, 1) : [];
    // Label: [logo (if any), ...references]; artwork: [source photo (if any), ...references]. The
    // marker tells the model which picture is the logo / the source.
    const pictureIds =
      label || artwork
        ? [...logoIds, ...idsOf(spec.refs).slice(0, LABEL_REFS_MAX)]
        : idsOf(spec.pictures);
    // Label: placement chips ride as «sewn at …» context, the rest is the label itself.
    const said = wordList(spec.words);
    const place = said.filter((w) => LABEL_PLACES.some((p) => sameWord(p, w))).join(', ');
    const rest = said.filter((w) => !LABEL_PLACES.some((p) => sameWord(p, w))).join(', ');
    const words = artwork
      ? uniqueWords([
          c?.words ?? '',
          spec.words,
          slot.name,
          'artwork',
          logoIds.length > 0 ? 'artwork = picture 1' : '',
        ])
      : label
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
          mode: artwork ? 'artwork' : label ? 'label' : hardware ? 'hardware' : 'swatch',
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
    if (mediaId <= 0 || cwId <= 0 || slot.bomItemId <= 0) return;
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
    const assetId = wireInt(asset.id);
    // Serialised with the cut-out swap (both rewrite the whole asset): never while it is cutting.
    if (cutting.has(assetId)) return;
    const spec = specOf(slot);
    const colour = colourOf(slot, spec);
    mark(key, true);
    markWords(assetId, true);
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
        note: isCut(asset) ? markCut(spec.words) : spec.words.trim(),
        colourCode: colour?.code ?? '',
        colourHex: colour?.hex ?? '',
      })
      .catch(() => {})
      .finally(() => {
        mark(key, false);
        markWords(assetId, false);
      });
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
    if (slot.bomItemId <= 0) return;
    // Pin the colourway too: a switch while the dialog is open must not land the picture there.
    replaceTarget.current = { slot, cw: cwId };
    replaceTrigger.current?.click();
  };

  const writable = !disabled && capable && cwId > 0 && !archived;
  const fabrics = slots.filter((s) => s.family === 'fabric');
  const hardware = slots.filter((s) => s.family === 'hardware' && !isArtworkSlot(s));
  const artworks = artworkSlotsOf(slots);

  /* ─── auto cut-out (round 7, override 2): client fallback, one switch ─── */
  const cutting = useArtworkCutout(
    techCardId,
    band,
    artworks.map((s) => s.bomItemId).join(','),
    ARTWORK_CLIENT_CUTOUT && !disabled && speaks && capable,
    wordsSaving,
  );

  /* ─── `clean unused` (round 8 · C-m3): pictures a manual replace left on the shelf. Strict — the
     server cascades a delete: hardware only, bound to no pair, placed on no flat, parent of no
     asset, worn by no colourway, not the previous picture of a live undo, not being cut. A band
     without placements answers nothing, so the door is not drawn. ─── */
  const shelfCount = (band.assets ?? []).length;
  const held = useMemo(() => new Set([...undos.values()].map((e) => e.prevId)), [undos]);
  const unusedIds = useMemo(
    () => unusedHardwareIds(band, held, cutting, Date.now()),
    [band, held, cutting],
  );
  // A run in flight may land on (or derive from) a shelf picture: the door waits for it.
  const cardBusy = (band.runs ?? []).some(isRunLive) || launching.size > 0;
  const cleanable = !disabled && capable && speaks && unusedIds.length > 0;
  const cleanLive = cleanable && !cardBusy;
  const [confirmClean, setConfirmClean] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const cleanYesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirmClean) return;
    cleanYesRef.current?.focus();
    const t = setTimeout(() => setConfirmClean(false), 5_000);
    return () => clearTimeout(t);
  }, [confirmClean]);
  const cleanUnused = async () => {
    setConfirmClean(false);
    if (cardBusy) return;
    setCleaning(true);
    try {
      // The band on screen may be stale and a delete cascades: re-read the card from the server
      // and recompute the strict predicate on that copy; a live run there stops the clean.
      const fresh = await adminService.GetDesignBand({ techCardId, benchColorwayId: 0 });
      if ((fresh.runs ?? []).some(isRunLive)) {
        showMessage('generating — clean after it lands', 'error');
        return;
      }
      const ids = unusedHardwareIds(fresh, held, cutting, Date.now());
      for (const assetId of ids) {
        await adminService.DeleteDesignAsset({ techCardId, assetId });
      }
    } catch (error) {
      showMessage((error as Error)?.message || 'the change did not go through', 'error');
    } finally {
      await writes.invalidate();
      setCleaning(false);
    }
  };

  /* ─── `+ artwork` (owner 04.10): ONE click births the DECORATION line and selects it ─── */
  const addGate: Gate = !form
    ? { ok: false, reason: 'the card form is not on this screen' }
    : disabled
      ? { ok: false, reason: READ_ONLY_SHELF_REASON }
      : cwId <= 0
        ? { ok: false, reason: 'pick a colourway above' }
        : !archivedGate.ok
          ? archivedGate
          : { ok: true };
  const addArtwork = () => {
    if (!form || !addGate.ok) return;
    const technique = ARTWORK_TECHNIQUES[0];
    const name = nextArtworkName(artworkCells.map((s) => s.name));
    const line = bornBomLine({
      section: ARTWORK_SECTION,
      name,
      spec: technique,
      kind: artworkKindOf(technique),
    });
    const lineKey = line.lineKey as string;
    const cur = form.getValues('bomItems') ?? [];
    form.setValue('bomItems', [...cur, line] as never, { shouldDirty: true });
    bornSeq.current += 1;
    const seq = -bornSeq.current;
    setBornState((prev) => ({
      card: techCardId,
      rows: [...(prev.card === techCardId ? prev.rows : []), { lineKey, seq, name, technique }],
    }));
    // Selected NOW, by its line key: the panel follows the line through its id landing.
    setSelectedState({ card: techCardId, bomItemId: 0, lineKey });
    autosave.request('materials · + artwork');
  };
  // Name · technique of an artwork line, written into the card form by line key (pending or saved).
  const lineWritable = !!form && !disabled;
  const writeArtwork = (slot: MaterialSlot, patch: { name?: string; technique?: string }) => {
    if (!form || !lineWritable) return;
    const name = patch.name?.trim() ?? '';
    const technique = patch.technique ?? '';
    const linePatch: { name?: string; spec?: string; kind?: string } = {};
    // A line without a name does not validate: a cleared name keeps the old one.
    if (name && name !== slot.name) linePatch.name = name;
    if (technique) {
      linePatch.spec = technique;
      linePatch.kind = artworkKindOf(technique) || slot.kind;
    }
    if (Object.keys(linePatch).length === 0) return;
    if (!patchBomLine(form.getValues, form.setValue, slot.lineKey, linePatch)) return;
    setBornState((prev) =>
      prev.card !== techCardId
        ? prev
        : {
            card: techCardId,
            rows: prev.rows.map((r) =>
              r.lineKey === slot.lineKey
                ? { ...r, name: linePatch.name ?? r.name, technique: technique || r.technique }
                : r,
            ),
          },
    );
    // The technique seeds the words: the other technique words leave, this one leads.
    if (technique && slot.bomItemId > 0) {
      const spec = specOf(slot);
      const rest = wordList(spec.words).filter(
        (w) => !ARTWORK_TECHNIQUES.some((t) => sameWord(t, w)),
      );
      setSpec(slot, { ...spec, words: [technique, ...rest].join(', ') });
    }
    autosave.request('materials · artwork line');
  };
  /* T65 · «NAME генерируй сам потом на карточке можно будет поменять»: an artwork is born with its
     default name (`artwork N`); renaming lives on the cell — the cap's ✎ (and `rename` in a filled
     cell's MORE menu) turns the cap into one inline field. Enter / blur writes, Esc drops. */
  const [renamingState, setRenamingState] = useState<{ card: number; lineKey: string }>({
    card: techCardId,
    lineKey: '',
  });
  const renaming = renamingState.card === techCardId ? renamingState.lineKey : '';
  const renameKit = (slot: MaterialSlot): RenameKit | undefined =>
    isArtworkSlot(slot) && lineWritable
      ? {
          editing: renaming === slot.lineKey,
          onStart: () => setRenamingState({ card: techCardId, lineKey: slot.lineKey }),
          onCommit: (name) => {
            setRenamingState({ card: techCardId, lineKey: '' });
            writeArtwork(slot, { name });
          },
          onCancel: () => setRenamingState({ card: techCardId, lineKey: '' }),
        }
      : undefined;
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
  const selName = selected ? selected.name.toUpperCase() : '';
  const verbName = selName.length > 24 ? `${selName.slice(0, 23)}…` : selName;
  const emptyN = emptyRunnable.length;

  /* ─── T65 (owner 05.10): every choice is a dropdown up front (TECHNIQUE · LOOK · SEWN AT ·
     MATERIAL); the free words fold behind FLAT's `custom ▸` door («ARTWORK текстфилда не должно
     быть или скрыть его в custom»). Closed by default; open state resets when the selected slot
     changes family. Fabric has no dropdowns: its cloth words stay in the open. ─── */
  const chipFamily = !selected
    ? ''
    : isArtworkSlot(selected)
      ? 'artwork'
      : isLabelSlot(selected)
        ? 'label'
        : selected.family;
  const chipRows = chipRowsOf(chipFamily);
  const [customState, setCustomState] = useState<{ family: string; open: boolean }>({
    family: chipFamily,
    open: false,
  });
  const customOpen = customState.family === chipFamily && customState.open;
  // `custom •` while the words say more than the dropdowns do.
  const extraWords =
    selSpec && chipRows
      ? wordList(selSpec.words).filter(
          (w) => !chipRows.some((r) => r.words.some((x) => sameWord(x, w))),
        )
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
      {shelfCount >= SHELF_SHOWN_AT && (
        <>
          {dot}
          <Text size='micro' variant='label' component='span' data-fh-shelf={shelfCount}>
            {shelfCount} / {ASSETS_PER_CARD_MAX}
          </Text>
          {cleaning ? (
            <>
              {dot}
              <Text size='micro' variant='label' component='span' data-fh-cleaning=''>
                deleting…
              </Text>
            </>
          ) : cleanLive && confirmClean ? (
            <span
              className='flex items-center gap-1.5'
              data-fh-clean-confirm={unusedIds.length}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setConfirmClean(false);
              }}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setConfirmClean(false);
              }}
            >
              {dot}
              <Text size='micro' component='span' className='uppercase'>
                delete {unusedIds.length} unused picture{unusedIds.length === 1 ? '' : 's'}?
              </Text>
              <Button
                ref={cleanYesRef}
                variant='underline'
                size='xs'
                onClick={() => void cleanUnused()}
                data-fh-clean-yes=''
              >
                yes
              </Button>
              {dot}
              <Button
                variant='underline'
                size='xs'
                onClick={() => setConfirmClean(false)}
                data-fh-clean-no=''
              >
                no
              </Button>
            </span>
          ) : cleanable && cardBusy ? (
            <>
              {dot}
              <span data-fh-clean-inert={unusedIds.length}>
                <InertDoor
                  label={`clean unused · ${unusedIds.length}`}
                  reason={CLEAN_BUSY_REASON}
                  variant='underline'
                />
              </span>
            </>
          ) : cleanable ? (
            <>
              {dot}
              <Button
                variant='underline'
                size='xs'
                title='hardware pictures in no cell, on no flat'
                onClick={() => setConfirmClean(true)}
                data-fh-clean={unusedIds.length}
              >
                clean unused · {unusedIds.length}
              </Button>
            </>
          ) : null}
        </>
      )}
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

  const group = (
    title: string,
    list: MaterialSlot[],
    extra?: { tail?: React.ReactNode; below?: React.ReactNode },
  ) =>
    list.length === 0 && !extra ? null : (
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
        {/* T61: the FLAT SLOTS row — same 166px box, same gap-2 rhythm, wrapping instead of
            scrolling (a materials group has no fixed count). */}
        <div className='flex flex-wrap items-start gap-2 pt-1.5'>
          {list.map((slot) => {
            const key = pairKey(cwId, slot.bomItemId);
            const gate = cellGate(slot);
            const current = cwId > 0 ? byPair.get(key) : undefined;
            const undoEntry = undos.get(key);
            const canUndo = !!undoEntry && undoLive(key, undoEntry);
            const isSelected = selected?.bomItemId === slot.bomItemId;
            // A born artwork still waiting for its id: selectable, nothing else.
            const born = slot.bomItemId <= 0;
            return (
              <div
                key={born ? slot.lineKey : slot.bomItemId}
                style={FLAT_CELL_STYLE}
                className='flex min-w-0 flex-col items-start gap-1'
                data-fh-slot={born ? 'saving' : slot.bomItemId}
                data-fh-born-line={born ? slot.lineKey : undefined}
                data-fh-selected={isSelected ? '' : undefined}
              >
                {/* The cell is a SELECTOR only: click (captured) or Enter/Space selects the slot.
                    It never opens the library — `use own picture` in the panel does that. */}
                <IntakeCell
                  marked={fillMarks.has(slot.bomItemId)}
                  enabled={writable && !born && !saving.has(key)}
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
                      showMessage(
                        'the colourway changed while the picture uploaded · drop it again',
                        'error',
                      );
                      return;
                    }
                    pick(slot);
                    void place(slot, media);
                  }}
                  role='button'
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`select ${slot.name} — generate makes it`}
                  title={
                    isSelected
                      ? `${slot.name} · generate makes this one`
                      : `choose ${slot.name} for generate`
                  }
                  data-fh-cell={born ? 'saving' : slot.bomItemId}
                  className='group w-full min-w-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                  onClickCapture={() => pick(slot)}
                  onClick={(e) => {
                    const door = (e.target as HTMLElement).closest(
                      'button, a, input, label, [role="menu"], [role="menuitem"]',
                    );
                    if (door && e.currentTarget.contains(door)) return;
                    anchorGenerate();
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    pick(slot);
                    anchorGenerate();
                  }}
                >
                  <SlotCell
                    slot={slot}
                    asset={current}
                    selected={isSelected}
                    liveRun={cwId > 0 ? liveByPair.get(key) : undefined}
                    saving={saving.has(key)}
                    launching={launching.has(key)}
                    cutting={!!current && cutting.has(wireInt(current.id))}
                    writable={writable && !born}
                    full={!shelfRoom}
                    fullReason={SHELF_REASON}
                    onPlaceMedia={(media) => {
                      pick(slot);
                      void place(slot, media);
                    }}
                    onGenerateHalf={() => {
                      pick(slot);
                      anchorGenerate();
                    }}
                    rename={renameKit(slot)}
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
                    undo={
                      canUndo ? (
                        <button
                          type='button'
                          disabled={saving.has(key)}
                          title='restore the previous picture'
                          onClick={(e) => {
                            e.stopPropagation();
                            undo(slot);
                          }}
                          data-fh-undo={slot.bomItemId}
                          className='ml-auto shrink-0 cursor-pointer text-nano uppercase tracking-label text-labelColor underline hover:text-textColor disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                        >
                          undo
                        </button>
                      ) : null
                    }
                  />
                </IntakeCell>
              </div>
            );
          })}
          {extra?.tail}
        </div>
        {extra?.below}
      </div>
    );

  // The dropdowns of the selected slot (T65 · «TECHNIQUE сделай селектором с дропдауном», «в
  // пуговицах MATERIAL … как с TECHNIQUE», «все остальное тоже приведи к подобному виду»).
  const fields =
    !selected || !selSpec || !chipRows ? null : isArtworkSlot(selected) ? (
      <FieldSelect
        lead='technique'
        options={ARTWORK_TECHNIQUES}
        value={artworkTechniqueOf(selected.detail)}
        disabled={!lineWritable}
        onPick={(technique) => {
          if (technique && !sameWord(technique, artworkTechniqueOf(selected.detail)))
            writeArtwork(selected, { technique });
        }}
      />
    ) : (
      chipRows.map((row) => (
        <FieldSelect
          key={row.lead}
          lead={row.lead}
          options={row.words}
          none
          value={row.words.find((w) => hasWord(selSpec.words, w)) ?? ''}
          disabled={!writable}
          onPick={(word) => {
            const rest = wordList(selSpec.words).filter(
              (w) => !row.words.some((x) => sameWord(x, w)),
            );
            setSpec(selected, { ...selSpec, words: (word ? [...rest, word] : rest).join(', ') });
          }}
        />
      ))
    );

  return (
    <>
      <Section
        id='design-pattern'
        title='materials'
        question={cwName ? `· ${cwName.toUpperCase()}` : '· pick a colourway'}
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
            {group('artwork', artworkCells, {
              tail: <NewArtworkTile gate={addGate} onAdd={addArtwork} />,
            })}
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

      {/* T65 · «генерейт вынеси в отдельный блок»: GENERATE is its own block under MATERIALS (FLAT's
          WORKBENCH / FLAT SLOTS separation). T63 still holds: picking a cell scrolls here and
          blinks this block — the outline sits on the wrapper, around the block's white. */}
      {slots.length > 0 && selected && selSpec && (
        <div
          ref={generateRef}
          className='scroll-mt-24 outline outline-2 outline-offset-4 outline-transparent'
          data-fh-generate={selGate.ok ? 'live' : 'inert'}
          data-fh-for={selected.bomItemId > 0 ? selected.bomItemId : 'saving'}
        >
          <Section
            id='design-materials-generate'
            title='generate'
            /* T62: «BRAND LABEL ✦ это ту мач» — the target in the header's own grey clause. */
            question={
              <>
                · <span data-fh-subject=''>{selected.name}</span>
              </>
            }
            action={
              <Text size='micro' variant='label' component='span'>
                {chipFamily}
              </Text>
            }
          >
            <SpecPanel
              key={selKey}
              slot={selected}
              spec={selSpec}
              colour={selColour}
              disabled={!writable || selected.bomItemId <= 0}
              colorwayId={cwId}
              colorwayName={cwName}
              ownPantone={ownPantone}
              onChange={(next) => setSpec(selected, next)}
              fields={fields}
              words={!chipRows}
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
                  fold={!!chipRows}
                  open={customOpen}
                  onToggle={() => setCustomState({ family: chipFamily, open: !customOpen })}
                  extra={extraWords}
                  words={
                    <WordsField
                      slot={selected}
                      spec={selSpec}
                      disabled={!writable || selected.bomItemId <= 0}
                      onChange={(next) => setSpec(selected, next)}
                    />
                  }
                >
                  <span className='flex flex-wrap items-center gap-2'>
                    <Money data-probe='run-price' />
                    {wordsChanged && selAsset && writable && (
                      <Button
                        variant='underline'
                        size='xs'
                        disabled={saving.has(selKey) || cutting.has(wireInt(selAsset.id))}
                        title={
                          cutting.has(wireInt(selAsset.id))
                            ? 'cutting…'
                            : 'writes these words and colour onto the picture in the cell'
                        }
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

            <RunRefusal
              refusal={refusal}
              onDismiss={() => {
                setShownRefusal(null);
                run.dismissRefusal();
              }}
            />
          </Section>
        </div>
      )}
    </>
  );
}

type UndoEntry = { prevId: number; setTo: number };

/** The shelf count shows in the MATERIALS header from here on (of `ASSETS_PER_CARD_MAX`). */
const SHELF_SHOWN_AT = 100;

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

/** Hardware material words: the MATERIAL dropdown puts one in the `, `-separated list. */
const MATERIAL_WORDS = ['horn', 'metal', 'brass', 'resin', 'plastic', 'corozo', 'wood', 'woven'];
const wordList = (words: string) =>
  words
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
const hasWord = (words: string, word: string) => wordList(words).some((w) => sameWord(w, word));

const INPUT_CELL = 'w-24 shrink-0';

/** Caption line under a picture (empty by default): keeps it the colour tile's height. */
function InputCaption({ text }: { text?: string }): JSX.Element {
  return (
    <Text size='micro' variant='label' component='span' className='block h-4 w-full truncate'>
      {text || ' '}
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
  fields,
  words,
}: {
  slot: MaterialSlot;
  spec: Spec;
  colour: SwatchColour | null;
  disabled?: boolean;
  colorwayId: number;
  colorwayName: string;
  ownPantone: string;
  onChange: (spec: Spec) => void;
  /** The slot's dropdowns, one row of one-size fields under the pictures. */
  fields?: React.ReactNode;
  /** The words in the open (fabric); otherwise they live behind `custom ▸`. */
  words?: boolean;
}): JSX.Element {
  const { showMessage } = useSnackBarStore();
  const hardware = slot.family === 'hardware';
  const label = isLabelSlot(slot);
  const artwork = isArtworkSlot(slot);
  // Label: one logo; artwork: one source photo; other hardware: up to four references.
  const max = hardware && !label && !artwork ? REFS_MAX : 1;
  const withRefs = label || artwork;
  const pictures = spec.pictures;
  const room = Math.max(0, max - pictures.length);
  const add = (picked: common_MediaFull[]) => {
    // Label logo / artwork photo: raster only — the image model is sent this picture.
    const incoming = label || artwork ? picked.filter(isRasterPicture) : picked;
    if (incoming.length < picked.length) {
      showMessage(
        label ? NOT_RASTER_MESSAGE : NOT_RASTER_MESSAGE.replace('the logo', 'the photo'),
        'error',
      );
    }
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
  const refs = withRefs ? spec.refs ?? [] : [];
  const refRoom = withRefs ? Math.max(0, LABEL_REFS_MAX - refs.length) : 0;
  const addRefs = (incoming: common_MediaFull[]) => {
    const have = new Set(refs.map((m) => m.id ?? 0));
    const fresh = incoming.filter((m) => (m.id ?? 0) > 0 && !have.has(m.id ?? 0));
    const kept = fresh.slice(0, refRoom);
    if (fresh.length > kept.length) {
      showMessage(
        `took ${kept.length} of ${fresh.length}: ${artwork ? 'an artwork' : 'a label'} holds ${LABEL_REFS_MAX} references at most`,
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
            // T65 · «"NO COLOUR" текста быть не должно»: the tile face already says `+ colour`; the
            // caption under it names a picked colour only (a blank line keeps the row's height).
            label={colour?.code || colour?.hex || '\u00a0'}
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
              alt={
                label
                  ? `${slot.name} logo`
                  : artwork
                    ? `${slot.name} photo`
                    : `${slot.name} picture ${index + 1}`
              }
              disabled={disabled}
              onRemove={() =>
                onChange({ ...spec, pictures: pictures.filter((_, at) => at !== index) })
              }
            />
            <InputCaption text={label ? 'logo' : undefined} />
          </div>
        ))}
        {room > 0 && (
          <div className={INPUT_CELL} data-fh-look-door=''>
            <PictureSlotEmpty
              purpose={
                label
                  ? `design · ${slot.name} · logo`
                  : artwork
                    ? `design · ${slot.name} · photo`
                    : `design · ${slot.name}`
              }
              label={label ? '+ logo' : artwork ? '+ photo' : undefined}
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
              label={artwork ? '+ ref' : '+ reference'}
              multiple={refRoom > 1}
              limit={refRoom}
              disabled={disabled}
              onSelect={addRefs}
            />
            <InputCaption />
          </div>
        )}
      </div>

      {fields && (
        <div className='flex flex-wrap items-end gap-2.5' data-fh-fields=''>
          {fields}
        </div>
      )}
      {words && <WordsField slot={slot} spec={spec} disabled={disabled} onChange={onChange} />}
    </div>
  );
}

/** The slot's free words: label above, a real (vertical-resize) textarea capped in width. */
function WordsField({
  slot,
  spec,
  disabled,
  onChange,
}: {
  slot: MaterialSlot;
  spec: Spec;
  disabled?: boolean;
  onChange: (spec: Spec) => void;
}): JSX.Element {
  const hardware = slot.family === 'hardware';
  const label = isLabelSlot(slot);
  const artwork = isArtworkSlot(slot);
  return (
    <div className='flex w-full max-w-xl basis-full flex-col gap-1'>
      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='label'
        htmlFor={`fh-words-${slot.bomItemId}`}
        className='text-labelColor'
      >
        {artwork ? 'artwork' : label ? 'label' : hardware ? 'material' : 'cloth'}
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
          artwork
            ? 'embroidery'
            : label
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
  );
}

/** One dropdown's words; `lead` is its label above. */
type ChipRowSpec = { lead: string; words: readonly string[] };

/** The dropdowns a slot family offers; fabric has none (→ its words stay in the open). */
function chipRowsOf(family: string): ChipRowSpec[] | null {
  if (family === 'artwork') return [{ lead: 'technique', words: ARTWORK_TECHNIQUES }];
  if (family === 'label')
    return [
      { lead: 'look', words: LABEL_LOOKS },
      { lead: 'sewn at', words: LABEL_PLACES },
    ];
  if (family === 'hardware') return [{ lead: 'material', words: MATERIAL_WORDS }];
  return null;
}

/**
 * The run row's tail, wrapped in FLAT's `custom ▸` door when the slot has dropdowns: the door
 * stands right after GENERATE, `after` keeps the row's own doors, and open draws the free words
 * on their own line under the run row. `custom •` while the words say more than the dropdowns.
 */
function MaybeCustom({
  fold,
  open,
  onToggle,
  extra,
  words,
  children,
}: {
  fold: boolean;
  open: boolean;
  onToggle: () => void;
  extra: string[];
  words: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  if (!fold) return <>{children}</>;
  return (
    <FlatCustom
      open={open}
      onToggle={onToggle}
      modified={extra.length > 0}
      summary={extra.join(', ')}
      closedTitle='free words for the description'
      after={children}
    >
      <div className='flex basis-full flex-col gap-2' data-fh-custom-words=''>
        {words}
      </div>
    </FlatCustom>
  );
}

/** Width of every dropdown: a row of fields is one size (owner rule, 04.10). */
const FIELD_W = 'w-44';

/** A labelled single-choice dropdown (the app's `Select`); `none` adds a `—` to clear it. */
function FieldSelect({
  lead,
  options,
  value,
  none,
  disabled,
  onPick,
}: {
  lead: string;
  options: readonly string[];
  value: string;
  none?: boolean;
  disabled?: boolean;
  onPick: (word: string) => void;
}): JSX.Element {
  const items = [
    ...(none ? [{ value: '', label: '—' }] : []),
    ...options.map((w) => ({ value: w, label: w })),
  ];
  return (
    <div className={cn('flex shrink-0 flex-col gap-1', FIELD_W)} data-fh-select={lead}>
      <Text size='micro' variant='uppercase' tracking='label' className='text-labelColor'>
        {lead}
      </Text>
      <Select
        name={`fh-${lead}`}
        items={items}
        value={value}
        placeholder='—'
        disabled={disabled}
        onValueChange={(v: string) => onPick(v)}
      />
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
  cutting,
  writable,
  full,
  fullReason,
  generateGate,
  onPick,
  liveCorner,
  onReplace,
  onGenerate,
  onClear,
  onPlaceMedia,
  onGenerateHalf,
  rename,
  undo,
}: {
  slot: MaterialSlot;
  asset?: common_DesignAsset;
  selected: boolean;
  liveRun?: common_DesignRun;
  saving: boolean;
  launching: boolean;
  /** Artwork: its auto cut-out run is live (the asset's media is swapped when it lands). */
  cutting?: boolean;
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
  /** Empty face, top half: a picture from the library / upload, placed in THIS cell. */
  onPlaceMedia: (media: common_MediaFull) => void;
  /** Empty face, bottom half: select this cell and anchor to the GENERATE block. */
  onGenerateHalf: () => void;
  /** Artwork: the cap renames the line (✎ → inline field). */
  rename?: RenameKit;
  /** The pair's `undo` word: inside the frame, at the cap's right end. */
  undo?: React.ReactNode;
}): JSX.Element {
  const cap = rename?.editing ? (
    <CapRename slot={slot} kit={rename} />
  ) : (
    <SlotCap
      label={slot.name}
      title={[slot.name, slot.purposeLabel, slot.detail].filter(Boolean).join(' · ')}
      strong={selected}
      chosen={selected}
      quiet
      trailing={
        <>
          {undo ?? null}
          {rename && (
            <button
              type='button'
              title={`rename ${slot.name}`}
              aria-label={`rename ${slot.name}`}
              onClick={(e) => {
                e.stopPropagation();
                rename.onStart();
              }}
              data-fh-rename={slot.bomItemId > 0 ? slot.bomItemId : slot.lineKey}
              className={cn(
                'shrink-0 cursor-pointer text-nano text-labelColor hover:text-textColor focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                !undo && 'ml-auto',
                !selected && 'opacity-0 group-hover:opacity-100',
              )}
            >
              ✎
            </button>
          )}
          {/* T61 · ✦ = the app's generate glyph (`ai ✦`). On the chosen cell it says «GENERATE
              makes this»; on any other it surfaces on hover/focus as the promise of the click. */}
          <span
            aria-hidden
            data-fh-target-mark={selected ? 'on' : 'hint'}
            className={cn(
              'shrink-0 text-nano',
              !undo && !rename && 'ml-auto',
              !selected &&
                'text-labelColor opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
            )}
          >
            ✦
          </span>
        </>
      }
    />
  );

  if (liveRun || saving || launching || cutting) {
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
          ) : cutting ? (
            <LiveWord word='cutting…' />
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
        onReplace={onReplace}
        onGenerate={onGenerate}
        onClear={onClear}
        onRename={rename?.onStart}
      />
    );
  }

  // T65 · «кнопка аплоуд не очень понятная … делим импут на две части»: the empty face is FLAT
  // SLOTS' two-half slot — top `from media` (library · upload · ⌘V · drop), bottom `generate ✦`
  // (selects the cell and anchors to the GENERATE block). Read-only / full shelf: pictogram only.
  const halves = writable && !full;
  return (
    <PlaceOrDrawCell
      label={slot.name}
      aspect={BENCH_FRAME_ASPECT}
      purpose={`design · ${slot.name}`}
      selected={selected}
      className={HOVER_INK}
      mediaLabel='from media'
      onSelect={halves ? onPlaceMedia : undefined}
      onDraw={halves ? onGenerateHalf : undefined}
      drawLabel='generate'
      drawGlyph={
        <span
          aria-hidden
          className='flex size-5 items-center justify-center text-[15px] leading-none'
        >
          ✦
        </span>
      }
      drawTitle={`make ${slot.name} with GENERATE below`}
      drawAriaLabel={`generate ${slot.name}`}
      instead={halves ? undefined : <span />}
      // Under the two halves' words the pictogram steps back to half its strength, so `from
      // media` / `generate` read over it; alone (read-only) it keeps its own. The wrapper is
      // absolute too: a static one would take a track of the frame's two-row grid.
      backdrop={
        halves ? (
          <span
            aria-hidden
            style={{ position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none' }}
          >
            <TrimPictogramBackdrop slot={slot} />
          </span>
        ) : (
          <TrimPictogramBackdrop slot={slot} />
        )
      }
      cap={cap}
      data-fh-empty={slot.bomItemId}
    />
  );
}

/** Artwork rename on the cell (T65): `onStart` opens the cap's field, `onCommit` writes the line. */
type RenameKit = {
  editing: boolean;
  onStart: () => void;
  onCommit: (name: string) => void;
  onCancel: () => void;
};

/** The cap as one inline name field: Enter / blur writes (a cleared name keeps the old), Esc drops. */
function CapRename({ slot, kit }: { slot: MaterialSlot; kit: RenameKit }): JSX.Element {
  const [draft, setDraft] = useState(slot.name);
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const name = draft.trim();
    if (name && name !== slot.name) kit.onCommit(name);
    else kit.onCancel();
  };
  return (
    <div className='flex min-w-0 items-center border-t border-textColor bg-bgColor px-1 py-0.5'>
      <input
        autoFocus
        value={draft}
        aria-label={`name of ${slot.name}`}
        maxLength={120}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            done.current = true;
            kit.onCancel();
          }
        }}
        data-fh-artwork-name=''
        className='h-5 w-full min-w-0 bg-transparent px-0.5 text-micro uppercase tracking-label text-textColor outline-none'
      />
    </div>
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

/** The tile's single-click action on a dressed cell: none — the enclosing cell selects. */
const selectedByCell = () => {};

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
  onReplace,
  onGenerate,
  onClear,
  onRename,
}: {
  slot: MaterialSlot;
  asset: common_DesignAsset;
  selected: boolean;
  cap: React.ReactNode;
  writable: boolean;
  full: boolean;
  fullReason: string;
  generateGate: Gate;
  onReplace: () => void;
  onGenerate: () => void;
  onClear: () => void;
  /** Artwork: `rename` in the MORE menu opens the cap's name field. */
  onRename?: () => void;
}): JSX.Element {
  const url = assetFull(asset);
  const label = assetLabel(asset);
  const hardware = slot.family === 'hardware';
  const artwork = isArtworkSlot(slot);
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
      data-fh-checker={artwork ? '' : undefined}
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
        ground={hardware && !artwork ? 'neutral' : undefined}
        // An artwork is a cut-out PNG: its transparency reads on a checkerboard.
        className={cn('w-full border-0', artwork && CHECKERBOARD)}
        galleryGroup={url ? { key: zoomGroup.key, index: 0 } : undefined}
        // The cell's capture click has ALREADY selected this slot. `onOpen` is here only so the
        // tile arbitrates one click (nothing) against two (zoom); re-selecting from its delayed
        // single fired AFTER a quick click on another cell and took the selection back (T22).
        onOpen={selectedByCell}
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
            ...(onRename ? [{ value: 'rename', label: 'rename' }] : []),
          ],
          onPick: (v) =>
            v === 'zoom'
              ? openGroup(zoomGroup.key, 0)
              : v === 'replace'
                ? onReplace()
                : v === 'generate'
                  ? onGenerate()
                  : v === 'rename'
                    ? onRename?.()
                    : onClear(),
          'data-menu': `fh:${slot.bomItemId}`,
        }}
      />
      {cap}
    </div>
  );
}

/* ═══ ROUND 7 · ARTWORK ═══════════════════════════════════════════════════════════════════════ */

/** Transparent PNGs read on a light checkerboard (object-contain), in cells only. */
const CHECKERBOARD =
  '[background:repeating-conic-gradient(#e6e6e6_0_25%,#ffffff_0_50%)_0_0/12px_12px]';

/** A `+ artwork` line born on this screen: `seq` is its pending (negative) slot id until saved. */
type BornLine = { lineKey: string; seq: number; name: string; technique: string };

/**
 * The dashed `new` tile of ColourwayStrip, at the bench cell's width, word `+ artwork`. ONE click
 * births the line and selects it — no row to fill in first.
 */
function NewArtworkTile({ gate, onAdd }: { gate: Gate; onAdd: () => void }): JSX.Element {
  const off = !gate.ok;
  // T61: the same box as every cell of the row (FLAT SLOTS' empty cell): dashed frame, square
  // picture area, the word INSIDE the cap — no caption hanging under the box.
  return (
    <div style={FLAT_CELL_STYLE} className='flex min-w-0 flex-col items-start gap-1'>
      <button
        type='button'
        disabled={off}
        onClick={onAdd}
        title={off ? gate.reason : 'a new artwork — a DECORATION line of the BOM'}
        data-fh-new-artwork={off ? 'inert' : 'live'}
        className={cn(
          'group flex w-full min-w-0 flex-col overflow-hidden border border-dashed border-borderColor bg-bgColor text-left',
          'hover:border-solid hover:border-textColor disabled:cursor-not-allowed disabled:hover:border-dashed disabled:hover:border-borderColor',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
        )}
      >
        <span
          aria-hidden
          style={{ aspectRatio: BENCH_FRAME_ASPECT }}
          className={cn(
            'flex w-full items-center justify-center',
            off ? 'text-textInactiveColor' : 'text-labelColor group-hover:text-textColor',
          )}
        >
          <Text component='span' size='control' className='font-bold'>
            +
          </Text>
        </span>
        <SlotCap label='+ artwork' quiet />
      </button>
    </div>
  );
}

/**
 * ═══ AUTO CUT-OUT — CLIENT FALLBACK (round 7, spec override 2) ═══════════════════════════════
 *
 * Every artwork-mode run, once it lands, is followed by a `cutout` run (background removal →
 * alpha PNG) and the artwork asset's media is swapped to the cut-out. Until the backend chains
 * this server-side, the bench does it: flip `ARTWORK_CLIENT_CUTOUT` to `false` to switch it off.
 *
 * MARKER «already cut» = the asset note ends with ` · cut` (`markCut`). `derivedFromAssetId` was
 * not usable: the server keeps it for `pattern` assets only and refuses a self-reference. The
 * seed strips the marker (`noteWords`), so the words never show it; `save words` keeps it.
 *
 * Which assets: those bound to an ARTWORK slot whose media is a picture of a landed `artwork`
 * pattern run (an own upload is never cut — it costs a run). Per asset, the newest `cutout` run
 * whose one input is that media decides: none → start one; live → the cell says `cutting…`;
 * done with a picture → swap media + mark; failed / no alpha → keep the white-ground asset (no
 * retry: a finished cutout run for that media exists).
 */
export const ARTWORK_CLIENT_CUTOUT = true;

const CUT_MARK = ' · cut';
const isCut = (asset: common_DesignAsset): boolean =>
  (asset.note ?? '').trimEnd().endsWith('· cut');
const markCut = (words: string): string => `${words.trim()}${CUT_MARK}`.trim();
/** The asset note as words, without the cut-out marker. */
function noteWords(asset: common_DesignAsset): string {
  const note = (asset.note ?? '').trim();
  return isCut(asset) ? note.replace(/\s*·\s*cut$/, '').trim() : note;
}

type CutoutPlan = {
  start: common_DesignAsset[];
  swap: { asset: common_DesignAsset; mediaId: number }[];
  cutting: Set<number>;
};

function cutoutPlan(band: GetDesignBandResponse, bomIds: ReadonlySet<number>): CutoutPlan {
  const plan: CutoutPlan = { start: [], swap: [], cutting: new Set() };
  if (bomIds.size === 0) return plan;
  const runs = band.runs ?? [];
  const landedArtwork = new Set<number>();
  for (const r of runs) {
    if ((r.kind ?? '').trim().toLowerCase() !== 'pattern') continue;
    if ((r.params?.pattern?.mode ?? '').trim().toLowerCase() !== 'artwork') continue;
    for (const p of r.pictures ?? []) {
      const id = wireInt(p.media?.id);
      if (id > 0) landedArtwork.add(id);
    }
  }
  const cutouts = runs
    .filter((r) => (r.kind ?? '').trim().toLowerCase() === 'cutout')
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  const byId = new Map((band.assets ?? []).map((a) => [wireInt(a.id), a]));
  const seen = new Set<number>();
  for (const b of band.assetBindings ?? []) {
    if (!bomIds.has(wireInt(b.bomItemId))) continue;
    const assetId = wireInt(b.assetId);
    const asset = byId.get(assetId);
    if (!asset || seen.has(assetId)) continue;
    seen.add(assetId);
    const mediaId = wireInt(asset.mediaId);
    if (mediaId <= 0 || isCut(asset) || !landedArtwork.has(mediaId)) continue;
    const latest = cutouts.find((r) => wireInt(r.params?.extraInputMediaIds?.[0]) === mediaId);
    if (!latest) plan.start.push(asset);
    else if (isRunLive(latest)) plan.cutting.add(assetId);
    else if (runStatus(latest) === 'done') {
      const pic = wireInt(selectVisiblePictures(latest.pictures ?? [])[0]?.media?.id);
      if (pic > 0 && pic !== mediaId) {
        plan.swap.push({ asset, mediaId: pic });
        plan.cutting.add(assetId);
      }
    }
  }
  return plan;
}

const CUTOUT_SCOPE = 'fabrics-hardware:cutout';

/** Runs the plan (each start / swap once per page life); returns asset ids being cut. */
function useArtworkCutout(
  techCardId: number,
  band: GetDesignBandResponse,
  bomKey: string,
  enabled: boolean,
  wordsSaving: ReadonlySet<number>,
): ReadonlySet<number> {
  const qc = useQueryClient();
  const writes = useAssetWrites(techCardId);
  const run = useStartDesignRun(techCardId, { scope: CUTOUT_SCOPE });
  const fired = useRef(new Set<string>());
  const plan = useMemo(
    () =>
      cutoutPlan(
        band,
        new Set(
          bomKey
            .split(',')
            .map(Number)
            .filter((n) => n > 0),
        ),
      ),
    [band, bomKey],
  );
  const runRef = useRef(run);
  runRef.current = run;
  const upsertRef = useRef(writes.upsertAsset);
  upsertRef.current = writes.upsertAsset;
  useEffect(() => {
    if (!enabled) return;
    for (const asset of plan.start) {
      const key = `start:${wireInt(asset.id)}:${wireInt(asset.mediaId)}`;
      if (fired.current.has(key)) continue;
      fired.current.add(key);
      // DETERMINISTIC key: a second tab or a remount asks for the same cut-out under the same key,
      // and the server hands back the run it already booked instead of paying for a second one.
      const clientRequestId = cutoutRequestId(
        techCardId,
        wireInt(asset.id),
        wireInt(asset.mediaId),
      );
      runRef.current.start(
        {
          kind: 'cutout',
          ask: '',
          params: {
            views: [],
            colorwayId: 0,
            layout: '',
            colour: undefined,
            threed: undefined,
            fixTarget: '',
            extraInputMediaIds: [wireInt(asset.mediaId)],
            fixTargets: [],
            fixSlotIds: [],
            autoSplit: false,
            detailSlotIds: [],
            pattern: undefined,
            freeform: undefined,
            useFlatSlots: false,
            flatSlotIds: [],
            image: undefined,
            inpaint: undefined,
            extend: undefined,
            video: undefined,
          },
        },
        { clientRequestId },
      );
    }
    for (const { asset: planned, mediaId } of plan.swap) {
      const key = `swap:${wireInt(planned.id)}:${mediaId}`;
      if (fired.current.has(key)) continue;
      // One writer per asset: a `save words` in flight goes first; its re-read band re-plans this.
      if (wordsSaving.has(wireInt(planned.id))) continue;
      // Re-read the LATEST asset right before the full upsert: keep its current words and colour,
      // change only the media and the cut marker.
      const latest = qc
        .getQueryData<GetDesignBandResponse>(designKeys.band(techCardId))
        ?.assets?.find((a) => wireInt(a.id) === wireInt(planned.id));
      const asset = latest ?? planned;
      // Already cut, or its picture was replaced meanwhile: nothing of this swap is still true.
      if (isCut(asset) || wireInt(asset.mediaId) !== wireInt(planned.mediaId)) continue;
      fired.current.add(key);
      upsertRef.current
        .mutateAsync({
          assetId: wireInt(asset.id),
          kind: asset.kind ?? '',
          name: asset.name ?? '',
          mediaId,
          derivedFromAssetId: wireInt(asset.derivedFromAssetId),
          repeatMm: wireInt(asset.repeatMm),
          rotationDeg: wireInt(asset.rotationDeg),
          ordinal: wireInt(asset.ordinal),
          note: markCut(noteWords(asset)),
          colourCode: asset.colourCode ?? '',
          colourHex: asset.colourHex ?? '',
        })
        .catch(() => {
          // Said by the write hook; a later band re-read may retry on a fresh page.
        });
    }
  }, [plan, enabled, wordsSaving, qc, techCardId]);
  return plan.cutting;
}

/** The cut-out run's key, derived from what it cuts (fits the 36-char column). */
function cutoutRequestId(techCardId: number, assetId: number, mediaId: number): string {
  return `cutout-${techCardId.toString(36)}-${assetId.toString(36)}-${mediaId.toString(36)}`;
}

/** `clean unused` waits while a run of the card is live or on its way. */
const CLEAN_BUSY_REASON = 'generating — clean after it lands';
/** A picture this young may still be someone's undo or a run's landing: `clean unused` keeps it. */
const CLEAN_KEEP_RECENT_MS = 30 * 60_000;

const stampMs = (t: string | undefined): number => {
  const ms = t ? Date.parse(t) : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * `clean unused` (round 8 · C-m3): pictures a manual replace left on the shelf. Strict — the
 * server cascades a delete: hardware only, bound to no pair, placed on no flat, parent of no
 * asset, worn by no colourway, not the previous picture of a live undo, not being cut, and not
 * created or updated in the last 30 minutes. A band without placements answers nothing.
 */
function unusedHardwareIds(
  band: GetDesignBandResponse,
  held: ReadonlySet<number>,
  cutting: ReadonlySet<number>,
  now: number,
): number[] {
  if (band.assetPlacements === undefined || band.assetBindings === undefined) return [];
  const bound = new Set(band.assetBindings.map((b) => wireInt(b.assetId)));
  const placed = new Set(band.assetPlacements.map((p) => wireInt(p.assetId)));
  const parents = new Set((band.assets ?? []).map((a) => wireInt(a.derivedFromAssetId)));
  return (band.assets ?? [])
    .filter((a) => {
      const id = wireInt(a.id);
      const touched = Math.max(stampMs(a.createdAt), stampMs(a.updatedAt));
      return (
        id > 0 &&
        (a.kind ?? '') === ASSET_HARDWARE &&
        wireInt(a.colorwayId) === 0 &&
        !bound.has(id) &&
        !placed.has(id) &&
        !parents.has(id) &&
        !held.has(id) &&
        !cutting.has(id) &&
        now - touched >= CLEAN_KEEP_RECENT_MS
      );
    })
    .map((a) => wireInt(a.id));
}

/**
 * The image model takes raster pictures only: PNG, JPG/JPEG, WEBP — read off the full-size URL
 * (a `data:` mime or the path's extension). SVG, PDF and anything unknown are not raster.
 */
export function isRasterPicture(m: common_MediaFull | undefined): boolean {
  const url = (
    m?.media?.fullSize?.mediaUrl ||
    m?.media?.compressed?.mediaUrl ||
    m?.media?.thumbnail?.mediaUrl ||
    ''
  ).trim();
  if (!url) return false;
  const data = /^data:([^;,]+)/i.exec(url);
  if (data) return /^image\/(png|jpe?g|webp)$/i.test(data[1]);
  let path = url;
  try {
    path = new URL(url, 'http://x').pathname;
  } catch {
    path = url.split(/[?#]/)[0];
  }
  return /\.(png|jpe?g|webp)$/i.test(path);
}

const NOT_RASTER_MESSAGE = 'the logo must be PNG/JPG/WEBP — SVG cannot be sent to the image model';
