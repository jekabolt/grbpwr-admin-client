import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignAsset,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
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
import Input from 'ui/components/input';
import { Section } from 'ui/components/section';
import { HeaderCount } from 'ui/components/section-header';
import Text from 'ui/components/text';

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
import { BENCH_CELL_STYLE, BENCH_FRAME_ASPECT, SlotCap } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { archivedRef, colorwayLabel } from '../colorway-picker';
import { ColourwayStrip } from '../colourway-strip';
import { EmptyState, Money, PlaceOrDrawCell } from '../core';
import { openStepOf, type StepId } from '../core/chain';
import { useElapsed, useRunPolling } from '../generation';
import { isRunLive } from '../generation/run-state';
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
  SILENT_SERVER_REASON,
  SLOT_WORDS_MAX,
  bindingsSpoken,
  boundAssetsByPair,
  colourIsStated,
  mintSlotName,
  pairKey,
  pairOfRun,
  shelfCeiling,
  swatchColour,
  withOwnHex,
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
  onGoStep: (step: StepId) => void;
  loading?: boolean;
};

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
  onGoStep,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  colorway?: common_AdminColorwayRef;
  slots: MaterialSlot[];
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
  // Manual clear/replace keeps the previous asset for undo, so every new picture needs shelf room.
  const hasRoom = room > 0;
  const roomReason = ceiling.full ? ceiling.reason : ROOM_REASON;
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
  const runInput = (slot: MaterialSlot, spec: Spec): StartRunInput => {
    const hardware = slot.family === 'hardware';
    const c = colourOf(slot, spec);
    const pictureIds = spec.pictures.map((m) => m.id ?? 0).filter((id) => id > 0);
    const words = hardware
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
        // Fabric: one texture picture at most; hardware: up to four references.
        extraInputMediaIds: pictureIds.slice(0, hardware ? REFS_MAX : 1),
        fixTargets: [],
        fixSlotIds: [],
        autoSplit: false,
        detailSlotIds: [],
        pattern: {
          repeatMm: 0,
          name: mintSlotName(band, cwName, slot.name),
          sourceAssetId: 0,
          mode: hardware ? 'hardware' : 'swatch',
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
  const place = async (slot: MaterialSlot, media: common_MediaFull) => {
    const mediaId = media.id ?? 0;
    if (mediaId <= 0 || cwId <= 0) return;
    const key = pairKey(cwId, slot.bomItemId);
    const prev = byPair.get(key);
    const prevId = wireInt(prev?.id);
    // The previous asset is deliberately kept for undo; replacement is therefore not room-neutral.
    if (!hasRoom) {
      showMessage(ceiling.full ? ceiling.reason : ROOM_REASON, 'error');
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
  const replaceTarget = useRef<MaterialSlot | null>(null);
  const replaceTrigger = useRef<HTMLButtonElement>(null);
  const replace = (slot: MaterialSlot) => {
    replaceTarget.current = slot;
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
  const pictureCount = selSpec?.pictures.length ?? 0;
  const summary = !selected
    ? ''
    : !selGate.ok
      ? selGate.reason
      : [
          `${selAsset ? 'remakes' : 'makes'} ${selected.name}`,
          selColour?.code ||
            selColour?.hex ||
            (selected.family === 'hardware' ? 'as material' : ''),
          selSpec?.words.trim() ?? '',
          pictureCount > 0 ? `${pictureCount} picture${pictureCount === 1 ? '' : 's'}` : '',
          wordsChanged ? 'words changed' : '',
        ]
          .filter(Boolean)
          .join(' · ');
  const emptyN = emptyRunnable.length;

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
                {/* Button-like cell: click (captured) or Enter/Space selects the slot. */}
                <div
                  role='button'
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`select ${slot.name}`}
                  className='w-full min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
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
                    full={!hasRoom}
                    fullReason={roomReason}
                    generateGate={gate}
                    onPick={() => pick(slot)}
                    onPlace={(m) => void place(slot, m)}
                    onReplace={() => replace(slot)}
                    onGenerate={() => {
                      pick(slot);
                      generate([slot]);
                    }}
                    onClear={() => clear(slot)}
                  />
                </div>
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
                    {selected.name} · {selected.family}
                  </Text>
                }
              >
                generate
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
              <Text
                size='micro'
                variant='label'
                component='p'
                className='mt-2 normal-case'
                data-fh-generate-summary=''
              >
                {summary}
              </Text>
              <GenerateRow
                gate={selGate}
                pending={run.isPending}
                onGenerate={() => generate([selected])}
                trailing={
                  <span className='flex flex-wrap items-center gap-2'>
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
                    {emptyN > 0 && (
                      <Button
                        variant='underline'
                        size='xs'
                        disabled={!emptyGate.ok}
                        title={
                          emptyGate.ok
                            ? 'makes every empty slot from its own words — fabrics in their colour, hardware as material'
                            : emptyGate.reason
                        }
                        onClick={() => generate(emptyBatch)}
                        data-fh-all-empty={emptyN}
                      >
                        all empty slots · {emptyN}
                      </Button>
                    )}
                  </span>
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
          const slot = replaceTarget.current;
          const first = media[0];
          if (slot && first?.id) void place(slot, first);
        }}
        trigger={<button ref={replaceTrigger} type='button' hidden aria-hidden tabIndex={-1} />}
      />
    </Section>
  );
}

type UndoEntry = { prevId: number; setTo: number };

/** A slot's spec: colour (Pantone code, '' = none), what it is made of, its input pictures. */
type Spec = { colourCode: string; words: string; pictures: common_MediaFull[] };

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
  const max = hardware ? REFS_MAX : 1;
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

  return (
    <div className='flex flex-col gap-2 pt-1.5' data-fh-inputs=''>
      <div className='flex flex-wrap items-start gap-2.5'>
        <div className={INPUT_CELL} data-fh-colour={colour?.code || colour?.hex || 'none'}>
          <PantonePicker
            name={`fh-colour-${colorwayId}-${slot.bomItemId}`}
            value={spec.colourCode}
            label={colour?.code || colour?.hex || (hardware ? 'as material' : '+ colour')}
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
              alt={`${slot.name} picture ${index + 1}`}
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
              purpose={`design · ${slot.name}`}
              multiple={room > 1}
              limit={room}
              disabled={disabled}
              onSelect={add}
            />
            <InputCaption />
          </div>
        )}
      </div>

      <div className='flex items-center gap-2'>
        <Text size='micro' variant='label' component='span' className='w-16 shrink-0'>
          {hardware ? 'material' : 'cloth'}
        </Text>
        <Input
          name={`fh-words-${slot.bomItemId}`}
          value={spec.words}
          maxLength={SLOT_WORDS_MAX}
          disabled={disabled}
          placeholder={hardware ? 'horn, black' : '100% cotton twill, 300 gsm'}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange({ ...spec, words: e.target.value })
          }
          data-fh-words=''
        />
      </div>
      {hardware && (
        <ChipRow className='pl-[72px]'>
          {MATERIAL_WORDS.map((word) => (
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
      )}
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
  onPlace,
  onReplace,
  onGenerate,
  onClear,
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
  onPlace: (media: common_MediaFull) => void;
  onReplace: () => void;
  onGenerate: () => void;
  onClear: () => void;
}): JSX.Element {
  const cap = (
    <SlotCap
      label={slot.name}
      title={[slot.name, slot.purposeLabel, slot.detail].filter(Boolean).join(' · ')}
      strong={selected}
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
        onPick={onPick}
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

  return (
    <PlaceOrDrawCell
      label={slot.name}
      aspect={BENCH_FRAME_ASPECT}
      mediaLabel='+ add'
      purpose={`design · ${slot.name}`}
      onSelect={onPlace}
      selected={selected}
      onPick={onPick}
      instead={
        !writable || full ? (
          <span title={full ? fullReason : undefined}>
            <Text size='micro' variant='uppercase' tracking='label' component='span'>
              empty
            </Text>
          </span>
        ) : undefined
      }
      backdrop={<TrimPictogramBackdrop slot={slot} />}
      quietDoor
      cap={cap}
      data-fh-empty={slot.bomItemId}
    />
  );
}

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
