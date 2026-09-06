import type { GetDesignBandResponse, common_AdminColorwayRef } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';

import { Counter } from '../core';
import { GenerateRow, LockBar, RunRefusal } from '../render/generate-row';
import { useStartDesignRun } from '../render/use-design-run';
import { WhatModelGetsRenderModal } from '../render/what-model-gets';
import { useOnModelPaint, useOnModelShot } from './drafts';
import { asRowGate, clothChoices, onModelGate, paintWire } from './model';
import { OnModelOutputs } from './outputs';
import { PaintGroup } from './paint-group';
import { ShotGroup, libraryShot } from './shot-group';

/**
 * ═══ ON MODEL — THE ASIDE: a real photograph, repainted (studio v3, `_step-aside.js`) ═════════
 *
 * NOT A LINK OF THE CHAIN. Its input is a real photograph of the garment on a person, not the
 * previous step's output, and nothing downstream reads what it makes; the rail draws it aside,
 * without a number, and the LOCKED bar under the rail never names it. Its own refusals stand INSIDE
 * this block, above its GENERATE.
 *
 * THE ORDER OF THE BLOCK IS THE ARGUMENT. First WHAT is repainted (the one shot), then WHAT IT IS
 * REPAINTED IN (a cloth off the shelf, a new cloth, or a flat colour — one of three), then the
 * doors of the run (the lock bar with its door, GENERATE, the money line, the inventory), and in
 * the next block what came back. The prototype puts the material above the decision on every
 * generative step, and so does this one.
 *
 * ONE SHOT, ONE PAID CALL. The wire takes a list (`extra_input_media_ids`); one shot travels as a
 * list of one, and the contract is untouched. The price is a TARIFF, not a sum — and this admin
 * owns no tariff (`price_estimate` is output-only), so the money line says what it can:
 * «one paid call · priced by the server when the run starts».
 *
 * REFUSALS ARE PRINTED, NEVER HIDDEN IN A TITLE. The gate (`onModelGate`) asks two things — is
 * there something to repaint, and something to repaint it with — after the archived-name check;
 * each refusal is a lock bar with the door that lifts it: `+ photo ›` opens the fittings chooser
 * (or the library when the card has no fittings with pictures), `the paint ›` carries the eye and
 * the caret to the paint group on this same screen — no step switch, no re-render that would blow
 * the focus away.
 *
 * THE SERVER'S OWN REFUSAL OF A PRESSED GENERATE stands as the shared `RunRefusal`, verbatim: a
 * refusal by key names an environment variable, and a name that flashed in a snackbar is a name
 * nobody can pass on.
 */
export function OnModelStudio({
  band,
  techCardId,
  disabled,
  colorwayId = 0,
  colorwayLabel = '',
  colorwayArchived = false,
  colorways,
  onColorwayChange,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * THE LINK WRITTEN ON THE PICTURE THAT COMES BACK — the studio's ONE colourway state (owned by
   * the composer, `useColorwayChoice` in `studio-tab.tsx`) hands the number down; the run freezes
   * it as its `colorway_id`, and the output declares itself a picture of that colourway. `0` =
   * «not bound», a legal value.
   */
  colorwayId?: number;
  colorwayLabel?: string;
  /** Under an archived name no new picture is bought; the gate says so first, by name. */
  colorwayArchived?: boolean;
  /**
   * ═══ THE COLOURWAY CHIPS OF THE PAINT GROUP — A SECOND DOOR TO THE ONE SETTER, NOT A SECOND
   * STATE (mock-up `_step-aside.js`, `colourwayChips(s.colorwayId, 'om:way')`) ══════════════════
   *
   * The card's colourways, and the composer's own setter. Both optional, and TOGETHER: with them
   * the COLOURWAY group draws live chips (bind / unbind, as the mock-up does); without them it
   * prints the binding and says where it is changed, exactly as before. Nothing here owns a
   * number — the chips call `onColorwayChange`, which is `useColorwayChoice.setColorwayId`, the
   * same function the select on the rail calls. One writer, two doors; nothing is written into
   * the form.
   */
  colorways?: common_AdminColorwayRef[];
  onColorwayChange?: (id: number) => void;
}): JSX.Element {
  const shotDraft = useOnModelShot();
  const paintDraft = useOnModelPaint();
  const run = useStartDesignRun(techCardId);
  const [inspecting, setInspecting] = useState(false);
  /** The fittings chooser — opened by the chip in the shot group AND by the lock bar's door. */
  const [chooserOpen, setChooserOpen] = useState(false);
  /** Whether the card has a fitting with a picture — the `+ photo ›` door picks its target by it. */
  const [fittingsHavePictures, setFittingsHavePictures] = useState(false);

  const shot = shotDraft.shot;
  const shotMediaId = shot?.media.id ?? 0;
  const paint = paintDraft.paint;

  const choices = useMemo(
    () => clothChoices(band, shotMediaId > 0 ? [shotMediaId] : []),
    [band, shotMediaId],
  );

  /**
   * ONE OBJECT FOR THE GATE, THE PILLS, THE INVENTORY AND THE WIRE (J-31): `params.colour` exactly
   * as it will leave. Three readers reconstructing the body from the draft each in its own way are
   * three statements about one paid run, and they disagree silently.
   */
  const wireColour = useMemo(() => paintWire(band, paint), [band, paint]);

  const gate = useMemo(
    () => onModelGate(shotMediaId, wireColour, colorwayArchived, colorwayLabel),
    [shotMediaId, wireColour, colorwayArchived, colorwayLabel],
  );

  const generate = () => {
    if (shotMediaId <= 0) return;
    run.start({
      kind: 'recolor',
      // Nothing is typed on this screen; everything the model gets is in the fields it shows.
      ask: '',
      params: {
        // A repaint is not addressed by views; two empty lists are the one pair that does not lie.
        views: [],
        detailSlotIds: [],
        // THE LINK, FROZEN ON THE RUN — not a word in the prompt (see the colourway group).
        colorwayId,
        layout: '',
        // The paint — a cloth in `fabrics` (+ the `fabric_media_id` echo) or a bare hex.
        colour: wireColour,
        threed: undefined,
        fixTarget: '',
        // THE PHOTOGRAPH BEING RECOLOURED — the contract's own name for this list on a recolour.
        // One shot, a list of one.
        extraInputMediaIds: [shotMediaId],
        fixTargets: [],
        fixSlotIds: [],
        autoSplit: false,
        pattern: undefined,
        useFlatSlots: false,
        flatSlotIds: [],
      },
    });
  };

  /** The door `the paint ›`: the eye and the caret to the group, no re-render. */
  const goToPaint = () => {
    const group = document.getElementById('design-onmodel-paint');
    if (!group) return;
    group.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const first = group.querySelector<HTMLElement>('button:not([disabled])');
    (first ?? group).focus?.();
  };

  const door = !gate.ok ? gate.door : undefined;

  return (
    <>
      <Section
        id='design-onmodel'
        title='on model'
        question='· a real photograph, repainted'
        action={
          <>
            <Pill tone='ink'>outside the chain</Pill>
            <Counter n={shot ? 1 : 0} noun='shot' total={1} />
          </>
        }
      >
        <ShotGroup
          techCardId={techCardId}
          draft={shotDraft}
          disabled={disabled}
          chooserOpen={chooserOpen}
          onChooserOpenChange={setChooserOpen}
          onFittingsKnown={setFittingsHavePictures}
        />

        <PaintGroup
          band={band}
          techCardId={techCardId}
          shot={shot}
          paint={paint}
          draft={paintDraft}
          choices={choices}
          colour={wireColour}
          colorwayId={colorwayId}
          colorwayLabel={colorwayLabel}
          colorwayArchived={colorwayArchived}
          colorways={colorways}
          onColorwayChange={onColorwayChange}
          disabled={disabled}
        />

        <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />

        {!gate.ok && (
          <LockBar reason={`locked · ${gate.reason}`}>
            {door === 'photo' && !disabled ? (
              fittingsHavePictures ? (
                <Button variant='secondary' size='xs' onClick={() => setChooserOpen(true)}>
                  + photo ›
                </Button>
              ) : (
                <MediaSelector
                  label='+ photo'
                  purpose='design · the photograph this run repaints'
                  aspectRatio={['Custom']}
                  allowMultiple={false}
                  showVideos={false}
                  saveSelectedMedia={(media) => {
                    const first = media[0];
                    if (first?.id) shotDraft.put(libraryShot(first));
                  }}
                  trigger={
                    <Button variant='secondary' size='xs'>
                      + photo ›
                    </Button>
                  }
                />
              )
            ) : door === 'paint' ? (
              <Button variant='secondary' size='xs' onClick={goToPaint}>
                the paint ›
              </Button>
            ) : null}
          </LockBar>
        )}

        <GenerateRow
          gate={asRowGate(gate)}
          shape='one paid call'
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
        />
      </Section>

      <OnModelOutputs band={band} techCardId={techCardId} disabled={disabled} />

      {/* The inventory reads THE WIRE BODY, not the draft: it must list what actually leaves. */}
      <WhatModelGetsRenderModal
        open={inspecting}
        onOpenChange={setInspecting}
        band={band}
        kind='recolor'
        recipe={wireColour}
        sources={shot ? [shot.media] : []}
        cardFit=''
        colorwayId={colorwayId}
        colorwayLabel={colorwayLabel}
      />
    </>
  );
}
