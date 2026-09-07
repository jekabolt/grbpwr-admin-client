import type { GetDesignBandResponse } from 'api/proto-http/admin';

import { cn } from 'lib/utility';
import { type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import Tooltip, { TooltipProvider } from 'ui/components/tooltip';

import type { TechCardFormData } from '../schema';
import { pictureRepresentation } from './bench-kinds';
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
import { LockBar } from './render/generate-row';
import { countThreedResults } from './threed/media';

/**
 * THE CHAIN RAIL — where this card stands, and the one navigator of the studio.
 *
 * It REPLACES `KindsStrip` (the five-cell strip of representations) rather than standing beside it:
 * two navigators for one gesture — «go to that step» — would be two places that can disagree about
 * where a person is. A cell IS the navigation, and every cell navigates the same way: it opens its
 * step (`onStepChange`), CARD DETAILS and MOODBOARD included. The rail stands at the TOP of the
 * studio and under it there is ONE step at a time — the prototype's `render()` is exactly
 * `railBlock() + RENDER[S.step]()`, and `ACTIONS['go']` sets `S.step` for any cell.
 *
 * ═══ THE CELL IS THREE LINES AND NOTHING ELSE — the prototype's `railBlock()` cell ══════════════
 * `STEP N` · the name · the state pill. The counter sub-lines the strip used to carry («none yet»,
 * «2 renders», «fields · no run») are gone on purpose: they were the OLD rail (`A-rail.png`,
 * `D-rail-375.png`), and the current mock-up (`step-3.png`) draws the cell as number · name ·
 * pill, in black, white and dashed only. A count belongs to the step's own screen, where it is
 * next to the thing counted; on the rail it read as a second state beside the pill.
 *
 * ═══ COLOUR CARRIES NOTHING HERE ═════════════════════════════════════════════════════════════════
 * `NOW` is the filled cell, `DONE` an ink-bordered pill, `BLOCKED` and `SKIPPED` a dashed one,
 * every other word a plain grey pill. No green «done», no red «blocked»: in this admin red is money
 * lost (memory: «красный = убыток, серые ок»), and the mock-up's rule is «цвет только
 * чёрный/белый/пунктир».
 *
 * THIS IS A HINT, NOT A GUARD — the strip's own rule, kept word for word. A blocked cell still
 * OPENS: behind it is the screen that explains in full what is missing and offers the exits, and
 * closing it would hide the one place that says so. The refusal itself lives on the server.
 *
 * `Section`, not a bare strip: the rail has a title, a question and a counter in its header, which
 * is what a `Section` is for. Inside, the six links are ONE ruled row (a table, the way `StatGrid`
 * is a table: one outline, inner rules) and the aside is a second full-width row pressed to it —
 * `_shell.html`'s `.steps` + `.steps-aside`, `border-top: 0`.
 */

/* The floor under which «fabric render» and the `optional` pill stop fitting. Below it the ROW
   scrolls inside the block (`overflow-x-auto` on the wrapper), the page never does. Focus is the
   system's 2px ink outline, drawn inside the cell so it is not clipped by the scrolling wrapper. */
const CELL =
  'flex min-w-[5.5rem] flex-1 flex-col gap-0.5 px-2.5 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor';

/**
 * The state word as a pill — a LOCAL organ because `ui/components/pill` has no dashed («gap») tone
 * and no inverted («on») face, and `core/organs.tsx`' `Counter` paints zero red. Written here with
 * explicit classes rather than as `Pill` + `className`, because the built stylesheet orders
 * `.text-textColor` AFTER `.text-bgColor`: a `Pill tone='ink'` handed `text-bgColor` stays black on
 * the black cell. Просится в core: a `gap` tone on `Pill`, and `Counter` with a dashed zero.
 */
const PILL_BASE =
  'inline-flex items-center whitespace-nowrap border px-[7px] py-px text-micro uppercase tracking-pill';

function StatePill({ state, inverted }: { state: StepState; inverted: boolean }) {
  const tone = inverted
    ? 'border-bgColor text-bgColor'
    : state === 'done'
      ? 'border-textColor text-textColor'
      : state === 'blocked' || state === 'skipped'
        ? 'border-dashed border-borderColor text-labelColor'
        : 'border-borderColor text-labelColor';
  return <span className={cn(PILL_BASE, tone)}>{state}</span>;
}

/** `3 of 6 steps` — the header counter; a dashed pill at zero, never a red one. */
function StepsCounter({ n, total }: { n: number; total: number }) {
  return (
    <span
      className={cn(
        PILL_BASE,
        n === 0
          ? 'border-dashed border-borderColor text-labelColor'
          : 'border-borderColor text-labelColor',
      )}
    >
      {n} of {total} {total === 1 ? 'step' : 'steps'}
    </span>
  );
}

function StepCell({
  step,
  state,
  note,
  onOpen,
  className,
}: {
  step: Step;
  state: StepState;
  /** The long reason behind a blocked cell, spoken on hover; the bar below speaks it first. */
  note?: string;
  onOpen?: () => void;
  className?: string;
}) {
  const active = state === 'now';
  const body = (
    <>
      <Text
        size='nano'
        variant='uppercase'
        tracking='label'
        component='span'
        className={cn(active ? 'text-bgColor' : 'text-labelColor')}
      >
        {step.n ? `step ${step.n}` : 'aside'}
      </Text>
      <Text
        size='control'
        variant='uppercase'
        tracking='label'
        component='span'
        className={cn('truncate font-bold', active ? 'text-bgColor' : 'text-textColor')}
      >
        {step.label}
      </Text>
      <span>
        <StatePill state={state} inverted={active} />
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
 * ═══ WHAT THE CHAIN READS, BUILT ONCE — the composer calls this and hands the result down ═════════
 *
 * The rail used to build the context itself, from the form and the band. It moved out for one
 * reason: the composer needs the SAME context before the rail is drawn, to decide which step a card
 * opens on (`defaultStep`, core/chain.ts), and two builders of one context are two places that can
 * disagree about whether the card is done. `now` is left `null` here: the composer fills it in
 * (`{ ...ctx, now: step }`) once the step is known — the default rule wants it empty.
 *
 * LIVE NUMBERS FROM THE FORM. The card fields decide whether step 0 is done and the board count
 * whether step 1 is; read through the form, not a frozen copy, so the rail never names the previous
 * state after an edit. ALL FOUR PICTURE COUNTS FROM ONE CLASSIFIER (G-1): renders, tiles, 3D models
 * and recolours are bucketed by `pictureRepresentation`; the 3D count folds the `.glb` and its
 * raster thumbnail into one result through `countThreedResults` (`threed/media.ts`). Hidden frames
 * are filtered out for the reason the strip filtered them: a hidden render is still a render, only
 * uncounted. The counts no longer print on the cells (see the header) — `stepDone` still reads them.
 */
export function useChainCtx({
  band,
  bandless,
  colorway,
}: {
  band: GetDesignBandResponse;
  /** The server does not serve the band; every band-derived state is «unknown», never «locked». */
  bandless: boolean;
  /** The one colourway axis of the studio (`useColorwayChoice`), read for the 3D and render gates. */
  colorway: { id: number; label: string; archived: boolean };
}): ChainCtx {
  const { control } = useFormContext<TechCardFormData>();
  const moodPictures = (
    (useWatch({ control, name: 'moodboardMedia' }) as unknown[] | undefined) ?? []
  ).length;
  const name = (useWatch({ control, name: 'name' }) as string | undefined) ?? '';
  const styleNumber = (useWatch({ control, name: 'styleNumber' }) as string | undefined) ?? '';
  const categoryId = Number(useWatch({ control, name: 'categoryId' }) ?? 0);
  const baseSampleSizeId = Number(useWatch({ control, name: 'baseSampleSizeId' }) ?? 0);
  const pastIdea =
    ((useWatch({ control, name: 'stage' }) as string | undefined) ?? '') !== 'TECH_CARD_STAGE_IDEA';

  const shown = (band.runs ?? []).flatMap((r) => r.pictures ?? []).filter((p) => !p.hiddenAt);
  const repOf = (p: (typeof shown)[number]) => pictureRepresentation(band, p);
  const counts = {
    pattern: shown.filter((p) => repOf(p) === 'pattern').length,
    render: shown.filter((p) => repOf(p) === 'render').length,
    threed: countThreedResults(shown.filter((p) => repOf(p) === 'threed')),
    onmodel: shown.filter((p) => repOf(p) === 'onmodel').length,
  };

  return {
    band,
    bandless,
    now: null,
    card: { name, styleNumber, categoryId, baseSampleSizeId, pastIdea },
    moodPictures,
    counts,
    colorway,
  };
}

/**
 * The word on the door under the rail. The product's gates (`core/chain.ts` → `render/model.ts`)
 * name the step a refusal is FIXED on but carry no door label of their own; the mock-up's `gate()`
 * does («fill the empty sides ›» for the render bench, «+ add front ›» for the flat bench,
 * «+ picture ›» for the board). The label is chosen by the destination, which is the one fact both
 * sides state.
 */
function doorLabel(door: StepId): string {
  switch (door) {
    case 'render':
      return 'fill the empty sides ›';
    case 'flat':
      // The mock-up's own door word for this destination (`step-4.png`: «THE FLAT BENCH ›»). Not
      // «fill the flat sides»: the product's 3D gate sends here over a card that OWNS no fabric
      // render yet, and its flats may well be standing already.
      return 'the flat bench ›';
    case 'mood':
      return '+ picture ›';
    default:
      return `go to ${[...STEPS, ASIDE].find((s) => s.id === door)?.label ?? door} ›`;
  }
}

/**
 * ═══ У РЕЛЬСА БОЛЬШЕ НЕТ СЛОТА `action`, И ЭТО ПЕРЕЕЗД ОРГАНА, А НЕ ЕГО СНЯТИЕ (G2-2) ══════════
 *
 * Здесь стоял `ColorwaySelect` — «чей это рендер», — и довод был про МЕСТО: единственный ряд,
 * который переживает смену экрана. Довод не учёл того, что этот выбор решает: `colorway_id`
 * прогона НЕИЗМЕНЯЕМ, значит цель — часть покупки. Спрятанная на рельсе, она оставляла человека
 * с историей, где ROSSO навсегда записан семплом; сам рельс при этом отвечает на вопрос «где я»,
 * а не «за кого я плачу».
 *
 * Куда уехало: `for:` в ряду GENERATE — и у фабрик-рендера, и у 3D, — чипы в PAINT на
 * on-model. У каждого экрана орган ровно один (владелец: «не делай разные кнопки для одного и
 * того же»), и состояние по-прежнему ОДНО — `useColorwayChoice` у композитора.
 *
 * Проп удалён, а не оставлен пустым: щель без вызывающих — это дверь, о которой следующий читатель
 * решит, что она нужна, и повесит на неё второй орган выбора.
 */
export function ChainRail({
  ctx,
  onStepChange,
}: {
  /** What the chain reads, `now` filled in — see `useChainCtx`. */
  ctx: ChainCtx;
  /** A cell was pressed. The composer holds the step (`S.step` of the prototype) and switches. */
  onStepChange: (id: StepId) => void;
}): JSX.Element {
  // Every cell opens its step; the one on display is drawn as a place, not a control (`StepCell`).
  function open(step: Step): () => void {
    return () => onStepChange(step.id);
  }

  const cell = (step: Step, className?: string) => {
    const state = stepState(step.id, ctx);
    const gate = chainGate(step.id, ctx);
    return (
      <StepCell
        key={step.id}
        step={step}
        state={state}
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
      question='· where this card stands'
      action={<StepsCounter n={doneCount(ctx)} total={STEPS.length} />}
    >
      <TooltipProvider>
        {/* SIX LINKS IN ONE OUTLINED ROW, RULED BY HAIRLINES. The cells share the width (`flex-1` —
            grow, shrink AND a zero basis; `min-w` is the floor under the longest name). Then the
            ASIDE on a full-width row of its own, pressed to the first (`border-t-0`): ON MODEL is
            not a link of the chain — a row of equal cells would claim it is a step — so it stands
            apart, without a number, and does not count in «N of 6 steps». */}
        <div className='overflow-x-auto'>
          {/* `min-w-max`: below the floor both rows are as wide as the six cells, so the aside's
              outline stays under the first row's while the block scrolls. */}
          <div className='min-w-max'>
            <div className='flex items-stretch border border-borderColor'>
              {STEPS.map((s, i) => cell(s, i > 0 ? 'border-l border-hairline' : undefined))}
            </div>
            <div className='flex items-stretch border border-t-0 border-borderColor'>
              {cell(ASIDE)}
            </div>
          </div>
        </div>
      </TooltipProvider>
      {/* ═══ THE NEAREST OBSTACLE, AS A VISIBLE BAR (SPEC §8: never `title` alone) ═══════════════════
          Drawn only when the chain is actually held up: `nearestBlock` skips optional steps and
          `own` refusals, so an empty flat prompt or an unstated cloth never puts a bar here. The bar
          reads as the mock-up's `lockBar`: the word LOCKED, then `step N · name · why` (the number
          comes from the step itself, never from a string), then the door that goes where the refusal
          is FIXED — the step the gate points at — not to the blocked step itself. */}
      {block && blockStep && (
        <LockBar>
          <Text
            size='micro'
            variant='uppercase'
            tracking='label'
            component='span'
            className='font-bold'
          >
            locked
          </Text>
          <Text
            size='micro'
            variant='label'
            component='span'
            className='min-w-0 flex-1 normal-case'
          >
            step {blockStep.n} · {blockStep.label} · {block.why}
          </Text>
          {doorStep && (
            <Button variant='secondary' size='xs' onClick={open(doorStep)}>
              {doorLabel(doorStep.id)}
            </Button>
          )}
        </LockBar>
      )}
    </Section>
  );
}
