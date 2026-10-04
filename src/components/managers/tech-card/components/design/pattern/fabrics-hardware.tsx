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
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { PLACEHOLDER_SURFACE } from 'ui/components/placeholder';
import GenericPopover from 'ui/components/popover';
import { Section } from 'ui/components/section';
import { HeaderCount } from 'ui/components/section-header';
import Text from 'ui/components/text';

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
import { ColourwayCreatePopover } from '../colourway-create';
import { ColourwayStrip } from '../colourway-strip';
import { EmptyState, Money, PlaceOrDrawCell } from '../core';
import type { StepId } from '../core/chain';
import { useElapsed, useRunPolling } from '../generation';
import { isRunLive } from '../generation/run-state';
import { ReuseDoor } from '../playground/fields/reuse';
import { PictureTile } from '../picture-tile';
import { GenerateRow, RunRefusal } from '../render/generate-row';
import { archivedColorwayGate, mediaThumb, type Gate } from '../render/model';
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
  bindingsSpoken,
  boundAssetsByPair,
  colourIsStated,
  mintSlotName,
  pairKey,
  pairOfRun,
  rowColour,
  shelfCeiling,
  type MaterialSlot,
  type SwatchColour,
} from './slot-fabrics';
import { TrimPictogramBackdrop } from './trim-pictograms';

/**
 * STEP 3 · MATERIALS — two blocks:
 *   · `colourways` — large swatch tiles on the studio's one colourway axis;
 *   · `materials` — one cell per material slot, then the equal-size generate inputs and action.
 * GENERATE fires one run per slot; a cell takes an own picture too.
 * A run lands server-side and binds itself to (colourway, slot); an own picture is
 * UpsertDesignAsset → SetDesignAssetBinding.
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
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Section id='design-colourways' title='colourways' question='· material packs'>
        <ColourwayStrip
          colorways={shown}
          selectedId={colorwayId}
          onSelect={onColorwayChange}
          onCreate={() => setCreating(true)}
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

      <ColourwayCreatePopover
        techCardId={techCardId}
        open={creating}
        onOpenChange={setCreating}
        readOnly={disabled}
        onCreated={onColorwayChange}
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

  // Local drafts keyed by card (+ colourway for the colour): a switch drops them without an effect.
  const benchKey = `${techCardId}:${cwId}`;
  const [picked, setPicked] = useState<{ key: string; code: string } | null>(null);
  const pickCode = picked?.key === benchKey ? picked.code : undefined;
  const [refsDraft, setRefsDraft] = useState<{ card: number; list: common_MediaFull[] }>({
    card: techCardId,
    list: [],
  });
  const refs = refsDraft.card === techCardId ? refsDraft.list : [];

  const ownPantone = (colorway?.pantone ?? '').trim();
  const ownHex = (colorway?.devHex ?? '').trim();
  const colour = rowColour(pickCode, {
    pantone: ownPantone,
    color: ownHex,
    colorSource: ownHex ? 'colourway' : '',
    recipePantone: '',
  });
  const pickerValue = pickCode ?? ownPantone;
  const inherited = !pickerValue.trim() && !!colour;

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
  const [undoState, setUndoState] = useState<{
    card: number;
    pairs: ReadonlyMap<string, number>;
  }>({ card: techCardId, pairs: new Map() });
  if (undoState.card !== techCardId) {
    setUndoState({ card: techCardId, pairs: new Map() });
  }
  const undos = undoState.card === techCardId ? undoState.pairs : new Map<string, number>();
  const rememberUndo = (key: string, assetId: number) => {
    if (assetId <= 0) return;
    setUndoState((prev) => ({
      card: techCardId,
      pairs: new Map(prev.card === techCardId ? prev.pairs : []).set(key, assetId),
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
              : pantonePending && colour?.code.trim() && !colour.hex.trim()
                ? { ok: false, reason: PANTONE_LOADING_REASON }
                : { ok: true };

  const slotGate = (slot: MaterialSlot): Gate => {
    if (!baseGate.ok) return baseGate;
    const k = pairKey(cwId, slot.bomItemId);
    if (liveByPair.has(k) || launching.has(k)) {
      return { ok: false, reason: 'being made — it lands in the cell by itself' };
    }
    if (slot.family === 'fabric' && !colourIsStated(colour)) {
      return { ok: false, reason: 'a fabric is dyed from a colour · pick one' };
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

  const runnable = slots.filter((s) => slotGate(s).ok);
  // Empty slots first: with any empty, GENERATE fills only those; all dressed → regenerate all.
  const emptyRunnable = runnable.filter((s) => !byPair.has(pairKey(cwId, s.bomItemId)));
  const pool = (emptyRunnable.length > 0 ? emptyRunnable : runnable)
    .slice()
    .sort((a, b) => (a.family === b.family ? 0 : a.family === 'fabric' ? -1 : 1));
  const batch = pool.slice(0, Math.max(0, room));
  const capped = batch.length < pool.length;
  const skippedFabrics = baseGate.ok
    ? slots.filter(
        (s) =>
          s.family === 'fabric' &&
          !colourIsStated(colour) &&
          !liveByPair.has(pairKey(cwId, s.bomItemId)),
      ).length
    : 0;
  const allGate: Gate = !baseGate.ok
    ? baseGate
    : slots.length === 0
      ? { ok: false, reason: 'no material slots on this card' }
      : runnable.length === 0
        ? skippedFabrics > 0
          ? { ok: false, reason: 'a fabric is dyed from a colour · pick one' }
          : { ok: false, reason: 'every slot is being made' }
        : launching.size > 0
          ? { ok: false, reason: 'starting — wait for the runs already sent' }
          : batch.length === 0
            ? { ok: false, reason: ROOM_REASON }
            : { ok: true };

  /* ─── runs ─── */
  const runInput = (slot: MaterialSlot, c: SwatchColour | null): StartRunInput => {
    const hardware = slot.family === 'hardware';
    const refIds = refs.map((m) => m.id ?? 0).filter((id) => id > 0);
    return {
      kind: 'pattern',
      ask: '',
      params: {
        views: [],
        colorwayId: cwId,
        layout: '',
        colour: {
          source: '',
          code: c?.code ?? '',
          hex: c?.hex ?? '',
          words: [c?.words ?? '', slot.words].filter(Boolean).join(' · '),
          fabricMediaId: 0,
          fabrics: [],
          colourMaps: [],
        },
        threed: undefined,
        fixTarget: '',
        // Fabric: one texture picture at most; hardware: every reference.
        extraInputMediaIds: hardware ? refIds.slice(0, REFS_MAX) : refIds.slice(0, 1),
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

  const generate = (list: MaterialSlot[]) => {
    for (const slot of list) {
      if (!slotGate(slot).ok) continue;
      const key = pairKey(cwId, slot.bomItemId);
      let id = '';
      run.start(runInput(slot, colourIsStated(colour) ? colour : null), {
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
    mark(key, true);
    try {
      const res = await writes.upsertAsset.mutateAsync({
        assetId: 0,
        kind: slot.family === 'hardware' ? ASSET_HARDWARE : ASSET_FABRIC,
        name: mintSlotName(band, cwName, slot.name),
        mediaId,
      });
      const assetId = wireInt(res.asset?.id);
      if (assetId > 0) {
        await binds.setBinding.mutateAsync({
          colorwayId: cwId,
          bomItemId: slot.bomItemId,
          assetId,
        });
        if (prevId !== assetId) rememberUndo(key, prevId);
      }
    } catch {
      // The write hooks already said what went wrong. A picture made for a failed binding stays on
      // the shelf: a lost response may still have committed the binding.
    } finally {
      mark(key, false);
    }
  };

  const clear = (slot: MaterialSlot) => {
    const key = pairKey(cwId, slot.bomItemId);
    const prevId = wireInt(byPair.get(key)?.id);
    if (prevId <= 0) return;
    const colorwayId = cwId;
    mark(key, true);
    binds.setBinding
      .mutateAsync({ colorwayId, bomItemId: slot.bomItemId, assetId: 0 })
      .then(() => rememberUndo(key, prevId))
      .catch(() => {})
      .finally(() => mark(key, false));
  };

  const undo = (slot: MaterialSlot, assetId: number) => {
    const key = pairKey(cwId, slot.bomItemId);
    mark(key, true);
    binds.setBinding
      .mutateAsync({ colorwayId: cwId, bomItemId: slot.bomItemId, assetId })
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

  const fabricN = batch.filter((slot) => slot.family === 'fabric').length;
  const hardwareN = batch.length - fabricN;
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const breakdown = [
    fabricN > 0 ? count(fabricN, 'fabric') : '',
    hardwareN > 0 ? count(hardwareN, 'hardware', 'hardware') : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const colourWord = colourIsStated(colour) ? colour.code || colour.hex : '';
  const generateSummary =
    batch.length === 0
      ? skippedFabrics > 0
        ? 'fabrics need a colour'
        : allGate.ok
          ? 'nothing to make'
          : allGate.reason
      : [
          emptyRunnable.length > 0
            ? `makes ${count(batch.length, 'picture')}${breakdown ? `: ${breakdown}` : ''}`
            : `remakes all ${batch.length}`,
          fabricN > 0 && colourWord ? `in ${colourWord}` : '',
          skippedFabrics > 0 ? 'fabrics need a colour' : '',
          capped ? 'shelf limit' : '',
        ]
          .filter(Boolean)
          .join(' · ');

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
            const undoAssetId = undos.get(key) ?? 0;
            return (
              <div
                key={slot.bomItemId}
                style={BENCH_CELL_STYLE}
                className='flex min-w-0 flex-col items-start gap-1'
                data-fh-slot={slot.bomItemId}
              >
                <SlotCell
                  slot={slot}
                  asset={current}
                  liveRun={cwId > 0 ? liveByPair.get(key) : undefined}
                  saving={saving.has(key)}
                  launching={launching.has(key)}
                  writable={writable}
                  full={!hasRoom}
                  fullReason={roomReason}
                  generateGate={gate}
                  onPlace={(m) => void place(slot, m)}
                  onReplace={() => replace(slot)}
                  onGenerate={() => generate([slot])}
                  onClear={() => clear(slot)}
                />
                {undoAssetId > 0 && (
                  <Button
                    variant='underline'
                    size='xs'
                    disabled={saving.has(key)}
                    title='restore the previous picture'
                    onClick={() => undo(slot, undoAssetId)}
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

          <div data-fh-generate={allGate.ok ? 'live' : 'inert'}>
            <GroupLabel>generate</GroupLabel>
            <GenerateInputs
              band={band}
              techCardId={techCardId}
              disabled={disabled}
              colorwayId={cwId}
              colorwayName={cwName}
              ownPantone={ownPantone}
              pickerValue={pickerValue}
              colour={colour}
              inherited={inherited}
              refs={refs}
              onPickColour={(code) => setPicked({ key: benchKey, code: code.trim() })}
              onRefsChange={(list) => setRefsDraft({ card: techCardId, list })}
            />
            <Text
              size='micro'
              variant='label'
              component='p'
              className='mt-2 normal-case'
              data-fh-generate-summary=''
            >
              {generateSummary}
            </Text>
            <GenerateRow
              gate={allGate}
              pending={run.isPending}
              onGenerate={() => generate(batch)}
              trailing={<Money data-probe='run-price' />}
            />
          </div>

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

const INPUT_CELL = 'w-24 shrink-0';

function InputCaption({ children }: { children?: string }): JSX.Element {
  return (
    <Text size='micro' variant='label' component='span' className='block h-4 w-full truncate'>
      {children || '\u00a0'}
    </Text>
  );
}

/** Equal-size visual inputs for the one batch action: colour plus up to four shape/texture looks. */
function GenerateInputs({
  band,
  techCardId,
  disabled,
  colorwayId,
  colorwayName,
  ownPantone,
  pickerValue,
  colour,
  inherited,
  refs,
  onPickColour,
  onRefsChange,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  colorwayId: number;
  colorwayName: string;
  ownPantone: string;
  pickerValue: string;
  colour: SwatchColour | null;
  inherited: boolean;
  refs: common_MediaFull[];
  onPickColour: (code: string) => void;
  onRefsChange: (list: common_MediaFull[]) => void;
}): JSX.Element {
  const { showMessage } = useSnackBarStore();
  const room = Math.max(0, REFS_MAX - refs.length);
  const taken = refs.map((media) => media.id ?? 0).filter((id) => id > 0);
  const add = (incoming: common_MediaFull[]) => {
    const have = new Set(taken);
    const fresh = incoming.filter((media) => (media.id ?? 0) > 0 && !have.has(media.id ?? 0));
    const kept = fresh.slice(0, room);
    if (fresh.length > kept.length) {
      showMessage(
        `took ${kept.length} of ${fresh.length}: looks hold ${REFS_MAX} at most`,
        'error',
      );
    }
    if (kept.length > 0) onRefsChange([...refs, ...kept]);
  };

  return (
    <div className='flex flex-wrap items-start gap-2.5 pt-1.5' data-fh-inputs=''>
      <div
        className={INPUT_CELL}
        data-fh-colour={colour?.code || colour?.hex || 'none'}
        title={inherited ? 'colourway colour' : undefined}
      >
        <PantonePicker
          name={`fh-colour-${colorwayId}`}
          value={pickerValue}
          label={colour?.code || colour?.hex || '+ colour'}
          previewHex={colour?.hex}
          suggested={ownPantone ? [{ code: ownPantone, label: `${colorwayName} · colourway` }] : []}
          disabled={disabled}
          tile
          onPick={onPickColour}
        />
      </div>

      <div className='contents' data-fh-looks={refs.length}>
        {refs.map((media, index) => (
          <div key={media.id ?? index} className={INPUT_CELL} data-fh-look={index + 1}>
            <PictureTile
              url={mediaThumb(media)}
              alt={`look ${index + 1}`}
              aspect='1/1'
              fit='cover'
              className='w-full bg-bgColor'
              onRemove={
                disabled
                  ? undefined
                  : {
                      onClick: () => onRefsChange(refs.filter((_, at) => at !== index)),
                      ariaLabel: `remove look ${index + 1}`,
                      title: 'remove picture',
                    }
              }
            />
            <InputCaption>{index === 0 ? 'shape & texture' : undefined}</InputCaption>
          </div>
        ))}

        {room > 0 && (
          <div className={INPUT_CELL} data-fh-look-door=''>
            <GenericPopover
              title='add look'
              noTail
              className='w-40'
              contentProps={{ align: 'start', side: 'bottom', sideOffset: 4 }}
              triggerProps={{
                disabled,
                'aria-label': 'add a shape and texture picture',
                className:
                  'flex w-full items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              }}
              openElement={
                <span
                  style={PLACEHOLDER_SURFACE}
                  className='flex aspect-square w-full items-center justify-center border border-dashed border-borderColor text-labelColor hover:border-textColor hover:text-textColor'
                >
                  <Text size='micro' variant='uppercase' tracking='label' component='span'>
                    + picture
                  </Text>
                </span>
              }
            >
              <div className='flex flex-col gap-1.5'>
                <MediaSelector
                  label='picture library'
                  purpose='design · shape and texture look'
                  aspectRatio={['Custom']}
                  allowMultiple
                  showVideos={false}
                  saveSelectedMedia={add}
                  trigger={
                    <Button variant='secondary' size='sm' className='w-full'>
                      picture library
                    </Button>
                  }
                />
                <ReuseDoor
                  band={band}
                  techCardId={techCardId}
                  room={room}
                  taken={taken}
                  label='reuse picture'
                  disabled={disabled}
                  onPick={add}
                />
              </div>
            </GenericPopover>
            <InputCaption>{refs.length === 0 ? 'shape & texture' : undefined}</InputCaption>
          </div>
        )}
      </div>
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
  liveRun,
  saving,
  launching,
  writable,
  full,
  fullReason,
  generateGate,
  onPlace,
  onReplace,
  onGenerate,
  onClear,
}: {
  slot: MaterialSlot;
  asset?: common_DesignAsset;
  liveRun?: common_DesignRun;
  saving: boolean;
  launching: boolean;
  writable: boolean;
  full: boolean;
  fullReason: string;
  generateGate: Gate;
  onPlace: (media: common_MediaFull) => void;
  onReplace: () => void;
  onGenerate: () => void;
  onClear: () => void;
}): JSX.Element {
  const cap = (
    <SlotCap
      label={slot.name}
      title={[slot.name, slot.purposeLabel, slot.detail].filter(Boolean).join(' · ')}
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

  const url = asset ? assetFull(asset) : '';
  if (asset) {
    const label = assetLabel(asset);
    const hardware = slot.family === 'hardware';
    return (
      <div className='group flex min-w-0 flex-col overflow-hidden border border-textColor'>
        <PictureTile
          url={url}
          alt={label}
          aspect={BENCH_FRAME_ASPECT}
          fit={hardware ? 'contain' : 'cover'}
          ground={hardware ? 'neutral' : undefined}
          className='border-0'
          gallery={
            url
              ? { src: url, thumbnail: assetThumb(asset) || url, type: 'image', alt: label }
              : undefined
          }
          menu={
            writable
              ? {
                  label: 'more',
                  ariaLabel: `more for ${slot.name}`,
                  items: [
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
                  ],
                  onPick: (v) =>
                    v === 'replace' ? onReplace() : v === 'generate' ? onGenerate() : onClear(),
                  'data-menu': `fh:${slot.bomItemId}`,
                }
              : undefined
          }
        />
        {cap}
      </div>
    );
  }

  return (
    <PlaceOrDrawCell
      label={slot.name}
      aspect={BENCH_FRAME_ASPECT}
      mediaLabel='+ add'
      purpose={`design · ${slot.name}`}
      onSelect={onPlace}
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
      cap={cap}
      data-fh-empty={slot.bomItemId}
    />
  );
}
