import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { viewLabel } from '../views';
import { useCardFit, useColourDraft } from './drafts';
import { FieldRow, Hint } from './field-row';
import { GenerateRow } from './generate-row';
import {
  recipeIsStated,
  renderGate,
  renderSheetViews,
  wireColourSource,
  type Gate,
} from './model';
import { OutputsSection } from './outputs';
import { Palette } from './palette';
import { RenderInputStrip } from './render-input-strip';
import { useStartDesignRun } from './use-design-run';
import { WhatModelGetsRenderModal } from './what-model-gets';

/**
 * THE FABRIC RENDER STUDIO — the whole of the `render` view of the DESIGN band.
 *
 * TWO BLOCKS, IN THIS ORDER, AND THE ORDER IS THE ARGUMENT. First what the render is MADE FROM (the
 * flats, with the line down the middle), then what it is made WITH (the fabric: photo, colour, words
 * — any of them, in any combination, ranked by the prompt and not by this screen). The
 * prototype puts the inputs above the menu on both generative screens for the same reason the bench
 * stands below the feed on FLAT: you look at the material before you decide what to do to it.
 *
 * THE REFERENCES ARE NOT DRAWN HERE, and that is a rule of the band rather than a layout choice: a
 * fabric render is coloured over THE FLATS OF THIS CARD, and the model never sees the reference
 * photographs at all. Drawing them would put a section on screen that has no effect on the button
 * beneath it. They belong to FLAT, one click away.
 *
 * ONE RUN COMES BACK AS ONE SHEET OF SEVERAL VIEWS, and it is split into the slots afterwards —
 * the owner's answer of 2026-08-31. That is why there is no «pictures» count in the menu: the money
 * and the picture are both singular no matter how many sides the bench holds, and the plural is
 * created for free, later, by the split.
 *
 * FIT IS READ-ONLY HERE, WITH ITS REASON. Fit is a property of the garment; presentation cannot
 * change it. The render menu therefore states the card's fit and refuses to edit it — unlike 3D,
 * where a one-run override exists and is stamped on every frame it produces.
 */
export function RenderStudio({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const draft = useColourDraft(band);
  const cardFit = useCardFit();
  const run = useStartDesignRun(techCardId);
  /** The prompt inventory. A modal is its own surface, so it is mounted beside the blocks. */
  const [inspecting, setInspecting] = useState(false);

  /**
   * THE VIEWS THIS RUN ASKS FOR, IN SHEET ORDER — a walk around the garment (front, side L, back,
   * side R), narrowed to the slots that actually hold a drawing.
   *
   * ⚠ THIS LIST IS SENT, PROMPTED AND SPLIT AS ONE. It travels as `params.views`; the store records
   * it VERBATIM as «what is glued into this image» (`compositeViewsOf`); the prompt names it
   * left-to-right; the splitter labels the cut frames off the record. Sorting it anywhere else in
   * that chain would hand back a sheet whose frames are systematically mislabeled.
   */
  const views = useMemo(() => renderSheetViews(band), [band]);

  const gate: Gate = useMemo(() => {
    const base = renderGate(band);
    if (!base.ok) return base;
    if (!recipeIsStated(draft.recipe)) {
      return {
        ok: false,
        reason:
          'no fabric is stated yet — attach a fabric photo, pick a colour, or describe the cloth in words above. Any one of them is enough, and they may be combined',
      };
    }
    return { ok: true };
  }, [band, draft.recipe]);

  const generate = () => {
    run.start({
      kind: 'render',
      ask: '',
      params: {
        views,
        // ─── ONE PICTURE, ALL THE VIEWS IN A ROW — the owner's own answer of 2026-08-31 to «что
        // возвращает один прогон»: «Три вида в одной картинке… в слоты кладётся уже после разреза».
        //
        // IT USED TO BE `per_view`, AND THE DIFFERENCE IS NOT COSMETIC. `per_view` is one PAID CALL
        // per view (see designgen/images.go, imageCalls), so a three-side card bought three
        // pictures — three separate photographs of what is supposed to be one garment, each free to
        // drift a shade of white, a neckline and a light. A sheet is one call, one cloth, one light,
        // and the store's own compositeViewsOf records the row so the splitter can cut it into the
        // slots afterwards. Cheaper AND more coherent, which is unusual enough to be worth the note.
        // Деталей этот прогон не просит, и список пуст ЯВНО: сервер сверяет его длину с числом
      // элементов `detail` в `views`, и «поле не задано» здесь означало бы то же, что пустой
      // список, только молча.
      detailSlotIds: [],
      layout: 'one',
        colour: {
          ...draft.recipe,
          // DERIVED AT THE DOOR, NOT HELD BY A CONTROL. `source` predates combination and cannot
          // spell «a photo and a picked colour together»; it is written here purely so recipes
          // already stored stay readable, and it never decides what travels — the three populated
          // fields do.
          source: wireColourSource(draft.recipe),
        },
        threed: undefined,
        fixTarget: '',
        extraInputMediaIds: [],
        // NOT A FIX, AND SAID EXPLICITLY IN BOTH SPELLINGS. `fix_target` is the frozen scalar the
        // history already states; `fix_targets`/`fix_slot_ids` are the selection a new run uses.
        // Empty in all three is «this run corrects nothing», which is what these two screens do.
        fixTargets: [],
        fixSlotIds: [],
        // ASK FOR THE PROPOSED CUT. A render now comes back as ONE sheet of several views, and the
        // whole point of the flag is that the human confirms frames instead of drawing rectangles
        // from nothing. It cuts nothing by itself — the cut stays `SplitDesignPicture`'s and stays
        // a person's — it only records that the guess was wanted.
        autoSplit: true,
      },
    });
  };

  return (
    <>
      <RenderInputStrip band={band} techCardId={techCardId} disabled={disabled} />

      <Section
        title='generation — fabric render'
        question='— the cloth: a photo, a colour, words, or any mix of them'
      >
        <Palette band={band} techCardId={techCardId} disabled={disabled} draft={draft} />

        <FieldRow label='fit'>
          {/* A READ-ONLY CONTROL WITH ITS REASON, not a disabled input. It looks like the field it
              is (so the eye finds the fit where it expects it) and it answers when asked why it
              cannot be typed in — the card is the single place fit is edited. */}
          <span
            data-inert='fit is a property of the garment — presentation cannot change it. It is edited in classification, on the card.'
            title='fit is a property of the garment — presentation cannot change it. It is edited in classification, on the card.'
            className='inline-flex min-h-[22px] w-[180px] cursor-help items-center border border-borderColor bg-bgZebra px-[7px] py-[3px]'
          >
            <Text size='default' component='span'>
              {cardFit || '—'}
            </Text>
          </span>
          <Pill>from classification</Pill>
          <Hint>fit is a garment property, not a presentation one: edited on the card</Hint>
        </FieldRow>

        <GenerateRow
          band={band}
          gate={gate}
          shape={
            views.length > 1
              ? `1 picture · ${views.length} views in a row · split into the slots afterwards`
              : `1 picture · ${views.length === 1 ? viewLabel(views[0]) : 'no slot filled'}`
          }
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
        />
      </Section>

      {/* The renders this page of the band holds — the outputs, where the mark «chosen» lives and
          is SET. The owner's W-12 names 3D, but ARTIFACTS narrows its RENDERS segment to the
          chosen ones too (W-14) — a mark that filters a list must be settable for that list, so
          the same section stands on both generative screens. See `./outputs`. */}
      <OutputsSection band={band} techCardId={techCardId} kind='render' disabled={disabled} />

      <WhatModelGetsRenderModal
        open={inspecting}
        onOpenChange={setInspecting}
        band={band}
        kind='render'
        recipe={draft.recipe}
        cardFit={cardFit}
      />
    </>
  );
}
