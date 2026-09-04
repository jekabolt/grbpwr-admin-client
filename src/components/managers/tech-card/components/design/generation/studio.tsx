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
        /* ═══ ЛЕНТА ФЛЭТА ОТКРЫВАЕТСЯ НА ФЛЭТАХ И РАЗВЁРНУТОЙ (E-14, и НЕ E-21…E-23) ══════════
         *
         * `defaultRep='flat'` — владелец, дословно: «в FLAT — SHEET GENERATION HISTORY
         * REPRESENTATION по дефолту фильтр на флеты только». Это НАЧАЛЬНОЕ положение сегмента, а
         * не запрет: все шесть его положений достижимы, и `'all'` в одном нажатии. Тем самым
         * последняя из пяти вкладок перестала открываться на «all» — правило J-12/J-18/J-31
         * («каждая открывается на своём роде») стало общим, без исключения.
         *
         * ⚠ И РАЗВЁРНУТОЙ — ЭТО ВТОРАЯ ПОЛОВИНА ТОГО ЖЕ РЕШЕНИЯ, И ОНА ЯВНАЯ, А НЕ УМОЛЧАНИЕ.
         * Владелец свернул ленту на четырёх вкладках (E-21…E-23) и НЕ назвал FLAT — потому что
         * над лентой здесь нет раздела выходов: у флэта их не бывает («the bench slot IS the
         * choice for a flat»), и лента — единственное место, где видно, что прогон вернул.
         * Свернуть её тут значило бы спрятать сам результат генерации за нажатием.
         */
        <GenerationHistory
          band={band}
          techCardId={techCardId}
          disabled={disabled}
          defaultRep='flat'
          defaultOpen
        />
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
