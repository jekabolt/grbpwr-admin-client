import type { GetDesignBandResponse, common_AdminColorwayRef } from 'api/proto-http/admin';
import { useMemo, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';

import { GenerateRow, LockBar, RunRefusal } from '../render/generate-row';
import { useStartDesignRun } from '../render/use-design-run';
import { WhatModelGetsRenderModal } from '../render/what-model-gets';
import { useOnModelPaint, useOnModelShot } from './drafts';
import { asRowGate, clothChoices, onModelGate, paintWire, shotMediaIds } from './model';
import { OnModelOutputs } from './outputs';
import { PaintGroup } from './paint-group';
import { ShotGroup } from './shot-group';

/**
 * ═══ ON MODEL — THE ASIDE: a real photograph, repainted (studio v3, `_step-aside.js`) ═════════
 *
 * NOT A LINK OF THE CHAIN. Its input is a real photograph of the garment on a person, not the
 * previous step's output, and nothing downstream reads what it makes; the rail draws it aside,
 * without a number, and the LOCKED bar under the rail never names it. Its own refusals stand INSIDE
 * this block, above its GENERATE.
 *
 * THE ORDER OF THE BLOCK IS THE ARGUMENT. First WHAT is repainted (the strip of shots), then WHAT
 * IT IS REPAINTED IN (a cloth off the shelf, a new cloth, a pantone colour — or a cloth AND a
 * colour together, r3 п.43), then the
 * doors of the run (the lock bar with its door, GENERATE, the money line, the inventory), and in
 * the next block what came back. The prototype puts the material above the decision on every
 * generative step, and so does this one.
 *
 * ONE PAID CALL PER PHOTOGRAPH, AND THE STRIP HOLDS UP TO 24 (r3 п.42). The wire field is a list
 * (`extra_input_media_ids`) and always was; the round before this one narrowed the screen to one
 * shot and the owner sent it back. The price is a TARIFF, not a sum — and this admin owns no
 * tariff (`price_estimate` is output-only) — so the money line names the RULE and never a number
 * of dollars multiplied out of `shots.length`: «one call per photograph · priced by the server
 * when the run starts».
 *
 * REFUSALS ARE PRINTED, NEVER HIDDEN IN A TITLE. The gate (`onModelGate`) asks two things — is
 * there something to repaint, and something to repaint it with (a cloth, a colour, or BOTH — the
 * exclusive «one of three» is gone, r3 п.43) — after the archived-name check; each refusal is a
 * lock bar with THE DOOR THAT CARRIES THE EYE TO WHERE IT IS LIFTED, and never a second copy of
 * that door: `the shots ›` scrolls to the strip and focuses its first control, `the paint ›` does
 * the same for the paint group — no step switch, no re-render that would blow the focus away.
 *
 * ⚠ THE LOCK BAR NO LONGER OPENS THE LIBRARY ITSELF (r3, Fable №5). It carried its own
 * `MediaSelector` — a SECOND door into the same library, two centimetres above the strip's own
 * dashed tail, and a worse one: it had no `limit`, so a person could pick past the 24 the run
 * takes and watch the extras vanish without the strip's «N did not go in» line, which is counted
 * by the tail alone. Owner: «не делай разные кнопки для одного и того же». One door remains — the
 * tail of the strip — and the bar points at it.
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
  const shotDraft = useOnModelShot(techCardId);
  const paintDraft = useOnModelPaint(techCardId);
  const run = useStartDesignRun(techCardId);
  const [inspecting, setInspecting] = useState(false);

  /**
   * ⚠ THE CARD CHANGED — THE OPEN INVENTORY IS ABOUT THE OTHER CARD (invariant 12). The two drafts
   * empty themselves inside their own hooks (`./drafts`); what is left here is the modal, and a
   * modal listing A's photographs over B's screen is the same lie one layer up. In the body of the
   * render, never in an effect — the committed frame in between is a frame a person can act on.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (inspecting) setInspecting(false);
  }

  const shots = shotDraft.shots;
  /** THE LIST, IN THE ORDER IT LEAVES — the gate, the shelf and the wire all read this one array. */
  const mediaIds = useMemo(() => shotMediaIds(shots), [shots]);
  const paint = paintDraft.paint;

  const choices = useMemo(() => clothChoices(band, mediaIds), [band, mediaIds]);

  /**
   * ONE OBJECT FOR THE GATE, THE PILLS, THE INVENTORY AND THE WIRE (J-31): `params.colour` exactly
   * as it will leave. Three readers reconstructing the body from the draft each in its own way are
   * three statements about one paid run, and they disagree silently.
   */
  const wireColour = useMemo(() => paintWire(band, paint), [band, paint]);

  const gate = useMemo(
    () => onModelGate(mediaIds, wireColour, colorwayArchived, colorwayLabel),
    [mediaIds, wireColour, colorwayArchived, colorwayLabel],
  );

  const generate = () => {
    if (mediaIds.length === 0) return;
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
        // THE PHOTOGRAPHS BEING RECOLOURED — the contract's own name for this list on a recolour,
        // in the order the strip shows them; the run returns one picture per entry.
        extraInputMediaIds: mediaIds,
        fixTargets: [],
        fixSlotIds: [],
        autoSplit: false,
        pattern: undefined,
        // НЕ ПЛЕЙГРАУНД: поле осмысленно только на kind=freeform и на любом другом роде
        // отвергается сервером (`freeform_forbidden`), поэтому здесь оно названо пустым вслух.
        freeform: undefined,
        useFlatSlots: false,
        flatSlotIds: [],
      },
    });
  };

  /**
   * THE DOORS OF THE LOCK BAR — the eye and the caret to the organ that lifts the refusal, and no
   * organ of their own. Both refusals are fixed ON THIS SCREEN, so a door that DID something would
   * be a second copy of a control standing a few centimetres away.
   */
  const goTo = (id: string) => () => {
    const group = document.getElementById(id);
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
        /* ⚠ СЧЁТЧИК СНИМКОВ ИЗ ШАПКИ СНЯТ (r3, Fable №6). Он печатал «3 SHOTS» в двух сантиметрах
           над «3 OF 24 SHOTS» на линейке группы — один факт двумя органами, и худшим из двух:
           потолок 24 знает только линейка. Владелец п.2: «и так видно». */
        action={<Pill tone='ink'>outside the chain</Pill>}
      >
        <ShotGroup techCardId={techCardId} draft={shotDraft} disabled={disabled} />

        <PaintGroup
          band={band}
          techCardId={techCardId}
          hasShots={shots.length > 0}
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
              <Button variant='secondary' size='xs' onClick={goTo('design-onmodel-shots')}>
                the shots ›
              </Button>
            ) : door === 'paint' ? (
              <Button variant='secondary' size='xs' onClick={goTo('design-onmodel-paint')}>
                the paint ›
              </Button>
            ) : null}
          </LockBar>
        )}

        <GenerateRow
          gate={asRowGate(gate)}
          shape='one call per photograph'
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
        sources={shots.map((s) => s.media)}
        cardFit=''
        colorwayId={colorwayId}
        colorwayLabel={colorwayLabel}
      />
    </>
  );
}
