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
  return (
    <details>
      <summary className='cursor-pointer select-none text-textBaseSize uppercase text-labelColor hover:text-text'>
        construction details — всё опционально, задайте только нужные умолчания
      </summary>
      <div className='mt-3 space-y-3'>
        <Text variant='inactive' size='small'>
          Общие параметры обработки по умолчанию. Конкретные значения по шагам задавайте в
          операциях ниже.
        </Text>
        <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
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
          <ComboField
            name='construction.hemFinish'
            label='hem finish'
            options={hemFinishOptions}
          />
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
        <TextareaField name='construction.notes' label='notes' rows={2} maxLength={2000} />
      </div>
    </details>
  );
}
