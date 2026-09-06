import type { GetDesignBandResponse } from 'api/proto-http/admin';

import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import Tooltip, { TooltipProvider } from 'ui/components/tooltip';

import type { TechCardFormData } from '../schema';
import { pictureRepresentation, type DesignKind } from './bench-kinds';
import {
  ASIDE,
  STEPS,
  chainGate,
  doneCount,
  nearestBlock,
  stepState,
  type ChainCtx,
  type Step,
  type StepId,
  type StepState,
} from './core/chain';
import { Counter } from './core';
import { openDoor } from './doors';
import { LockBar } from './render/generate-row';
import { countThreedResults } from './threed/media';

/**
 * THE CHAIN RAIL — where this card stands, and the one navigator of the studio.
 *
 * It REPLACES `KindsStrip` (the five-cell strip of representations) rather than standing beside it:
 * two navigators for one gesture — «go to that step» — would be two places that can disagree about
 * where a person is. What the strip did, the rail still does, cell for cell:
 *   · a cell IS the navigation. Clicking a switched step opens it (`onKindChange`), exactly as
 *     `RepCell` did; clicking CARD DETAILS or MOODBOARD — which are always on screen above the rail
 *     and are steps all the same — scrolls to them through the same `openDoor` every other door of
 *     the band uses;
 *   · the counters are the strip's counters, computed by the same single classifier
 *     (`pictureRepresentation`, `bench-kinds.ts`) — imported, not re-derived. Hidden frames are
 *     filtered out separately for the same reason the strip filtered them: invisibility is its own
 *     register (`visibility.ts`), and a hidden render is still a render, only uncounted;
 *   · the `action` slot at the right end is kept as it was: `ColorwaySelect` on render / 3D / on
 *     model, chosen by the composer (the argument is on the prop, unchanged).
 *
 * WHAT IS NEW is the answer to «where do I stand». Each cell carries a state pill — now · done ·
 * next · ready · optional · blocked — from `core/chain.ts`, and under the cells a VISIBLE bar names
 * the nearest obstacle of the chain with the door that clears it. `KindsStrip` said the same thing
 * only as a dimmed cell with a tooltip, i.e. as a reason that lived in `title` — the very shape the
 * prototype's seam rule forbids («причина погашенного элемента не имеет права жить только в
 * `title`»). The tooltip stays as a second voice for the long text; the bar is the first.
 *
 * THIS IS A HINT, NOT A GUARD — the strip's own rule, kept word for word. A blocked cell still
 * OPENS: behind it is the screen that explains in full what is missing and offers the exits, and
 * closing it would hide the one place that says so. The refusal itself lives on the server.
 *
 * `Section`, not a bare strip. The strip was its own surface (border + fill); the rail has a title,
 * a question and a counter in its header, which is what a `Section` is for. The cells inside are
 * ruled by hairlines only — a second box inside the block is the shape DESIGN.md forbids.
 */

/* `min-w-[5.5rem]` is the floor under which «fabric render» and the `optional` pill stop fitting;
   below it the ROW scrolls inside the block (`overflow-x-auto` on the wrapper), the page never
   does. Focus is the system's 2px ink outline, drawn inside the cell so it is not clipped by the
   scrolling wrapper. */
const CELL =
  'flex min-w-[5.5rem] flex-1 flex-col gap-0.5 px-2.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor';

const PILL_TONE: Record<StepState, 'ok' | 'warn' | 'attention' | 'mut' | 'ink'> = {
  now: 'ink',
  done: 'ok',
  next: 'ink',
  ready: 'mut',
  optional: 'mut',
  skipped: 'mut',
  blocked: 'warn',
};

function StepCell({
  step,
  state,
  sub,
  note,
  onOpen,
  className,
}: {
  step: Step;
  state: StepState;
  /** How many of the step's pictures exist — the strip's counter, unchanged. */
  sub: string;
  /** The long reason behind a blocked cell, spoken on hover; the bar below speaks it first. */
  note?: string;
  onOpen?: () => void;
  className?: string;
}) {
  const active = state === 'now';
  const body = (
    <>
      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='span'
        className={cn(active ? 'text-bgColor' : 'text-labelColor')}
      >
        {step.n ? `step ${step.n}` : 'aside'}
      </Text>
      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='span'
        className={cn('font-bold', active ? 'text-bgColor' : 'text-textColor')}
      >
        {step.label}
      </Text>
      <Text
        size='micro'
        component='span'
        className={cn('break-words', active ? 'text-bgColor' : 'text-labelColor')}
      >
        {sub}
      </Text>
      <span>
        <Pill tone={PILL_TONE[state]} className={cn(active && 'border-bgColor text-bgColor')}>
          {state}
        </Pill>
      </span>
    </>
  );

  // The step on display is NOT a control: it is where you already are. A button that does nothing
  // when pressed is the very thing this rail exists to avoid.
  if (active || !onOpen) {
    return (
      <div
        aria-current={active ? 'step' : undefined}
        data-step={step.id}
        data-state={state}
        className={cn(CELL, active && 'bg-textColor', className)}
      >
        {body}
      </div>
    );
  }
  const button = (
    <button
      type='button'
      data-step={step.id}
      data-state={state}
      // THE REASON IS A VALUE, NOT A STYLING. Readable by a probe through the attribute and by a
      // person through the bar under the rail; the pill alone would vanish on monochrome print.
      data-locked={state === 'blocked' ? note : undefined}
      aria-label={`${step.label} · ${state}`}
      onClick={onOpen}
      className={cn(CELL, 'hover:bg-bgSecondary', className)}
    >
      {body}
    </button>
  );
  if (!note) return button;
  return (
    <Tooltip side='bottom' align='start' className='max-w-[320px] normal-case' trigger={button}>
      {note}
    </Tooltip>
  );
}

/**
 * Where a click on an always-on-screen step lands. Both anchors are stamped by the composer
 * (`studio-tab.tsx`) on the wrapper of the step's blocks, so `openDoor` — the same `revealField`
 * every other door of the band uses — scrolls to the TOP of the step. The fields inside stamp their
 * own `data-field`s, but landing on `name` would skip the block header, and the board stamps only
 * its description textarea, below the pictures.
 */
const SCROLL_DOOR: Partial<Record<StepId, { path: string; where: string }>> = {
  card: { path: 'design.step.card', where: 'card details' },
  mood: { path: 'design.step.mood', where: 'the moodboard' },
};

export function ChainRail({
  band,
  bandless,
  kind = 'flat',
  onKindChange,
  onScrollStep,
  colorway,
  action,
}: {
  band: GetDesignBandResponse;
  /** The server does not serve the band; every band-derived state is «unknown», never «locked». */
  bandless: boolean;
  /** Which switched screen is on. The composer holds it (`state.kind` of the prototype). */
  kind?: DesignKind;
  onKindChange?: (kind: DesignKind) => void;
  /**
   * Called just before the rail scrolls to an always-on-screen step (card details, moodboard). The
   * composer folds step 0 away on a filled card; without this the door would land on the fold.
   */
  onScrollStep?: (id: StepId) => void;
  /** The one colourway axis of the studio (`useColorwayChoice`), read for the 3D and render gates. */
  colorway: { id: number; label: string; archived: boolean };
  /**
   * ═══ THE RIGHT END OF THE ROW — ONE FILTER, HANDED IN BY THE COMPOSER (round 19, C1) ═══════════
   *
   * `ColorwaySelect` — «whose render is this» — stands HERE, and for three reasons none of which is
   * about screen space:
   *   · this is the ONLY row that survives a change of view. The eye comes back here to change the
   *     representation, and «in which colour» is a question of the same class as «in which view»;
   *   · the render bench and the 3D gate are keyed by one number, so it must be named in one place,
   *     not once per screen;
   *   · on the bench itself (`FabricRenderSlots`) it cannot stand: that is the LAST block of the
   *     render screen (J-25), and the colourway must be known before the recipe seeds above it.
   *
   * WHY A SLOT AND NOT AN IMPORT OF THE PICKER. The rail decides nothing about the studio: it draws
   * the row and reports a click. Were it to import `useColorwayChoice`, the axis would have TWO
   * owners — the defect round 16 removed by demolition. The slot takes a ready node and does not
   * know what is in it; that it is empty on FLAT and PATTERN is the composer's decision.
   *
   * `shrink-0` is load-bearing: the cells are `flex-1`, and without it the row would hand the filter
   * a share of the width taken from the last cell.
   */
  action?: JSX.Element | null;
}): JSX.Element {
  const { control } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();

  // LIVE NUMBERS FROM THE FORM. The callout count changes the instant the sheet does; the card
  // fields decide whether step 0 is done. Read through the form, not a frozen copy, for the same
  // reason the strip read them so: the rail must not name the previous count after an edit.
  const callouts = (useWatch({ control, name: 'callouts' }) as unknown[] | undefined) ?? [];
  const moodPictures = (
    (useWatch({ control, name: 'moodboardMedia' }) as unknown[] | undefined) ?? []
  ).length;
  const name = (useWatch({ control, name: 'name' }) as string | undefined) ?? '';
  const styleNumber = (useWatch({ control, name: 'styleNumber' }) as string | undefined) ?? '';
  const categoryId = Number(useWatch({ control, name: 'categoryId' }) ?? 0);
  const baseSampleSizeId = Number(useWatch({ control, name: 'baseSampleSizeId' }) ?? 0);
  const pastIdea =
    ((useWatch({ control, name: 'stage' }) as string | undefined) ?? '') !==
    'TECH_CARD_STAGE_IDEA';

  /**
   * ═══ ALL FOUR NUMBERS FROM ONE CLASSIFIER (G-1) — moved here from `kinds-strip.tsx` verbatim ═══
   * Renders, tiles, 3D models and recolours are all bucketed by `pictureRepresentation`; the 3D
   * count then folds the `.glb` and its raster thumbnail into one result through
   * `countThreedResults` (`threed/media.ts`), the one place that rule is written.
   */
  const shown = (band.runs ?? []).flatMap((r) => r.pictures ?? []).filter((p) => !p.hiddenAt);
  const repOf = (p: (typeof shown)[number]) => pictureRepresentation(band, p);
  const counts = {
    pattern: shown.filter((p) => repOf(p) === 'pattern').length,
    render: shown.filter((p) => repOf(p) === 'render').length,
    threed: countThreedResults(shown.filter((p) => repOf(p) === 'threed')),
    onmodel: shown.filter((p) => repOf(p) === 'onmodel').length,
  };

  const ctx: ChainCtx = {
    band,
    bandless,
    kind,
    card: { name, styleNumber, categoryId, baseSampleSizeId, pastIdea },
    moodPictures,
    counts,
    colorway,
  };

  const plural = (n: number, noun: string, many = `${noun}s`) => `${n} ${n === 1 ? noun : many}`;
  const subOf = (id: StepId): string => {
    switch (id) {
      case 'card': {
        const g = chainGate('card', ctx);
        // The step without a run says so — a state, not a default (REVIEW: «У нулевого шага нет
        // прогона … Шаг обязан объявить это состоянием»).
        return g.ok && g.noRun ? 'fields · no run' : '';
      }
      case 'mood':
        return moodPictures ? plural(moodPictures, 'picture') : 'none yet';
      case 'flat':
        return callouts.length ? plural(callouts.length, 'callout') : 'none yet';
      case 'pattern':
        return counts.pattern ? plural(counts.pattern, 'tile') : 'none yet';
      case 'render':
        return counts.render ? plural(counts.render, 'render') : 'none yet';
      case 'threed':
        return counts.threed ? plural(counts.threed, '3D model') : 'none yet';
      case 'aside':
        return counts.onmodel ? `${counts.onmodel} recoloured` : 'none yet';
    }
  };

  const open = (step: Step): (() => void) | undefined => {
    const scroll = SCROLL_DOOR[step.id];
    if (scroll) {
      return () => {
        onScrollStep?.(step.id);
        openDoor(scroll.path, scroll.where, showMessage);
      };
    }
    if (step.kind && onKindChange) {
      const k = step.kind;
      return () => onKindChange(k);
    }
    return undefined;
  };

  const cell = (step: Step, className?: string) => {
    const state = stepState(step.id, ctx);
    const gate = chainGate(step.id, ctx);
    return (
      <StepCell
        key={step.id}
        step={step}
        state={state}
        sub={subOf(step.id)}
        note={state === 'blocked' && !gate.ok ? gate.reason : undefined}
        onOpen={open(step)}
        className={className}
      />
    );
  };

  const block = nearestBlock(ctx);
  const blockStep = block ? STEPS.find((s) => s.id === block.stepId) : null;
  const doorStep = block?.door ? [...STEPS, ASIDE].find((s) => s.id === block.door) : null;

  return (
    <Section
      title='the chain'
      question='— where this card stands'
      action={<Counter n={doneCount(ctx)} noun='step' total={STEPS.length} />}
    >
      <TooltipProvider>
        {/* ONE ROW, RULED BY HAIRLINES. The six links share the width (`flex-1` on every cell — grow,
            shrink AND a zero basis, both halves load-bearing: without `min-w-0` the longest sub-line
            pushes its cell over the neighbour, without grow a cell collapses to one letter per
            line). The aside is set off by a `borderColor` rule — the heavier weight — because it is
            not a link of the chain; the filter slot keeps its own width. */}
        <div className='overflow-x-auto'>
          <div className='flex items-stretch'>
            {STEPS.map((s, i) => cell(s, i > 0 ? 'border-l border-hairline' : undefined))}
            {cell(ASIDE, 'border-l border-borderColor')}
            {action && (
              <div className='flex shrink-0 items-center border-l border-hairline px-2.5 py-2'>
                {action}
              </div>
            )}
          </div>
        </div>
      </TooltipProvider>
      {/* ═══ THE NEAREST OBSTACLE, AS A VISIBLE BAR (SPEC §8: never `title` alone) ═══════════════════
          Drawn only when the chain is actually held up: `nearestBlock` skips optional steps and
          `own` refusals, so an empty flat prompt or an unstated cloth never puts a bar here. The
          text names the step by NAME, never by number (REVIEW: every «step N» slid onto its
          neighbour when CARD DETAILS became 0). The door goes where the refusal is FIXED — the step
          the gate points at — not to the blocked step itself. */}
      {block && blockStep && (
        <LockBar reason={`locked · ${blockStep.label} · ${block.why}`}>
          {doorStep && (
            <Button
              variant='secondary'
              size='xs'
              onClick={open(doorStep)}
              disabled={!open(doorStep)}
            >
              go to {doorStep.label} ▸
            </Button>
          )}
        </LockBar>
      )}
    </Section>
  );
}
