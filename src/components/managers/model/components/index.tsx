import { zodResolver } from '@hookform/resolvers/zod';
import { common_Model } from 'api/proto-http/admin';
import { FittingsReadonlyList } from 'components/managers/fittings/components/fittings-readonly-list';
import {
  useCreateModel,
  useUpdateModel,
} from 'components/managers/models/components/useModelQuery';
import { genderOptions } from 'constants/filter';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { DefaultSizesField } from './default-sizes-field';
import { MeasurementsFields } from './measurements-fields';
import { ModelMedia } from './model-media';
import {
  mapFormToModelInsert,
  mapModelToForm,
  ModelFormData,
  modelDefaultData,
  modelSchema,
} from './schema';

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`space-y-4 border border-textColor p-4 ${className ?? ''}`}>
      <Text variant='uppercase' size='large'>
        {title}
      </Text>
      {children}
    </section>
  );
}

export function ModelForm({
  isEditMode,
  id,
  model,
}: {
  isEditMode: boolean;
  id?: string;
  model?: common_Model;
}) {
  const { showMessage } = useSnackBarStore();
  const navigate = useNavigate();
  const createModel = useCreateModel();
  const updateModel = useUpdateModel();

  const form = useForm<ModelFormData>({
    resolver: zodResolver(modelSchema),
    defaultValues: model ? mapModelToForm(model) : modelDefaultData,
    mode: 'onSubmit',
  });

  async function handleSubmit(data: ModelFormData) {
    const modelInsert = mapFormToModelInsert(data);
    try {
      if (isEditMode) {
        await updateModel.mutateAsync({ id: parseInt(id || '0', 10), model: modelInsert });
        showMessage('model updated', 'success');
        form.reset(data);
      } else {
        await createModel.mutateAsync(modelInsert);
        showMessage('model created', 'success');
        navigate(ROUTES.models);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to submit model';
      showMessage(msg, 'error');
      console.error('Failed to submit model', error);
    }
  }

  return (
    <Form {...form}>
      <form
        className='flex flex-col gap-6 px-2 pt-2 pb-24 lg:px-6'
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textColor pb-3'>
          <div className='flex flex-wrap items-center gap-3'>
            <Button asChild variant='secondary' size='lg'>
              <Link to={ROUTES.models}>← models</Link>
            </Button>
            <Text variant='uppercase' size='large'>
              {isEditMode ? 'edit model' : 'new model'}
            </Text>
          </div>
        </div>

        <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
          <Section title='details' className='w-full lg:w-1/2'>
            <InputField name='name' label='name' placeholder='enter model name' />
            <SelectField
              name='gender'
              label='gender (optional)'
              items={genderOptions}
              placeholder='select gender'
            />
            <DefaultSizesField />
            <TextareaField name='comment' label='comment (optional)' rows={4} maxLength={1000} />
            <div className='space-y-1'>
              <Text variant='uppercase' size='small'>
                photos
              </Text>
              <ModelMedia model={model} />
            </div>
          </Section>

          <Section title='measurements' className='w-full lg:w-1/2'>
            <MeasurementsFields />
          </Section>
        </div>

        {isEditMode && id && (
          <Section title='fittings'>
            <FittingsReadonlyList modelId={parseInt(id, 10)} />
          </Section>
        )}
      </form>

      <div className='fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-textColor bg-bgColor px-3 py-2'>
        <Text variant='inactive' size='small'>
          {form.formState.isDirty ? 'unsaved changes' : ' '}
        </Text>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase cursor-pointer'
            onClick={() => navigate(ROUTES.models)}
          >
            cancel
          </Button>
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase cursor-pointer'
            disabled={(isEditMode && !form.formState.isDirty) || form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
            onClick={() => form.handleSubmit(handleSubmit)()}
          >
            {isEditMode ? 'save' : 'add'}
          </Button>
        </div>
      </div>
    </Form>
  );
}
