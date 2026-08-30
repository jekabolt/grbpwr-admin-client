import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useState } from 'react';

import { EmptyStudio } from './empty-studio';
import { GenerationForm, hasAnyPictures, hasFlatRun } from './generation-form';
import { GenerationHistory } from './generation-history';

/**
 * THE GENERATIVE HALF, COMPOSED — the prototype's own assembly rule, in one place.
 *
 * `proto.html:3873` (`briefContent`) is the normative line, and it is not obvious enough to be
 * left to memory:
 *
 *   paramsVisible = «this card has a flat run» OR «the human asked for the form»
 *   anyContent    = runs OR uploads exist
 *
 *   form      → drawn when paramsVisible
 *   history   → drawn when anyContent; otherwise the EMPTY STUDIO, but only while the form is shut
 *   the doors → drawn when there IS content but the form is shut  (they live inside the form)
 *
 * The consequence worth stating: THE EMPTY STUDIO AND THE OPEN FORM ARE MUTUALLY EXCLUSIVE. Once
 * the human has asked for the form, the «nothing here yet» block has nothing left to say and the
 * form is the answer to its own question.
 *
 * This composer is offered so the rule cannot drift; every part of it is exported separately for a
 * page that wants to arrange them differently.
 *
 * IT DOES NOT MOUNT `FixContextProvider`. A fix is STARTED from a bench slot and CARRIED OUT by the
 * form, so the provider has to sit above both — mounting one here would shadow an outer one and
 * silently split the state in two. Put `FixContextProvider` beside `PickModeProvider`.
 */
export function GenerationStudio({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}) {
  // Derived, with an explicit fold winning from then on — the data never fights a human's choice.
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? hasFlatRun(band);
  const anyContent = hasAnyPictures(band);

  return (
    <>
      <GenerationForm
        band={band}
        techCardId={techCardId}
        disabled={disabled}
        open={open}
        onOpenChange={setManual}
      />
      {anyContent ? (
        <GenerationHistory band={band} techCardId={techCardId} disabled={disabled} />
      ) : (
        !open && (
          <EmptyStudio
            band={band}
            techCardId={techCardId}
            disabled={disabled}
            onGenerate={() => setManual(true)}
          />
        )
      )}
    </>
  );
}
