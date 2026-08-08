import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Accordion } from 'ui/components/accordion';
import Text from 'ui/components/text';
import ComboField from 'ui/form/fields/combo-field';
import DecimalField from 'ui/form/fields/decimal-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { seamClassOptions } from './operation-options';

// 3/4/5 threads is the whole real range of an overlock; 0 = not set. A closed list rather than a
// number field because there is no fourth answer, and a free number invites «4-нит.» back.
const overlockThreadCountOptions = [
  { value: 0, label: '— threads —' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
];
import { hemFinishOptions, pressingOptions } from './tech-card-options';

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
    formState: { errors },
  } = useFormContext();
  const hasError = !!errors.construction;
  useEffect(() => {
    if (hasError) setOpen(true);
  }, [hasError]);

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
        <Text size='micro' variant='label' component='span'>
          всё опционально
        </Text>
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
        <SelectField
          name='construction.overlockThreadCount'
          label='overlock threads'
          items={overlockThreadCountOptions}
          valueAsNumber
        />
        <ComboField name='construction.hemFinish' label='hem finish' options={hemFinishOptions} />
        <ComboField
          name='construction.pressing'
          label='pressing / finish'
          options={pressingOptions}
        />
      </div>
      <div className='mt-2'>
        <TextareaField name='construction.notes' label='notes' rows={2} maxLength={2000} />
      </div>
    </Accordion>
  );
}
