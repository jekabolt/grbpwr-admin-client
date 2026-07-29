import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Accordion } from 'ui/components/accordion';
import Text from 'ui/components/text';
import ComboField from 'ui/form/fields/combo-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { seamAllowanceOptions, stitchDensityOptions } from './operation-options';
import {
  hemFinishOptions,
  machineClassOptions,
  mainStitchTypeOptions,
  overlockThreadsOptions,
  pressingOptions,
} from './tech-card-options';

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
          general — finishing &amp; defaults
        </Text>
      }
      meta={
        <Text size='micro' variant='label' component='span'>
          всё опционально
        </Text>
      }
    >
      <Text size='micro' variant='label' className='mb-2'>
        Общие параметры обработки по умолчанию. Конкретные значения по шагам задавайте в операциях
        ниже.
      </Text>
      <div className='grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3'>
        <ComboField
          name='construction.mainStitchType'
          label='main stitch type'
          options={mainStitchTypeOptions}
        />
        <ComboField
          name='construction.stitchDensity'
          label='stitch density (st/cm)'
          options={stitchDensityOptions}
        />
        <ComboField
          name='construction.overlockThreads'
          label='overlock threads'
          options={overlockThreadsOptions}
        />
        <ComboField
          name='construction.seamAllowances'
          label='seam allowances'
          options={seamAllowanceOptions}
        />
        <ComboField name='construction.hemFinish' label='hem finish' options={hemFinishOptions} />
        <ComboField
          name='construction.pressing'
          label='pressing / finish'
          options={pressingOptions}
        />
        <ComboField
          name='construction.machineClass'
          label='machine class'
          options={machineClassOptions}
        />
      </div>
      <div className='mt-2'>
        <TextareaField name='construction.notes' label='notes' rows={2} maxLength={2000} />
      </div>
    </Accordion>
  );
}
