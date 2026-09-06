import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { ViewSwitch } from 'ui/components/view-switch';

import { InertDoor } from '../bench-slot';
import { Counter } from '../core';
import { useCardFit, useThreedDraft } from './drafts';
import { GenerateRow, LockBar, RunRefusal } from './generate-row';
import {
  benchSides,
  PRESENTATIONS,
  fitChoices,
  threedGate,
  threedRunViews,
  threedSides,
  turntableSourceIds,
  type Gate,
  type Presentation,
} from './model';
import { BodyPicker } from './model-picker';
import { OutputsSection } from './outputs';
import { RendersByViewGroup } from './side-row';
import { useStartDesignRun } from './use-design-run';
import { WhatModelGetsRenderModal } from './what-model-gets';

/**
 * THE 3D STUDIO — step 5 of the chain, as the prototype draws it (`_step-3d.js`):
 *
 *   3D · one model of this card                                                      [STEP 5]
 *   ── INPUT · RENDERS BY VIEW ── the render bench, read only, a door back on every empty side
 *   ── GENERATION ──── [1 MODEL · FROM N SIDES]
 *      PRESENTATION  in the air | on a model    no figure · the garment stands alone
 *      (on a model)  THE BODY: build chips + model tiles · GARMENT SIZE *
 *      FIT  select · [REGULAR FROM THE CARD]
 *      LOCKED …  · FILL THE EMPTY SIDES ›
 *      GENERATE · priced by the server on start · WHAT THE MODEL GETS ▸
 *   3D MODELS OF THIS CARD · built here or brought — the shelf, and BRING YOUR OWN (`./outputs`)
 *
 * 3D IS BUILT FROM THE RENDERS, NOT FROM THE DRAWINGS: the input lists the RENDER bench by view,
 * and a filled render slot IS the side's membership in the run — there is no mark to set here
 * (`sides.filter(s => s.picture)`). The bench is the SAME one the server assembles from
 * (`designSelectBench`), keyed by the studio's one colourway number.
 *
 * ⚠ ONE SIDE IS REQUIRED — THE FRONT (K-10/K-11): `multi-view-to-3d` builds a volume out of views,
 * and the provider's free refusal lands on a missing front alone. The other sides make the volume
 * better and are named as encouragement, not as a condition.
 *
 * TWO PRESENTATIONS, and the body is never mandatory: a card starts from the garment, not from a
 * figure. In the air there is no body row and no size row, and neither of their gates. Switching
 * the presentation does not wipe the body and the size — they stay in the draft and are simply not
 * read in the air, by the screen, the inventory or the gate.
 *
 * LOCKED IS A STATE OF THE SCREEN, NOT ITS ABSENCE: the reason of a dead GENERATE is a visible bar
 * with its door, never a `title` alone.
 */

/** Radix forbids an empty item value, so every «nothing chosen» option here is a sentinel. */
const CARD_FIT = '__card__';
const NO_SIZE = '__nosize__';

export function ThreedStudio({
  band,
  techCardId,
  disabled,
  onGoToKind,
  colorwayId = 0,
  colorwayLabel = '',
  colorwayArchived = false,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** Switch the studio to another step — the doors of the lock bar and of the empty sides. */
  onGoToKind?: (kind: 'flat' | 'render') => void;
  /**
   * THE BENCH BEING BUILT — one number for the whole studio (`useColorwayChoice`). It addresses the
   * bench the SERVER reads (`designSelectBench`) and the set the door opens on (`no_fabric_render`).
   */
  colorwayId?: number;
  /** Its human name; `''` under `no colourway` — the refusals say so in words. */
  colorwayLabel?: string;
  /** ⚠ Read by the GATE only: reading and the input strip work under an archived colourway. */
  colorwayArchived?: boolean;
}): JSX.Element {
  const { draft, patch } = useThreedDraft();
  const cardFit = useCardFit();
  const { dictionary } = useDictionary();
  const { data: models, isLoading: modelsLoading } = useAllModels();
  const run = useStartDesignRun(techCardId);
  /** The prompt inventory. A modal is its own surface, so it is mounted beside the blocks. */
  const [inspecting, setInspecting] = useState(false);

  const sides = useMemo(() => threedSides(band, colorwayId), [band, colorwayId]);

  const sizes = dictionary?.sizes ?? [];
  const sizeName = (id: number) =>
    (sizes.find((s) => s.id === id)?.name ?? '').trim() || (id ? `size ${id}` : '');

  /** The refusal over the INPUT — the render bench and the colourway; an obstacle of the chain. */
  const input: Gate = useMemo(
    () => threedGate(band, colorwayId, colorwayLabel, colorwayArchived),
    [band, colorwayId, colorwayLabel, colorwayArchived],
  );

  /** The whole gate — the input first, then the screen's OWN questions (body, size). */
  const gate: Gate = useMemo(() => {
    if (!input.ok) return input;
    if (draft.presentation === 'model') {
      // ONE QUESTION — «on what body» — answerable by EITHER half: a named model, or a build.
      if (!draft.modelId && !draft.bodyType) {
        return {
          ok: false,
          reason:
            'say what body it sits on · pick one of our models, or name a build; or turn it in the air instead',
        };
      }
      if (!draft.garmentSizeId) {
        return {
          ok: false,
          reason: 'pick which garment size sits on that body · a fit on a figure has to name one',
        };
      }
    }
    return { ok: true };
  }, [input, draft.presentation, draft.modelId, draft.bodyType, draft.garmentSizeId]);

  /** WHAT IS BOUGHT — in sides, not frames (K-11): one volume, built from the standing sides. */
  const marked = useMemo(() => threedRunViews(sides), [sides]);
  const shape =
    marked.length === 0
      ? '1 model · nothing came back yet'
      : `1 model · from ${marked.length} ${marked.length === 1 ? 'side' : 'sides'}`;

  const fitOptions = useMemo(() => fitChoices(cardFit), [cardFit]);
  const fitStated = (cardFit ?? '').trim();
  const fitDiffers = !!draft.fitOverride && draft.fitOverride !== fitStated;

  const named = !!draft.modelId || !!draft.bodyType;
  const modelCount = (models ?? []).filter((m) => (m.id ?? 0) > 0).length;

  const generate = () => {
    const sourcePictureIds = turntableSourceIds(sides);
    // The gate already refuses an incomplete set; this is the second, cheap guard.
    if (!sourcePictureIds.length) return;
    run.start({
      kind: 'threed',
      ask: '',
      params: {
        // ONLY THE STANDING SIDES: `views` is frozen in the history as «what was asked».
        views: marked,
        detailSlotIds: [],
        // THE COLOURWAY OF THE BUILD (L-3): the server reads ONLY this colourway's render bench.
        colorwayId,
        layout: '',
        colour: undefined,
        threed: {
          // EXPLICIT ZERO — «not said» (K-11): nobody turns the garment by 12 frames any more.
          frames: 0,
          presentation: draft.presentation,
          modelId: draft.presentation === 'model' ? draft.modelId : 0,
          garmentSizeId: draft.presentation === 'model' ? draft.garmentSizeId : 0,
          fitOverride: draft.fitOverride,
          // THE BUILD IS A PERSON'S CHOICE, NOT A STUB (V-15): '' reads as «not said».
          bodyType: draft.presentation === 'model' ? draft.bodyType : '',
          sourcePictureIds,
        },
        fixTarget: '',
        extraInputMediaIds: [],
        fixTargets: [],
        fixSlotIds: [],
        autoSplit: false,
        pattern: undefined,
        useFlatSlots: false,
        flatSlotIds: [],
      },
    });
  };

  /* THE DOOR OF THE LOCKED BAR — where the refusal is FIXED. The input refusals point at another
     step; the screen's own (body, size) are fixed a few rows up, and a door there would point at
     an organ a centimetre away. `colourway` — the exit is the select on the rail. */
  const lockDoors = (() => {
    if (gate.ok || input.ok) return null;
    if (!onGoToKind) {
      return (
        <InertDoor
          label='fill the empty sides ›'
          reason='the way out is the rail above — FABRIC RENDER colours a side and puts it into a slot'
        />
      );
    }
    switch (input.ok ? undefined : input.next) {
      case 'render':
        return (
          <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
            fill the empty sides ›
          </Button>
        );
      case 'front-slot':
        return (
          <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
            put a render into front ›
          </Button>
        );
      case 'refill':
        return (
          <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
            re-fill the odd sides ›
          </Button>
        );
      case 'flat':
        /* The mockup's one door — FILL THE EMPTY SIDES › — and the flat bench only when it is
           empty too: a card with flats drawn has nothing to generate on FLAT, and a door that
           says so would send the person a step back for nothing. */
        return (
          <>
            {benchSides(band, 'flat', 0).every((side) => !side.picture) && (
              <Button variant='secondary' size='xs' onClick={() => onGoToKind('flat')}>
                the flat bench ›
              </Button>
            )}
            <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
              fill the empty sides ›
            </Button>
          </>
        );
      case 'colourway':
        return null;
      default:
        return (
          <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
            fill the empty sides ›
          </Button>
        );
    }
  })();

  return (
    <>
      <Section
        id='design-threed-generation'
        title='3d'
        question='· one model of this card'
        action={<Pill tone='ink'>step 5</Pill>}
      >
        {/* ═══ INPUT · RENDERS BY VIEW — a READING of the render bench; every empty cell is a
            door back to FABRIC RENDER, where a side is filled. */}
        <RendersByViewGroup band={band} colorwayId={colorwayId} onGoToKind={onGoToKind} />

        {/* ═══ GENERATION ═══════════════════════════════════════════════════════════════════ */}
        <GroupLabel
          action={
            <Pill tone='ink' data-threed-shape=''>
              {shape}
            </Pill>
          }
        >
          generation
        </GroupLabel>

        <div className='flex flex-wrap items-center gap-2' data-presentation=''>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='uppercase'
          >
            presentation
          </Text>
          {/* A SEGMENTED STRIP, NOT A SELECT: both options on screen at all times. */}
          <ViewSwitch<Presentation>
            className='shrink-0'
            label='presentation'
            value={draft.presentation}
            disabled={disabled}
            options={PRESENTATIONS.map((p) => ({ value: p.value, label: p.label }))}
            onChange={(next) => patch({ presentation: next })}
          />
          <Text size='micro' variant='label' component='span' className='ml-auto normal-case'>
            {draft.presentation === 'model'
              ? 'a figure wears it · say whose body, or what build, below'
              : 'no figure · the garment stands alone'}
          </Text>
        </div>

        {/* THE BODY AND THE SIZE ONLY ON «ON A MODEL»: a figure picker for a figure that is not in
            the picture is an organ without an act. */}
        {draft.presentation === 'model' && (
          <>
            <GroupLabel
              action={
                <span className='flex flex-wrap items-center gap-1.5'>
                  {named ? <Pill tone='ink'>named</Pill> : <Pill>not named yet</Pill>}
                  <Counter n={modelCount} noun='model' />
                </span>
              }
            >
              the body
            </GroupLabel>
            <BodyPicker
              models={models}
              loading={modelsLoading}
              modelId={draft.modelId}
              bodyType={draft.bodyType}
              sizeName={sizeName}
              disabled={disabled}
              onModel={(id) => patch({ modelId: id })}
              onBodyType={(value) => patch({ bodyType: value })}
            />
            <div className='flex flex-wrap items-center gap-2' data-garment-size=''>
              <Text
                size='micro'
                variant='label'
                tracking='label'
                component='span'
                className='uppercase'
              >
                garment size <span className='font-bold text-textColor'>*</span>
              </Text>
              <div className='w-[160px] shrink-0'>
                <SelectComponent
                  name='design-threed-size'
                  value={draft.garmentSizeId ? String(draft.garmentSizeId) : NO_SIZE}
                  placeholder='not set'
                  disabled={disabled}
                  items={[
                    { value: NO_SIZE, label: 'not set' },
                    ...sizes
                      .filter((s) => (s.id ?? 0) > 0)
                      .map((s) => ({
                        value: String(s.id),
                        label: (s.name ?? '').trim() || `size ${s.id}`,
                      })),
                  ]}
                  onValueChange={(value: string) =>
                    patch({ garmentSizeId: value === NO_SIZE ? 0 : Number(value) || 0 })
                  }
                  fullWidth
                />
              </div>
              <Text size='micro' variant='label' component='span' className='normal-case'>
                this garment size on that body · free to try, changes nothing on the card
              </Text>
            </div>
          </>
        )}

        {/* FIT — in both presentations: the garment hangs in the air and sits on a figure equally
            cut. The override is a STATED DEVIATION for this run only; the card stays the truth. */}
        <div className='flex flex-wrap items-center gap-2' data-fit=''>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='uppercase'
          >
            fit
          </Text>
          <div className='w-[210px] shrink-0'>
            <SelectComponent
              name='design-threed-fit'
              value={draft.fitOverride || CARD_FIT}
              placeholder='not set'
              disabled={disabled}
              items={[
                { value: CARD_FIT, label: fitStated ? `${fitStated} · from the card` : 'not set' },
                ...fitOptions.map((fit) => ({ value: fit, label: fit })),
              ]}
              onValueChange={(value: string) =>
                patch({ fitOverride: value === CARD_FIT ? '' : value })
              }
              fullWidth
            />
          </div>
          {fitDiffers ? (
            <Pill tone='attention' title='the result will carry the badge; the card is not changed'>
              differs from the card
            </Pill>
          ) : fitStated ? (
            <Pill tone='ink'>{fitStated} from the card</Pill>
          ) : (
            <Pill>the card does not name a fit</Pill>
          )}
        </div>

        {/* ═══ THE RUN DOORS — the LOCKED bar with its door, the server's last refusal verbatim,
            then GENERATE · money · WHAT THE MODEL GETS ▸ (one row on every generative screen). */}
        {!gate.ok && <LockBar reason={`locked · ${gate.reason}`}>{lockDoors}</LockBar>}
        <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />
        <GenerateRow
          gate={gate}
          shape={shape}
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
        />
      </Section>

      {/* ═══ 3D MODELS OF THIS CARD · built here or brought — the shelf and BRING YOUR OWN. */}
      <OutputsSection
        band={band}
        techCardId={techCardId}
        kind='threed'
        disabled={disabled}
        colorwayId={colorwayId}
        colorwayLabel={colorwayLabel}
      />

      <WhatModelGetsRenderModal
        open={inspecting}
        onOpenChange={setInspecting}
        band={band}
        kind='threed'
        threed={draft}
        cardFit={cardFit}
        models={models}
        sizeName={sizeName}
        colorwayId={colorwayId}
        colorwayLabel={colorwayLabel}
      />
    </>
  );
}
