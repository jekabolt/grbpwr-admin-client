import { ComboField, DecimalField, SelectField } from 'ui';
import { AiTextareaField } from 'components/managers/tech-card/ai-enhance/ai-textarea-field';
import { EquipmentParkField } from './equipment-park';
import { seamClassOptions } from './operation-options';

import { hemFinishOptions } from './tech-card-options';

// General workmanship parameters (Sheet «Обработка», upper block): what a step inherits when it
// doesn't override it. 1:1 — sent as unset when every field is blank (see mapConstructionOut).
// Guided combos, not closed sets. The fold (and opening it on a server or client error, so
// revealField finds the control) belongs to the STANDARDS block in construction-tab.tsx.
export function ConstructionField() {
  return (
    <>
      <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3'>
        <SelectField
          name='construction.defaultSeamClass'
          label='default seam class'
          items={seamClassOptions}
        />
        <DecimalField
          name='construction.defaultStitchesPerCm'
          label='default stitch density (st/cm)'
          // Two, not DecimalField's default three: the column stores hundredths and rounds the rest
          // silently. The schema refuses the third place as well — this only keeps it untypeable.
          maxDecimals={2}
          placeholder='4'
        />
        <ComboField name='construction.hemFinish' label='hem finish' options={hemFinishOptions} />
        {/* TWO CONTROLS LEFT HERE WITH 0306 and they are not coming back in this shape.
            «overlock threads» was ONE number per card: it could describe one overlock, and a card is
            sewn on several — the migration turned each card's count into a real overlock profile.
            «pressing / finish» was prose answering «how is it pressed» for a whole garment, when
            pressing is a STEP with its own equipment, temperature and dwell; the migration moved the
            text into `notes`. Both are gone from the contract, so leaving the controls would have
            bound them to form fields that no longer travel — visible, editable, silently discarded.
            The equipment park below takes their place. */}
      </div>
      <div className='mt-2'>
        <AiTextareaField
          name='construction.notes'
          label='notes'
          rows={2}
          maxLength={2000}
          enhance='note'
        />
      </div>
      {/* MACHINES & PRESSING — the same question as the three fields above («what does a step
          inherit») asked of the equipment instead of the workmanship, and the reason it sits inside
          this block rather than beside it: a step resolves ONE ladder, and its rungs must not be
          spread across two places on the tab. */}
      <EquipmentParkField />
    </>
  );
}
