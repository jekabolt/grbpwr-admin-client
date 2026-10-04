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
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Section } from 'ui/components/section';
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
import { BENCH_CELL_STYLE, BENCH_FRAME_ASPECT, InertDoor, SlotCap } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { archivedRef, colorwayLabel } from '../colorway-picker';
import { EmptyState, Money, PlaceOrDrawCell } from '../core';
import type { StepId } from '../core/chain';
import { useElapsed, useRunPolling } from '../generation';
import { isRunLive } from '../generation/run-state';
import { ImageSlots } from '../playground/fields/image-slots';
import { PictureTile } from '../picture-tile';
import { Swatch } from '../render/field-row';
import { RunRefusal } from '../render/generate-row';
import { archivedColorwayGate, type Gate } from '../render/model';
import { useStartDesignRun, type StartRunInput } from '../render/use-design-run';
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

/**
 * STEP 3 · FABRICS AND HARDWARE — two blocks:
 *   · `colourways` — chip row on the studio's one colourway axis (which colourway is on the bench);
 *   · `bench` — the generate inputs (colour + references) and one cell per material slot,
 *     grouped fabrics / hardware. GENERATE fires one run per slot; a cell takes an own picture too.
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
  /** Door to another tab of the card; absent on an auxiliary card. */
  onGoTab?: (tab: string) => void;
  onGoStep: (step: StepId) => void;
};

const REFS_MAX = 4;

export function FabricsHardware({
  band,
  techCardId,
  disabled,
  colorways,
  colorwayId,
  onColorwayChange,
  slots,
  onGoTab,
  onGoStep,
}: FabricsHardwareProps): JSX.Element {
  // One poll per step: live runs end on screen.
  useRunPolling(techCardId, band);

  const shown = colorways.filter(
    (c) => (c.colorwayId ?? 0) > 0 && (!archivedRef(c) || c.colorwayId === colorwayId),
  );

  return (
    <>
      <Section id='design-colourways' title='colourways' question='· which one is on the bench'>
        {shown.length === 0 ? (
          <EmptyState
            action={
              onGoTab ? (
                <Button
                  variant='secondary'
                  size='xs'
                  className='border-dashed'
                  onClick={() => onGoTab('colorways')}
                >
                  + colourway
                </Button>
              ) : undefined
            }
          >
            no colourways yet
          </EmptyState>
        ) : (
          <ChipRow className='gap-1.5'>
            {shown.map((c) => {
              const id = c.colorwayId ?? 0;
              const on = id === colorwayId;
              const name = colorwayLabel(c);
              return (
                <Chip
                  key={id}
                  selected={on}
                  pressed={on}
                  data-fh-colourway={id}
                  onClick={() => onColorwayChange(id)}
                  className='py-1'
                >
                  <Swatch hex={(c.devHex ?? '').trim()} size={10} />
                  {archivedRef(c) ? `${name} · archived` : name}
                </Chip>
              );
            })}
          </ChipRow>
        )}
      </Section>

      {shown.length > 0 && (
        <MaterialBench
          band={band}
          techCardId={techCardId}
          disabled={disabled}
          colorway={colorways.find((c) => (c.colorwayId ?? 0) === colorwayId && colorwayId > 0)}
          slots={slots}
          onGoStep={onGoStep}
        />
      )}
    </>
  );
}

/** Small uppercase field word of the generate row. */
function FieldWord({ children }: { children: string }): JSX.Element {
  return (
    <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
      {children}
    </Text>
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
  const run = useStartDesignRun(techCardId);
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

  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const mark = (key: string, on: boolean) =>
    setSaving((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  /* ─── gates ─── */
  const archivedGate = archivedColorwayGate(archived, cwName, 'fabrics and hardware');
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
    if (liveByPair.has(pairKey(cwId, slot.bomItemId))) {
      return { ok: false, reason: 'being made — it lands in the cell by itself' };
    }
    if (slot.family === 'fabric' && !colourIsStated(colour)) {
      return { ok: false, reason: 'a fabric is dyed from a colour · pick one' };
    }
    return { ok: true };
  };

  const runnable = slots.filter((s) => slotGate(s).ok);
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
      if (slotGate(slot).ok) run.start(runInput(slot, colourIsStated(colour) ? colour : null));
    }
  };

  /* ─── own pictures ─── */
  const place = async (slot: MaterialSlot, media: common_MediaFull) => {
    const mediaId = media.id ?? 0;
    if (mediaId <= 0 || cwId <= 0) return;
    if ((band.assets ?? []).length >= ASSETS_PER_CARD_MAX) {
      showMessage(ceiling.reason, 'error');
      return;
    }
    const key = pairKey(cwId, slot.bomItemId);
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
      }
    } catch {
      // The write hooks already said what went wrong.
    } finally {
      mark(key, false);
    }
  };

  const clear = (slot: MaterialSlot) => {
    const key = pairKey(cwId, slot.bomItemId);
    mark(key, true);
    binds.setBinding.mutate(
      { colorwayId: cwId, bomItemId: slot.bomItemId, assetId: 0 },
      { onSettled: () => mark(key, false) },
    );
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

  const generateTitle =
    allGate.ok && skippedFabrics > 0
      ? `no colour — ${skippedFabrics} fabric slot${skippedFabrics === 1 ? '' : 's'} skipped`
      : `one run per slot · ${runnable.length} slot${runnable.length === 1 ? '' : 's'}`;

  const group = (title: string, list: MaterialSlot[]) =>
    list.length === 0 ? null : (
      <div className='min-w-0' data-fh-group={title}>
        <GroupLabel flush>{`${title} · ${dressed(list)} of ${list.length}`}</GroupLabel>
        <div className='flex flex-wrap items-start gap-2.5 pt-1.5'>
          {list.map((slot) => {
            const key = pairKey(cwId, slot.bomItemId);
            const gate = slotGate(slot);
            return (
              <div key={slot.bomItemId} style={BENCH_CELL_STYLE} data-fh-slot={slot.bomItemId}>
                <SlotCell
                  slot={slot}
                  asset={cwId > 0 ? byPair.get(key) : undefined}
                  liveRun={cwId > 0 ? liveByPair.get(key) : undefined}
                  saving={saving.has(key)}
                  writable={writable}
                  full={ceiling.full}
                  fullReason={ceiling.reason}
                  generateGate={gate}
                  onPlace={(m) => void place(slot, m)}
                  onReplace={() => replace(slot)}
                  onGenerate={() => generate([slot])}
                  onClear={() => clear(slot)}
                />
              </div>
            );
          })}
        </div>
      </div>
    );

  return (
    <Section
      id='design-pattern'
      title='bench'
      question={cwName ? `· ${cwName}` : '· no colourway'}
      action={
        <>
          <Money data-probe='run-price' />
          {allGate.ok ? (
            <Button
              variant='main'
              size='sm'
              disabled={run.isPending}
              title={generateTitle}
              onClick={() => generate(slots)}
              data-fh-generate='live'
            >
              {run.isPending ? 'starting…' : 'generate'}
            </Button>
          ) : (
            <InertDoor label='generate' reason={allGate.reason} size='sm' />
          )}
        </>
      }
    >
      {slots.length === 0 ? (
        <EmptyState
          action={
            <Button variant='secondary' size='xs' onClick={() => onGoStep('mood')}>
              moodboard ›
            </Button>
          }
        >
          no materials yet
        </EmptyState>
      ) : (
        <>
          <div className='flex flex-wrap items-start gap-x-6 gap-y-3' data-fh-inputs=''>
            <div
              className='flex items-center gap-2'
              data-fh-colour={colour?.code || colour?.hex || 'none'}
            >
              <FieldWord>colour</FieldWord>
              {inherited && colour?.hex && <Swatch hex={colour.hex} size={14} />}
              <PantonePicker
                name={`fh-colour-${cwId}`}
                value={pickerValue}
                label={inherited ? 'colourway colour' : '+ pantone'}
                suggested={ownPantone ? [{ code: ownPantone, label: `${cwName} · colourway` }] : []}
                disabled={disabled}
                onPick={(code) => setPicked({ key: benchKey, code: code.trim() })}
              />
            </div>
            <div className='flex items-start gap-2' data-fh-refs={refs.length}>
              <span className='pt-0.5'>
                <FieldWord>{`references ${refs.length}/${REFS_MAX}`}</FieldWord>
              </span>
              <ImageSlots
                mode='grow'
                max={REFS_MAX}
                band={band}
                techCardId={techCardId}
                purpose='design · references for fabrics and hardware'
                disabled={disabled}
                value={refs}
                onChange={(list) => setRefsDraft({ card: techCardId, list })}
              />
            </div>
          </div>

          {group('fabrics', fabrics)}
          {group('hardware', hardware)}

          <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />
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

  if (liveRun || saving) {
    return (
      <PlaceOrDrawCell
        label={slot.name}
        aspect={BENCH_FRAME_ASPECT}
        purpose=''
        instead={
          liveRun ? (
            <LiveWord startedAt={liveRun.startedAt ?? liveRun.createdAt ?? ''} word='making…' />
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
      cap={cap}
      data-fh-empty={slot.bomItemId}
    />
  );
}
