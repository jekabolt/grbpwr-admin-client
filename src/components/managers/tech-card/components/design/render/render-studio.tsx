import type { GetDesignBandResponse, common_AdminColorwayRef } from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';

import { colourPlanGate, planRecipe } from '../colour-plan/model';
import { useColourPlan } from '../colour-plan/use-colour-plan';
import { viewLabel } from '../views';
import { useCardFit, useColourDraft } from './drafts';
import { GenerateRow, LockBar, RunRefusal } from './generate-row';
import {
  hexIsPaintable,
  madeOfLine,
  recipeIsStated,
  renderGate,
  renderSheetViews,
  statedWords,
  wireColourSource,
  type Gate,
} from './model';
import { OutputsSection } from './outputs';
import { RenderInputStrip } from './render-input-strip';
import { Palette } from './palette';
import { InputFlatsGroup, SidesGroup } from './side-row';
import { useStartDesignRun } from './use-design-run';
import { WhatModelGetsRenderModal } from './what-model-gets';

/**
 * THE FABRIC RENDER STUDIO — step 4 of the chain, ONE BLOCK, as the prototype draws it
 * (`_step-render.js`, `RENDER['step-render']`):
 *
 *   FABRIC RENDER · the cloth on the flats                                          [STEP 4]
 *   ── INPUT FLATS ──── the flat bench, read only, one cell per side (6)
 *   ── SIDES ────────── the render bench of the studio's colourway, THE writer of that axis
 *   ── CLOTH AND COLOUR  one grid: cloth tiles and the colour tile
 *   ── CLOTH IS ─────── weight g/m² · opaque · semi sheer · sheer, one line
 *   ── IN WORDS ─────── the free text of the recipe
 *   GENERATE · priced by the server on start · WHAT THE MODEL GETS ▸
 *
 * The rows are separated by group rules (`GroupLabel`), never by nested boxes: a block never
 * contains another block (DESIGN.md). The order is the order of the work — first what the render is
 * made FROM, then what came BACK, then what it is made WITH. Under the block stands the section of
 * the card's renders (`OutputsSection`: `mark ▸`, split, apply splitted — the doors that put a
 * render into a side from the card's own pictures), and under that the generation history.
 *
 * ⚠ THE OWNER SAW THE BETA AND SAID «это не как в референсе». What stood here — a four-column table
 * «flats in · renders back · 3D» and a block titled «generation — fabric render» — is gone; the
 * organs are the same, the shape is the mockup's.
 *
 * THE REFERENCES ARE NOT DRAWN HERE: a fabric render is coloured over THE FLATS OF THIS CARD, and
 * the model never sees the reference photographs. They belong to FLAT, one click away.
 *
 * ONE RUN COMES BACK AS ONE SHEET OF SEVERAL VIEWS (the owner's answer of 2026-08-31), split into
 * the slots afterwards; that is why the shape line names one picture however many sides stand.
 *
 * ═══ FIT IS NOT ON THIS SCREEN (J-20), BUT IT IS ON THE WIRE ═══════════════════════════════════
 * Владелец: «FIT полностью убираем отсюда». The server still freezes the card's fit into every
 * render's snapshot and prints it into the paid prompt, so `useCardFit` stays and feeds the modal
 * «what the model gets»: the inventory must name EVERYTHING that travels.
 *
 * ═══ THE COLOURWAY IS ONE NUMBER FOR THE WHOLE STUDIO (round 19, C1) ═══════════════════════════
 * The choice is on the rail, not here; the number arrives as a prop. The render bench is WRITTEN
 * here (`SidesGroup`, `OutputsSection` → `mark ▸`), READ on 3D and ASSEMBLED by the server
 * (`designSelectBench`); a second owner of the number would have 3D looking into one bench while
 * the render fills another. `key={colorwayId}` on the composer remounts this screen on a change of
 * colour, so `useColourDraft` seeds ONCE PER MOUNT and anew per colour.
 */
export function RenderStudio({
  band,
  techCardId,
  disabled,
  onGoToKind,
  colorwayId = 0,
  colorwayRef = null,
  colorwayLabel = '',
  colorwayArchived = false,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * WHOSE render this is. `0` — the colourway-less bench: not a gap but a real, permanently legal
   * value, the one every render made before the axis existed stands on.
   */
  colorwayId?: number;
  /** Its row — the second half of the seed («its own colour», when it has no renders yet). */
  colorwayRef?: common_AdminColorwayRef | null;
  /** Its name — for refusals and captions; `''` under `no colourway`, and that is a statement too. */
  colorwayLabel?: string;
  /**
   * ⚠ ARCHIVED COLOURWAYS ARE NOT WORKED ON, and this is the only thing this screen refuses by the
   * name of a colour. Read by the GATE ONLY: the bench, the palette, the outputs and the split work
   * under an archived colourway word for word as under a live one.
   */
  colorwayArchived?: boolean;
  /**
   * Go to another step of the studio. The step lives in ONE place (`StudioTab`); a screen that kept
   * its own would desynchronise the rail from its own content.
   */
  onGoToKind?: (kind: 'flat' | 'pattern' | 'render' | 'threed' | 'onmodel') => void;
}): JSX.Element {
  const draft = useColourDraft(band, colorwayId, colorwayRef);
  /**
   * ⚠ THE PLAN LIVES HERE, NOT IN THE PALETTE, for the reason the draft does: the gate and the run
   * body read it together with the parts row; two hooks would be two documents of different
   * revisions — saving under one, refusing by the other.
   */
  const colourPlan = useColourPlan(techCardId, band);
  const cardFit = useCardFit();
  const run = useStartDesignRun(techCardId);
  /** The prompt inventory. A modal is its own surface, so it is mounted beside the block. */
  const [inspecting, setInspecting] = useState(false);

  /**
   * THE VIEWS THIS RUN ASKS FOR, IN SHEET ORDER — a walk around the garment, narrowed to the slots
   * that hold a drawing. ⚠ SENT, PROMPTED AND SPLIT AS ONE LIST (`params.views` → `compositeViewsOf`
   * → the splitter's labels); sorting it anywhere else mislabels the cut frames.
   */
  const views = useMemo(() => renderSheetViews(band), [band]);

  /**
   * ONE POINT OF COMPOSITION FOR THE WHOLE SCREEN. The gate, the run body, the shape line and the
   * modal read ONE object; assembled in four places, the first divergence costs a bought picture.
   * ⚠ THE GATE READS THIS, NOT `draft.recipe`: a run stated only by opacity and weight is a legal
   * statement about the cloth (H-13).
   */
  const sent = useMemo(
    () => ({
      ...draft.recipe,
      words: statedWords(draft),
      /**
       * ⚠ THE COLOUR INVARIANT IS HELD BY THIS DOOR, NOT BY THE FIELD: no hex the screen calls
       * «not stated» travels. The client's predicate (`hexIsPaintable`) and the server's («any
       * non-empty hex») disagreed on five values out of six, and one value of the field bought a
       * different prompt than the one shown. The door PASSES OR DROPS, it does not repair —
       * completing the `#` lives at the field's blur, where the person sees the result.
       */
      hex: hexIsPaintable(draft.recipe.hex) ? (draft.recipe.hex ?? '').trim() : '',
    }),
    [draft.recipe, draft.cloth],
  );

  /** What will actually travel — the recipe SUBSTITUTED BY THE PLAN when colour maps ride along. */
  const wire = useMemo(
    () => planRecipe(band, colourPlan.plan, sent),
    [band, colourPlan.plan, sent],
  );

  const gate: Gate = useMemo(() => {
    /* An archived name refuses first — even before an empty bench: under a retired colour «front
       and back must hold a drawing» sends a person to draw what will not be bought anyway. */
    const base = renderGate(band, colorwayArchived, colorwayLabel);
    if (!base.ok) return base;
    /* ⚠ THE PAINT GATE STANDS BEFORE THE RECIPE GATE: a painted colour without a cloth is a
       person's statement left unanswered, not an empty recipe. Three of its four refusals mirror
       the server's doors. */
    const painted = colourPlanGate(band, colourPlan.plan);
    if (!painted.ok) return painted;
    /* ⚠ UNDER PAINT THE STATEMENT ABOUT THE CLOTH LIVES PER PART, NOT IN THE SCALARS; a non-empty
       `colour_maps` already means «everything is stated», because the gate above refused every
       painted colour nothing was said about. */
    if ((wire.colourMaps ?? []).length === 0 && !recipeIsStated(wire)) {
      return {
        ok: false,
        reason:
          'no fabric is stated · pick a cloth, a colour, say what it is, or describe it. Any one is enough',
      };
    }
    return { ok: true };
  }, [band, sent, wire, colourPlan.plan, colorwayArchived, colorwayLabel]);

  const generate = () => {
    run.start({
      kind: 'render',
      ask: '',
      params: {
        views,
        // THE COLOURWAY OF THE RUN (L-2): the sheet being bought is of THIS colour; the server copies
        // the field onto the run so the history can be cut by colourway. `0` is «without a
        // colourway» — what every render made before the axis is, and the one value under which
        // the run's plates land on the unnamed bench.
        colorwayId,
        // ONE PICTURE, ALL THE VIEWS IN A ROW — the owner's own answer of 2026-08-31. `per_view`
        // was one PAID CALL per view; a sheet is one call, one cloth, one light, and the store's
        // `compositeViewsOf` records the row so the splitter can cut it afterwards.
        detailSlotIds: [],
        layout: 'one',
        colour: {
          ...wire,
          // DERIVED AT THE DOOR, NOT HELD BY A CONTROL: `source` predates combination and never
          // decides what travels — the populated fields do.
          source: wireColourSource(wire),
        },
        threed: undefined,
        fixTarget: '',
        extraInputMediaIds: [],
        // NOT A FIX, AND SAID EXPLICITLY IN BOTH SPELLINGS.
        fixTargets: [],
        fixSlotIds: [],
        // ASK FOR THE PROPOSED CUT. It cuts nothing by itself — the cut stays a person's — it only
        // records that the guess was wanted.
        autoSplit: true,
        pattern: undefined,
        useFlatSlots: false,
        // Meaningful on kind=flat only; named because the contract wants the field named.
        flatSlotIds: [],
      },
    });
  };

  const shape = [
    views.length > 1
      ? `1 picture · ${views.length} views in a row`
      : `1 picture · ${views.length === 1 ? viewLabel(views[0]) : 'no slot filled'}`,
    madeOfLine(wire),
    views.length > 1 ? 'split into the slots afterwards' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  /* THE DOOR OF A REFUSAL: where it is fixed, when that is another step. Missing flats → the flat
     bench; the archived colourway → the select on the rail (no door here); everything else is this
     screen's own input, a few rows up. */
  const lockDoors =
    !gate.ok && gate.next === 'flat' && onGoToKind ? (
      <Button variant='secondary' size='xs' onClick={() => onGoToKind('flat')}>
        the flat bench ›
      </Button>
    ) : null;

  return (
    <>
      <Section
        /* THE ANCHOR OF THE STEP'S ONE BLOCK: statements of absence («no colourway picker in this
           block», E-16) and of belonging («the cloth grid lives HERE», E-7) are made about it. */
        id='design-render-bench'
        title='fabric render'
        question='· the cloth on the flats'
        action={<Pill tone='ink'>step 4</Pill>}
      >
        {/* ═══ INPUT FLATS — read only; the flat bench is written on FLAT and under the divider. */}
        <InputFlatsGroup band={band} onGoToKind={onGoToKind} />

        {/* ═══ SIDES — the render bench of this colourway, the one writer of that axis. Under its
            strip: the divider and the sheets not yet raised into it (`RenderInputStrip`, bare). */}
        <SidesGroup
          band={band}
          techCardId={techCardId}
          disabled={disabled}
          colorwayId={colorwayId}
          onGoToKind={onGoToKind}
        />

        {/* ═══ CLOTH AND COLOUR · CLOTH IS · IN WORDS — the recipe, three group rows. The palette
            owns them because they write one draft (`useColourDraft`) and the gate above reads
            the same one. ⚠ THE ANCHOR `#design-fabric-menu` STAYS ON THE GRID: E-7 («no cloth
            placeholder in the input») and E-16 («no colourway picker in the menu») are asserted
            against it. */}
        <div id='design-fabric-menu'>
          <Palette
            band={band}
            techCardId={techCardId}
            disabled={disabled}
            draft={draft}
            colourPlan={colourPlan}
            /* K-16: the second door of the cloth shelf. Without `onGoToKind` it does not exist —
               a button with nowhere to lead is worse than none. */
            onMakePattern={onGoToKind && (() => onGoToKind('pattern'))}
          />
        </div>

        {/* ═══ THE RUN DOORS — the prototype's `runDoors`: the LOCKED bar when the gate refuses,
            the last refusal of the server verbatim, then GENERATE · WHAT THE MODEL GETS ▸ · money. */}
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

        {/* ═══ UNDER A RULE AT THE END — THE SHEETS NOT YET RAISED INTO THE STRIP ══════════════
            The prototype's own words: «ниже полосы — разделитель и мультивью-листы, которые ещё не
            подняты в полосу; под разделителем сырьё, над ним размеченный результат». The mockup
            has no such rail, so it stands LAST, under a hairline, and not between the strip and
            the recipe: the same organ as before (`RenderInputStrip`, bare) — the unmarked
            drawings with `mark ▸`, the sheets and their decks, the `+ flat` door. */}
        {!disabled && (
          <div className='mt-3 border-t border-hairline pt-2' data-side-rows-pool=''>
            <RenderInputStrip band={band} techCardId={techCardId} disabled={disabled} bare />
          </div>
        )}
      </Section>

      {/* The renders this card holds — where `mark ▸`, `split ▸` and `apply splitted` live: the
          doors that put a render into a side from the card's own pictures. `mark ▸` addresses the
          bench of the PICTURE's colourway (see `./outputs`). */}
      <OutputsSection
        band={band}
        techCardId={techCardId}
        kind='render'
        disabled={disabled}
        colorwayId={colorwayId}
        colorwayLabel={colorwayLabel}
      />

      <WhatModelGetsRenderModal
        open={inspecting}
        onOpenChange={setInspecting}
        band={band}
        kind='render'
        /* THE MODAL KNOWS NOTHING OF CHIPS: it is handed the SAME sentence that travels. */
        recipe={wire}
        cardFit={cardFit}
      />
    </>
  );
}
