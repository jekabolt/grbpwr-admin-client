import { zodResolver } from '@hookform/resolvers/zod';
import { common_Fitting, common_MediaFull } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  fittingSaveErrorMessage,
  useCreateFitting,
  useUpdateFitting,
} from 'components/managers/fittings/components/useFittingQuery';
import { ModelMeasurementsView } from 'components/managers/model/components/measurements-view';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { SamplePicker } from 'components/managers/tech-card/components/sample-picker';
import { useSamples } from 'components/managers/tech-card/components/useSamples';
import { fittingStatusOptions } from 'constants/filter';
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
import { useDisclosure } from './disclosure';
import { FittingCallouts } from './fitting-callouts';
import { FittingMedia } from './fitting-media';
import { PatternsFields } from './patterns-fields';
import { RecordedByField } from './recorded-by-field';
import {
  FittingFormData,
  fittingDefaultData,
  fittingSchema,
  mapFittingToForm,
  mapFormToFittingInsert,
  todayDateInput,
} from './schema';
import { SampleSizeInfo } from './sizes-fields';
import { TechCardField } from './tech-card-field';

// Structured round outcome (raw strings per the FittingInsert contract; distinct from verdict).
// The wire uses '' for undecided, but a Radix <Select.Item> may not carry an empty-string value —
// the form/UI use the 'undecided' sentinel and the schema maps it back to '' on save.
const fittingOutcomeOptions = [
  { value: 'undecided', label: 'undecided' },
  { value: 'approved', label: 'approved' },
  { value: 'new_round', label: 'new round' },
  { value: 'dropped', label: 'dropped' },
];

function Section({
  title,
  className,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
  // Advanced/secondary sections can start collapsed to keep the long form scannable (task 6).
  // defaultOpen is re-derived live by the caller (e.g. "open while there's data in it") but a
  // manual toggle always wins once the user has touched it — see useDisclosure.
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, toggle] = useDisclosure(defaultOpen);
  const isOpen = !collapsible || open;
  return (
    <section className={`space-y-4 border border-textInactiveColor p-4 ${className ?? ''}`}>
      {collapsible ? (
        <button
          type='button'
          onClick={toggle}
          aria-expanded={isOpen}
          className='flex w-full cursor-pointer items-center justify-between gap-2 text-left'
        >
          <Text variant='uppercase' size='large'>
            {title}
          </Text>
          <Text variant='inactive' size='small' className='uppercase'>
            {isOpen ? '− hide' : '+ show'}
          </Text>
        </button>
      ) : (
        <Text variant='uppercase' size='large'>
          {title}
        </Text>
      )}
      {isOpen && children}
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

  // The sample actually tried on already carries its own size and development round — surface
  // both read-only (tasks 2/3) instead of asking the fitter to re-enter them. Same list query
  // SamplePicker itself uses for this tech card, so React Query dedupes it into one request.
  const { data: samplesData } = useSamples(selectedTechCardId);
  const selectedSample = (samplesData?.samples ?? []).find((s) => s.id === selectedSampleId);
  const sampleSizeId = selectedSample?.sample?.sizeId || 0;
  const sampleRoundNumber = selectedSample?.sample?.roundNumber || 0;

  // Keep roundNumber mirroring the sample's round live, not just at submit — ChangeRequestsFields
  // → FittingCarryOver watches this field to filter carry-over items to "before this round", so
  // it has to already be right while the form is still open, not only in the saved payload.
  useEffect(() => {
    if (form.getValues('roundNumber') !== sampleRoundNumber) {
      form.setValue('roundNumber', sampleRoundNumber);
    }
  }, [sampleRoundNumber, form]);

  // Resolved-media map shared by the photo carousel and the callouts editor, so a
  // freshly-picked photo can be annotated before the fitting is saved (saved
  // fitting.media + media picked this session).
  const [picked, setPicked] = useState<common_MediaFull[]>([]);
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const item of fitting?.media ?? []) if (item.id != null) m.set(item.id, item);
    for (const p of picked) if (p.id != null) m.set(p.id, p);
    return m;
  }, [fitting?.media, picked]);

  const patternsCount = (form.watch('patterns') ?? []).length;

  async function handleSubmit(data: FittingFormData) {
    const fittingInsert = mapFormToFittingInsert(data, fitting?.fitting, sampleSizeId);
    try {
      if (isEditMode) {
        await updateFitting.mutateAsync({
          id: parseInt(id || '0', 10),
          fitting: fittingInsert,
          // S25: echo the lock_version the form loaded — a stale value is rejected (409).
          expectedLockVersion: fitting?.lockVersion ?? 0,
        });
        showMessage('fitting updated', 'success');
        form.reset(data);
      } else {
        await createFitting.mutateAsync(fittingInsert);
        showMessage('fitting created', 'success');
        navigate(returnTo || ROUTES.fittings);
      }
    } catch (error) {
      showMessage(fittingSaveErrorMessage(error), 'error');
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

        {/* Change requests are the actionable output of a fitting (what to fix, carried into the next
            round and the tech card) — surfaced full-width at the top, not buried below the fold. */}
        <Section title='change requests (что доработать) — главный итог примерки'>
          <ChangeRequestsFields
            fittingId={isEditMode ? parseInt(id || '0', 10) : 0}
            techCardId={selectedTechCardId || undefined}
            serverChangeRequests={fitting?.fitting?.changeRequests}
          />
        </Section>

        {/* Visual evidence for the change requests above: a photo carousel with fit-note pins
            shown in place on the photo (hover/focus a pin for its note), task 5. */}
        <Section title='photos & fit notes (замечания по посадке)'>
          <FittingMedia
            mediaById={mediaById}
            onPicked={(items) => setPicked((prev) => [...prev, ...items])}
          />
          <FittingCallouts mediaById={mediaById} />
        </Section>

        <Section title='session'>
          <div className='grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2'>
            <div className='space-y-1 sm:col-span-2'>
              <Text variant='uppercase' size='small'>
                tech card (style) *
              </Text>
              <TechCardField />
              <Text variant='inactive' size='small'>
                примерка делается по тех карте и её сэмплу (а не по продукту)
              </Text>
            </div>

            {!!selectedTechCardId && (
              <div className='space-y-1 sm:col-span-2'>
                <Text variant='uppercase' size='small'>
                  sample (tried on) *
                </Text>
                <SamplePicker
                  techCardId={selectedTechCardId}
                  value={selectedSampleId ?? 0}
                  onChange={(sampleId) =>
                    form.setValue('sampleId', sampleId, { shouldDirty: true })
                  }
                />
                <Text variant='inactive' size='small'>
                  примерка делается на конкретном сэмпле — обязательно
                </Text>
                <SampleSizeInfo sampleId={selectedSampleId ?? 0} sampleSizeId={sampleSizeId} />
              </div>
            )}

            <div className='space-y-3 sm:col-span-2'>
              <SelectField
                name='modelId'
                label='model (optional)'
                items={modelOptions}
                valueAsNumber
              />
              {!!selectedModelId && (
                <ModelMeasurementsView measurements={selectedModel?.model?.measurements} />
              )}
            </div>

            <InputField name='fittingDate' type='date' label='fitting date' />
            <SelectField name='status' label='status' items={fittingStatusOptions} />

            {/* Round is no longer typed in — it always mirrors the linked sample's development
                round (task 3), so there is nothing to disagree with the carry-over filter. */}
            <div className='space-y-1'>
              <Text variant='uppercase' size='small'>
                round
              </Text>
              <div className='border-b border-textInactiveColor py-1.5'>
                <Text>
                  {selectedSampleId
                    ? `round ${sampleRoundNumber || '—'} · from sample #${
                        selectedSample?.number ?? selectedSampleId
                      }`
                    : 'round — · pick a sample first'}
                </Text>
              </div>
            </div>
            <SelectField name='outcome' label='outcome' items={fittingOutcomeOptions} />

            <div className='sm:col-span-2'>
              <RecordedByField isEditMode={isEditMode} />
            </div>

            <div className='sm:col-span-2'>
              <TextareaField name='comment' label='comment (optional)' rows={4} maxLength={2000} />
            </div>
          </div>
        </Section>

        {/* Secondary/advanced: attaching the exact PDF выкройка measured is common but not part
            of the primary decision flow, so it starts collapsed once there's nothing in it yet. */}
        <Section title='выкройка (что мерили)' collapsible defaultOpen={patternsCount > 0}>
          <PatternsFields sampleSizeId={sampleSizeId} />
        </Section>
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
