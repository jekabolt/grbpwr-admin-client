import { cn } from 'lib/utility';
import { useDockBottom } from 'hooks/useDockBottom';
import { useTypingOnPhone } from './use-typing-on-phone';
import { useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { common_Model } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { FittingsReadonlyList } from 'components/managers/fittings/components/fittings-readonly-list';
import {
  useCreateModel,
  useUpdateModel,
} from 'components/managers/models/components/useModelQuery';
import { genderOptions } from 'constants/filter';
import { ROUTES, SECTION } from 'constants/routes';
import { failureClassOfError } from 'components/managers/tech-card/components/useTechCardAutosave';
import { notify } from 'lib/stores/store';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import {
  BackLink,
  Button,
  CalloutBox,
  Section,
  SectionStack,
  Text,
  Form,
  InputField,
  SelectField,
  TextareaField,
  useDoneFlash,
} from 'ui';
import { DefaultSizesField } from './default-sizes-field';
import { MeasurementsFields, MeasurementsHeaderActions } from './measurements-fields';
import { ModelMedia } from './model-media';
import {
  mapFormToModelInsert,
  mapModelToForm,
  ModelFormData,
  modelDefaultData,
  modelSchema,
} from './schema';
import {
  SheetMeasurementDiagram,
  SheetMeasurementFocusProvider,
  SheetMeasurementMobileStrip,
} from './sheet-measurement-focus';
import { MeasurementUnitProvider } from './units';
import './sheet-model-form.css';

export function ModelForm({
  isEditMode,
  id,
  model,
}: {
  isEditMode: boolean;
  id?: string;
  model?: common_Model;
}) {
  const saveBarRef = useRef<HTMLDivElement>(null);
  useDockBottom(saveBarRef, []);
  const typingOnPhone = useTypingOnPhone();
  const saved = useDoneFlash();
  // A refused save stands in the save bar until the next attempt.
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const createModel = useCreateModel();
  const updateModel = useUpdateModel();
  const { canWrite } = usePermissions();

  const form = useForm<ModelFormData>({
    resolver: zodResolver(modelSchema),
    defaultValues: model ? mapModelToForm(model) : modelDefaultData,
    mode: 'onSubmit',
  });

  async function handleSubmit(data: ModelFormData) {
    const modelInsert = mapFormToModelInsert(data);
    setFormError(null);
    try {
      if (isEditMode) {
        await updateModel.mutateAsync({ id: parseInt(id || '0', 10), model: modelInsert });
        saved.flash();
        form.reset(data);
      } else {
        await createModel.mutateAsync(modelInsert);
        // Leaving for the list is the receipt.
        navigate(ROUTES.models);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to submit model';
      if (failureClassOfError(error) === 'transient')
        notify({
          sev: 'error',
          subject: `MODEL ${id ?? ''}`.trim(),
          text: isEditMode ? 'not saved' : 'not added',
          detail: msg,
          action: { label: 'retry', onClick: () => void handleSubmit(data) },
        });
      else setFormError(msg);
      console.error('Failed to submit model', error);
    }
  }

  return (
    <Form {...form}>
      <MeasurementUnitProvider>
        <SheetMeasurementFocusProvider>
          <form
            className='flex flex-col gap-6 px-2 pt-2 pb-24 lg:px-6'
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <div className='flex flex-wrap items-center justify-between gap-3 border-b border-borderColor pb-3'>
              <div className='flex flex-wrap items-center gap-3'>
                <BackLink to={ROUTES.models}>models</BackLink>
                <Text variant='uppercase' size='large'>
                  {isEditMode ? 'edit model' : 'new model'}
                </Text>
              </div>
            </div>

            <SheetMeasurementMobileStrip />

            <SectionStack>
              <Section>
                <div className='flex flex-col gap-4 md:flex-row md:items-stretch'>
                  <div className='mx-auto w-full max-w-60 shrink-0 md:mx-0'>
                    <ModelMedia model={model} />
                  </div>
                  <div className='hidden min-h-0 w-60 shrink-0 border border-hairline md:flex'>
                    <SheetMeasurementDiagram className='w-full' />
                  </div>
                  <div className='flex min-w-0 flex-1 flex-col gap-3'>
                    <div className='grid grid-cols-[minmax(0,1fr)_7.5rem] items-end gap-2'>
                      <InputField name='name' label='name' />
                      <SelectField
                        name='gender'
                        label='gender'
                        items={genderOptions}
                        placeholder='select'
                      />
                    </div>
                    <DefaultSizesField />
                    <div className='sheet-comment-fill flex min-h-20 flex-1 flex-col'>
                      <TextareaField
                        name='comment'
                        label='comment'
                        maxLength={1000}
                        autoGrow={false}
                        className='min-h-20 resize-none md:min-h-0'
                      />
                    </div>
                  </div>
                </div>
              </Section>

              <Section title='measurements' action={<MeasurementsHeaderActions />}>
                <MeasurementsFields />
              </Section>

              {isEditMode && id && (
                <Section title='fittings'>
                  <FittingsReadonlyList modelId={parseInt(id, 10)} />
                </Section>
              )}
            </SectionStack>
          </form>

          <div
            ref={saveBarRef}
            className={cn(
              'fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-borderColor bg-bgColor px-3 py-2',
              typingOnPhone && 'hidden',
            )}
          >
            {formError ? (
              <CalloutBox tone='error' className='min-w-0'>
                <Text size='micro' component='span' role='alert'>
                  <b>not saved</b> · {formError}
                </Text>
              </CalloutBox>
            ) : (
              <Text variant='inactive' size='small'>
                {form.formState.isDirty ? 'unsaved changes' : ' '}
              </Text>
            )}
            <div className='flex items-center gap-2'>
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='cursor-pointer uppercase'
                onClick={() => navigate(ROUTES.models)}
              >
                cancel
              </Button>
              {canWrite(SECTION.models) && (
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  className='cursor-pointer uppercase'
                  disabled={(isEditMode && !form.formState.isDirty) || form.formState.isSubmitting}
                  loading={form.formState.isSubmitting}
                  done={saved.on}
                  onClick={() => form.handleSubmit(handleSubmit)()}
                >
                  {isEditMode ? 'save' : 'add'}
                </Button>
              )}
            </div>
          </div>
        </SheetMeasurementFocusProvider>
      </MeasurementUnitProvider>
    </Form>
  );
}
