import { zodResolver } from '@hookform/resolvers/zod';
import { common_Fitting, common_MediaFull } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  useCreateFitting,
  useUpdateFitting,
} from 'components/managers/fittings/components/useFittingQuery';
import { ModelMeasurementsView } from 'components/managers/model/components/measurements-view';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { SamplePicker } from 'components/managers/tech-card/components/sample-picker';
import { fittingStatusOptions, fittingVerdictOptions } from 'constants/filter';
import { ROUTES, SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { ChangeRequestsFields } from './change-requests-fields';
import { FittingCallouts } from './fitting-callouts';
import { FittingMedia } from './fitting-media';
import { PatternsFields } from './patterns-fields';
import { ProductField } from './product-field';
import { TechCardField } from './tech-card-field';
import {
  FittingFormData,
  fittingDefaultData,
  fittingSchema,
  mapFittingToForm,
  mapFormToFittingInsert,
  todayDateInput,
} from './schema';
import { SizesFields } from './sizes-fields';

// Structured round outcome (raw strings per the FittingInsert contract; distinct from verdict).
const fittingOutcomeOptions = [
  { value: '', label: 'undecided' },
  { value: 'approved', label: 'approved' },
  { value: 'new_round', label: 'new round' },
  { value: 'dropped', label: 'dropped' },
];

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
    <section className={`space-y-4 border border-textInactiveColor p-4 ${className ?? ''}`}>
      <Text variant='uppercase' size='large'>
        {title}
      </Text>
      {children}
    </section>
  );
}

export function FittingForm({
  isEditMode,
  id,
  fitting,
}: {
  isEditMode: boolean;
  id?: string;
  fitting?: common_Fitting;
}) {
  const { showMessage } = useSnackBarStore();
  const navigate = useNavigate();
  const createFitting = useCreateFitting();
  const updateFitting = useUpdateFitting();
  const { canWrite } = usePermissions();
  const { data: models } = useAllModels();
  const [searchParams] = useSearchParams();
  // Deep-link from the tech card editor: /add-fitting?techCardId=123 pre-links the style;
  // the sample panel adds &sampleId=45 to pre-link the specific sample tried on (W3.4).
  const initialTechCardId = Number(searchParams.get('techCardId')) || 0;
  const initialSampleId = Number(searchParams.get('sampleId')) || 0;
  // Where to go after saving — the sample panel passes ?returnTo=<its URL> so we land back there
  // instead of the flat fittings list (R-5). Only in-app paths: an absolute/protocol-relative
  // value would make navigate() throw AFTER a successful create, reading as a failed submit.
  const rawReturnTo = searchParams.get('returnTo') || '';
  const returnTo = rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '';

  const form = useForm<FittingFormData>({
    resolver: zodResolver(fittingSchema),
    defaultValues: fitting
      ? mapFittingToForm(fitting)
      : {
          ...fittingDefaultData,
          fittingDate: todayDateInput(),
          techCardId: initialTechCardId,
          sampleId: initialSampleId,
        },
    mode: 'onSubmit',
  });

  const modelOptions = useMemo(
    () => [
      { value: 0, label: '— none —' },
      ...(models ?? []).map((m) => ({
        value: m.id ?? 0,
        label: m.model?.name ? `${m.model.name} (#${m.id})` : `#${m.id}`,
      })),
    ],
    [models],
  );

  const selectedModelId = form.watch('modelId');
  const selectedModel = (models ?? []).find((m) => m.id === selectedModelId);
  // The sample chooser is only meaningful once a style is linked (ListSamples needs a tech card).
  const selectedTechCardId = form.watch('techCardId');
  const selectedSampleId = form.watch('sampleId');
  // Drop a stale sample link whenever the style changes — a sample belongs to its tech card.
  // Tracking the previous id also covers a direct A→B switch (possible on a cold cache, when
  // the picker shows the search box before GetTechCard resolves), not just unlink→relink.
  const prevTechCardId = useRef(selectedTechCardId);
  useEffect(() => {
    const changed = prevTechCardId.current !== selectedTechCardId;
    prevTechCardId.current = selectedTechCardId;
    if (changed && selectedSampleId) {
      form.setValue('sampleId', 0, { shouldDirty: true });
    }
  }, [selectedTechCardId, selectedSampleId, form]);

  // Resolved-media map shared by the photo picker and the callouts editor, so a
  // freshly-picked photo can be annotated before the fitting is saved (saved
  // fitting.media + media picked this session).
  const [picked, setPicked] = useState<common_MediaFull[]>([]);
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const item of fitting?.media ?? []) if (item.id != null) m.set(item.id, item);
    for (const p of picked) if (p.id != null) m.set(p.id, p);
    return m;
  }, [fitting?.media, picked]);

  async function handleSubmit(data: FittingFormData) {
    const fittingInsert = mapFormToFittingInsert(data, fitting?.fitting);
    try {
      if (isEditMode) {
        await updateFitting.mutateAsync({ id: parseInt(id || '0', 10), fitting: fittingInsert });
        showMessage('fitting updated', 'success');
        form.reset(data);
      } else {
        await createFitting.mutateAsync(fittingInsert);
        showMessage('fitting created', 'success');
        navigate(returnTo || ROUTES.fittings);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to submit fitting';
      showMessage(msg, 'error');
      console.error('Failed to submit fitting', error);
    }
  }

  return (
    <Form {...form}>
      <form
        className='flex flex-col gap-6 px-2 pt-2 pb-24 lg:px-6'
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor pb-3'>
          <div className='flex flex-wrap items-center gap-3'>
            {/* Back respects ?returnTo= so bailing from the sample-panel loop lands back in
                the sample, not on the flat fittings list. */}
            <Button asChild variant='secondary' size='lg'>
              <Link to={returnTo || ROUTES.fittings}>← back</Link>
            </Button>
            <Text variant='uppercase' size='large'>
              {isEditMode ? 'edit fitting' : 'new fitting'}
            </Text>
          </div>
        </div>

        <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
          <Section title='session' className='w-full lg:w-1/2'>
            <div className='space-y-1'>
              <Text variant='uppercase' size='small'>
                product (optional)
              </Text>
              <ProductField />
            </div>
            <div className='space-y-1'>
              <Text variant='uppercase' size='small'>
                tech card (style)
              </Text>
              <TechCardField />
            </div>
            <Text variant='inactive' size='small'>
              укажите продукт или тех карту (для пыльников, кофров и т.п. — по тех карте, без
              продукта)
            </Text>
            {!!selectedTechCardId && (
              <div className='space-y-1'>
                <Text variant='uppercase' size='small'>
                  sample (optional)
                </Text>
                <SamplePicker
                  techCardId={selectedTechCardId}
                  value={selectedSampleId ?? 0}
                  onChange={(sampleId) =>
                    form.setValue('sampleId', sampleId, { shouldDirty: true })
                  }
                />
                <Text variant='inactive' size='small'>
                  какой именно сэмпл примеряли (для истории примерок сэмпла)
                </Text>
              </div>
            )}
            <SelectField
              name='modelId'
              label='model (optional)'
              items={modelOptions}
              valueAsNumber
            />
            {!!selectedModelId && (
              <ModelMeasurementsView measurements={selectedModel?.model?.measurements} />
            )}
            <InputField name='fittingDate' type='date' label='fitting date' />
            <SelectField name='status' label='status' items={fittingStatusOptions} />
            <SelectField name='verdict' label='verdict' items={fittingVerdictOptions} />
            <div className='grid grid-cols-2 gap-3'>
              <InputField
                name='roundNumber'
                type='number'
                label='round # (0 = auto)'
                valueAsNumber
              />
              <SelectField name='outcome' label='outcome' items={fittingOutcomeOptions} />
            </div>
            <InputField name='recordedBy' label='recorded by (optional)' placeholder='name' />
            <TextareaField name='comment' label='comment (optional)' rows={4} maxLength={2000} />
          </Section>

          <div className='flex w-full flex-col gap-6 lg:w-1/2'>
            <Section title='sizes'>
              <SizesFields modelGender={selectedModel?.model?.gender} />
            </Section>
            <Section title='выкройка (что мерили)'>
              <PatternsFields />
            </Section>
            <Section title='photos'>
              <FittingMedia
                mediaById={mediaById}
                onPicked={(items) => setPicked((prev) => [...prev, ...items])}
              />
            </Section>
            <Section title='callouts (замечания по посадке)'>
              <FittingCallouts mediaById={mediaById} />
            </Section>
            <Section title='change requests (что доработать)'>
              <ChangeRequestsFields />
            </Section>
          </div>
        </div>
      </form>

      <div className='fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-textInactiveColor bg-bgColor px-3 py-2'>
        <Text variant='inactive' size='small'>
          {form.formState.isDirty ? 'unsaved changes' : ' '}
        </Text>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase cursor-pointer'
            onClick={() => navigate(returnTo || ROUTES.fittings)}
          >
            cancel
          </Button>
          {canWrite(SECTION.fittings) && (
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
          )}
        </div>
      </div>
    </Form>
  );
}
