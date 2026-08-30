import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, type JSX } from 'react';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { ColourHistory } from './colour-history';
import { useCardFit, useColourDraft } from './drafts';
import { FieldRow, Hint } from './field-row';
import { GenerateRow } from './generate-row';
import { benchSides, recipeIsStated, renderGate, type Gate } from './model';
import { Palette } from './palette';
import { RenderInputStrip } from './render-input-strip';
import { useStartDesignRun } from './use-design-run';

/**
 * THE FABRIC RENDER STUDIO — the whole of the `render` view of the DESIGN band.
 *
 * TWO BLOCKS, IN THIS ORDER, AND THE ORDER IS THE ARGUMENT. First what the render is MADE FROM (the
 * flats, with the line down the middle), then what it is made WITH (colour, material, words). The
 * prototype puts the inputs above the menu on both generative screens for the same reason the bench
 * stands below the feed on FLAT: you look at the material before you decide what to do to it.
 *
 * THE REFERENCES ARE NOT DRAWN HERE, and that is a rule of the band rather than a layout choice: a
 * fabric render is coloured over THE FLATS OF THIS CARD, and the model never sees the reference
 * photographs at all. Drawing them would put a section on screen that has no effect on the button
 * beneath it. They belong to FLAT, one click away.
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
  // ONE DRAFT FOR BOTH ORGANS. The palette writes it and the colour history restores into it; two
  // drafts would make a restored chip visibly change nothing.
  const draft = useColourDraft(band);
  const cardFit = useCardFit();
  const run = useStartDesignRun(techCardId);

  const sides = useMemo(() => benchSides(band), [band]);
  const filled = sides.filter((side) => !!side.picture);

  const gate: Gate = useMemo(() => {
    const base = renderGate(band);
    if (!base.ok) return base;
    if (!recipeIsStated(draft.recipe)) {
      return {
        ok: false,
        reason:
          'no colour is stated yet — pick one from the dictionary, type a hex of your own, or choose a fabric photo above',
      };
    }
    return { ok: true };
  }, [band, draft.recipe]);

  const generate = () => {
    run.start({
      kind: 'render',
      ask: '',
      params: {
        // ONE PICTURE PER FILLED SLOT: the render colours the drawings that are on the bench, and
        // the views it is asked for are exactly the ones that hold one.
        views: filled.map((side) => side.view),
        layout: 'per_view',
        colour: draft.recipe,
        threed: undefined,
        fixTarget: '',
        extraInputMediaIds: [],
      },
    });
  };

  return (
    <>
      <RenderInputStrip band={band} techCardId={techCardId} disabled={disabled} />

      <Section
        title='generation — fabric render'
        question='— colour, material and the words that go with them'
      >
        <Palette band={band} techCardId={techCardId} disabled={disabled} draft={draft} />
        <ColourHistory band={band} techCardId={techCardId} disabled={disabled} draft={draft} />

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
          shape={`${filled.length} picture${filled.length === 1 ? '' : 's'} · one per filled slot`}
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
        />
      </Section>
    </>
  );
}
