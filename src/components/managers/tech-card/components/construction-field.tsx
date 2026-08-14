import { useEffect, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Accordion } from 'ui/components/accordion';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import ComboField from 'ui/form/fields/combo-field';
import DecimalField from 'ui/form/fields/decimal-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { EquipmentParkField } from './equipment-park';
import { seamClassOptions } from './operation-options';
import { TechCardFormData } from './schema';

import { hemFinishOptions } from './tech-card-options';

// General workmanship parameters (Sheet «Обработка», upper block). 1:1 — sent as
// unset when every field is blank (see mapConstructionOut). Guided combos, not closed sets.
// Collapsed by default (all optional) so this isn't a wall of empty pickers — expand only when
// the factory needs a default beyond what's set per-operation.
export function ConstructionField() {
  const [open, setOpen] = useState(false);
  // Every field in here is optional, so nothing the CLIENT validates lands on them — but the SERVER
  // can pin a field violation onto construction.* (applyServerFieldErrors → setError), and the error
  // router switches to this tab and calls revealField. Behind a closed accordion the field is not in
  // the DOM at all, so the reveal silently fails and the toast names a field the user cannot see.
  // Open on error, the way BomTile does (19.8).
  const {
    control,
    formState: { errors },
  } = useFormContext<TechCardFormData>();
  const hasError = !!errors.construction;
  useEffect(() => {
    if (hasError) setOpen(true);
  }, [hasError]);

  // THE FOLDED BLOCK HAS TO ADVERTISE THE PARK. Everything else in here is a lone optional field
  // whose absence costs nothing, but the equipment profiles are what every machine and ВТО step
  // inherits from — a card whose park is empty prints steps with no settings at all, and a closed
  // accordion saying only «всё опционально» is where that goes unnoticed.
  const machineCount = ((useWatch({ control, name: 'construction.equipmentDefaults.machines' }) ??
    []) as unknown[]).length;
  const pressCount = ((useWatch({ control, name: 'construction.equipmentDefaults.presses' }) ??
    []) as unknown[]).length;

  return (
    <Accordion
      open={open}
      onOpenChange={setOpen}
      title={
        <Text size='control' variant='uppercase' tracking='label' component='span'>
          card defaults — what a step inherits
        </Text>
      }
      meta={
        machineCount + pressCount > 0 ? (
          // Written as counters rather than as a phrase: «1 machines» is the shape a plural rule
          // would have to exist to avoid, and this pill has room for neither.
          <Pill tone='mut'>
            machines {machineCount} · ВТО {pressCount}
          </Pill>
        ) : (
          <Text size='micro' variant='label' component='span'>
            no equipment yet
          </Text>
        )
      }
    >
      <Text size='micro' variant='label' className='mb-2'>
        Что шаг наследует, когда не переопределяет. Пустое поле здесь — «не задано»; пустое поле в
        шаге — «как на карточке».
      </Text>
      <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3'>
        <SelectField
          name='construction.defaultSeamClass'
          label='default seam class'
          items={seamClassOptions}
        />
        <DecimalField
          name='construction.defaultStitchesPerCm'
          label='default stitch density (st/cm)'
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
        <TextareaField name='construction.notes' label='notes' rows={2} maxLength={2000} />
      </div>
      {/* MACHINES & PRESSING — the same question as the three fields above («what does a step
          inherit») asked of the equipment instead of the workmanship, and the reason it sits inside
          this block rather than beside it: a step resolves ONE ladder, and its rungs must not be
          spread across two places on the tab. */}
      <EquipmentParkField />
    </Accordion>
  );
}
