import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';

import { GenerateRow, LockBar, RunRefusal } from '../render/generate-row';
import { useStartDesignRun } from '../render/use-design-run';
import { AskGroup } from './ask-group';
import { usePlaygroundDraft } from './drafts';
import {
  asRowGate,
  playgroundGate,
  presetByKey,
  presetsOf,
  runShape,
  wireParams,
} from './model';
import { PlaygroundOutputs } from './outputs';
import { PicturesGroup } from './pictures-group';
import { PlaygroundRecallIntake } from './recall';
import { WhatModelGetsPlaygroundModal } from './what-model-gets';

/**
 * ═══ PLAYGROUND — PICTURES, WORDS, ONE RUN (the second aside) ═════════════════════════════════
 *
 * NOT A LINK OF THE CHAIN, and further outside it than ON MODEL: its input is whatever a person
 * lays on the table, nothing downstream reads what it makes, and it binds no colourway at all. The
 * rail draws it aside, without a number.
 *
 * ⚠ THE CELL EXISTS ONLY WHERE THE SERVER SAYS SO. `band.freeformPresets` absent = a binary older
 * than the route, and the rail draws NO cell (`playgroundOffered`); `[]` = the code is there and
 * the keys are not, the cell exists and this screen says so in words (`AskGroup`). That doctrine —
 * «absent ≠ empty» — is the same one `has_fabric_render` and the colour plan already live by, and
 * it is what lets the client ship to production before the production backend catches up.
 *
 * THE ORDER OF THE BLOCK IS THE ARGUMENT, and it is the prototype's: first WHAT is on the table
 * (the strip, and marking on it), then WHAT IS ASKED of it (the preset and the words), then the
 * doors of the run (the refusal, the lock bar with the door that lifts it, GENERATE and the
 * inventory), and in the next block what came back.
 *
 * ⚠ ONE PICTURE PER RUN — the owner's own number, and the server's (`designRequestedOutputs`
 * returns 1 for both kinds). The row says «1 picture» / «1 cut-out» and never «3 variants».
 *
 * ⚠ TWO KINDS BEHIND FOUR CHIPS. `cutout` is not a preset of `freeform`: it is a run kind of its
 * own with its own provider and its own key, so the chip decides which door the press takes. The
 * body is built by ONE function (`wireParams`) that the gate, the inventory and this press all
 * read — see the argument there.
 */
export function PlaygroundStudio({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const draft = usePlaygroundDraft(techCardId);
  const run = useStartDesignRun(techCardId);
  const [inspecting, setInspecting] = useState(false);

  /**
   * ⚠ THE CARD CHANGED — THE OPEN INVENTORY IS ABOUT THE OTHER CARD (invariant 12). The draft
   * empties itself inside its own hook; what is left here is the modal, and a modal listing A's
   * pictures over B's screen is the same lie one layer up. In the body of the render, never in an
   * effect — the committed frame in between is a frame a person can act on.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (inspecting) setInspecting(false);
  }

  const presets = useMemo(() => presetsOf(band), [band]);
  const preset = presetByKey(presets, draft.state.preset);
  const gate = useMemo(() => playgroundGate(draft.state, preset), [draft.state, preset]);

  const generate = () => {
    if (!preset || !gate.ok) return;
    run.start({
      kind: preset.kind,
      /* A CUT-OUT CARRIES NO WORDS, AND THAT IS ENFORCED HERE RATHER THAN HOPED FOR: the ask box is
         not drawn under that chip, but a person may have typed under another chip and then
         switched. The server refuses `cutout_takes_no_words`, so what is not drawn is not sent. */
      ask: preset.kind === 'cutout' ? '' : draft.state.ask.trim(),
      params: wireParams(draft.state, preset),
    });
  };

  /**
   * THE DOOR OF THE LOCK BAR — the eye and the caret to the organ that lifts the refusal, and no
   * organ of its own. Every refusal of this screen is fixed ON this screen, so a door that DID
   * something would be a second copy of a control standing a few centimetres away.
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
      {/* «RUN THAT AGAIN» FROM THE HISTORY LANDS HERE — the receiver draws nothing (see its file). */}
      <PlaygroundRecallIntake techCardId={techCardId} draft={draft} disabled={disabled} />

      <Section
        id='design-playground'
        title='playground'
        question='· pictures, words, one run'
        action={<Pill tone='ink'>outside the chain</Pill>}
      >
        <PicturesGroup
          band={band}
          techCardId={techCardId}
          draft={draft}
          preset={preset}
          disabled={disabled}
        />

        <AskGroup presets={presets} preset={preset} draft={draft} disabled={disabled} />

        <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />

        {!gate.ok && (
          <LockBar reason={`locked · ${gate.reason}`}>
            {door === 'preset' && !disabled ? (
              <Button variant='secondary' size='xs' onClick={goTo('design-playground-ask')}>
                the ask ›
              </Button>
            ) : door === 'areas' && !disabled ? (
              <Button
                variant='secondary'
                size='xs'
                onClick={goTo('design-playground-pictures-in')}
              >
                mark an area ›
              </Button>
            ) : door === 'pictures' && !disabled ? (
              <Button
                variant='secondary'
                size='xs'
                onClick={goTo('design-playground-pictures-in')}
              >
                add a picture ›
              </Button>
            ) : null}
          </LockBar>
        )}

        <GenerateRow
          gate={asRowGate(gate)}
          shape={runShape(preset)}
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
        />
      </Section>

      <PlaygroundOutputs band={band} techCardId={techCardId} disabled={disabled} />

      {/* The inventory reads the DRAFT through the same functions the wire does — see its header. */}
      <WhatModelGetsPlaygroundModal
        open={inspecting}
        onOpenChange={setInspecting}
        state={draft.state}
        preset={preset}
      />
    </>
  );
}
