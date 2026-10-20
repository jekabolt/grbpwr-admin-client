import { common_Model } from 'api/proto-http/admin';
import { SamplePicker } from 'components/managers/tech-card/components/sample-picker';
import { useMediaQuery } from 'components/managers/tasks/hooks/useMediaQuery';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Drawer, GroupLabel, InputField, SelectField, Text } from 'ui';
import { Mannequin } from './mannequin';
import { RecordedByField } from './recorded-by-field';
import { FittingFormData } from './schema';
import { TechCardField } from './tech-card-field';

export const PHONE_WORKSPACE_QUERY = '(max-width: 767px)';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size='micro' variant='label' className='uppercase tracking-label' component='span'>
      {children}
    </Text>
  );
}

// «Details» drawer of the fitting workspace: the session links (tech card, sample, model, date,
// recorded by) and the model's measurements on the mannequin. Every field is form-backed, so the
// shell's autosave stores it like any other change.
export function DetailsDrawer({
  open,
  onOpenChange,
  models,
  readOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: common_Model[];
  readOnly: boolean;
}) {
  const { control, setValue } = useFormContext<FittingFormData>();
  const techCardId = useWatch({ control, name: 'techCardId' }) || 0;
  const sampleId = useWatch({ control, name: 'sampleId' }) || 0;
  const modelId = useWatch({ control, name: 'modelId' }) || 0;
  const phone = useMediaQuery(PHONE_WORKSPACE_QUERY);

  const modelOptions = useMemo(
    () => [
      { value: 0, label: '— none —' },
      ...models.map((m) => ({
        value: m.id ?? 0,
        label: m.model?.name ? `${m.model.name} (#${m.id})` : `#${m.id}`,
      })),
    ],
    [models],
  );
  const model = models.find((m) => m.id === modelId);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title='details'
      width={phone ? window.innerWidth : 440}
    >
      <fieldset
        disabled={readOnly}
        className='m-0 grid min-w-0 gap-stack overflow-x-clip border-0 p-0'
      >
        <GroupLabel flush>session</GroupLabel>
        <div className='grid gap-1'>
          <FieldLabel>tech card</FieldLabel>
          <TechCardField />
        </div>
        <div className='grid gap-1'>
          <FieldLabel>sample</FieldLabel>
          <SamplePicker
            techCardId={techCardId || undefined}
            value={sampleId}
            disabled={readOnly}
            onChange={(id) => setValue('sampleId', id, { shouldDirty: true })}
          />
        </div>
        <SelectField name='modelId' label='model' items={modelOptions} valueAsNumber />
        <InputField name='fittingDate' type='date' label='date' />
        <RecordedByField isEditMode />
        {!!model && (
          <>
            <GroupLabel>{`${model.model?.name || `#${model.id}`} · mm`}</GroupLabel>
            <Mannequin measurements={model.model?.measurements} />
          </>
        )}
      </fieldset>
    </Drawer>
  );
}
