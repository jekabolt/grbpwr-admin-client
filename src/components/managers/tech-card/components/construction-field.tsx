import InputField from 'ui/form/fields/input-field';
import TextareaField from 'ui/form/fields/textarea-field';

// General workmanship parameters (Sheet «Обработка», upper block). 1:1 — sent as
// unset when every field is blank (see mapConstructionOut).
export function ConstructionField() {
  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
        <InputField name='construction.mainStitchType' label='main stitch type' />
        <InputField name='construction.stitchDensity' label='stitch density (st/cm)' />
        <InputField name='construction.overlockThreads' label='overlock threads' />
        <InputField name='construction.seamAllowances' label='seam allowances' />
        <InputField name='construction.hemFinish' label='hem finish' />
        <InputField name='construction.pressing' label='pressing / finish' />
        <InputField name='construction.machineClass' label='machine class' />
        <InputField
          name='construction.labourRate'
          label='labour rate (cost / min)'
          placeholder='0.50'
        />
        <InputField
          name='construction.labourRateCurrency'
          label='labour currency'
          placeholder='EUR'
        />
      </div>
      <TextareaField name='construction.notes' label='notes' rows={2} maxLength={2000} />
    </div>
  );
}
