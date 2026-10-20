import { zodResolver } from '@hookform/resolvers/zod';
import { common_Fitting, common_MediaFull } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useCurrentAccount } from 'components/managers/accounts/utils/hooks';
import {
  fittingSaveErrorMessage,
  useCreateFitting,
} from 'components/managers/fittings/components/useFittingQuery';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { SamplePicker } from 'components/managers/tech-card/components/sample-picker';
import { useSamples } from 'components/managers/tech-card/components/useSamples';
import {
  useTechCard,
  useTechCardFittings,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES, SECTION } from 'constants/routes';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { notify } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, UseFormReturn, useWatch } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BackLink, Button, Form, Section, Text } from 'ui';
import { fittingOrdinal, fittingTitleParts } from 'components/managers/fittings/components/utils';
import { FittingTitle } from 'components/managers/fittings/components/fitting-title';
import { DetailsDrawer } from './details-drawer';
import { EditsList } from './edits-list';
import { FittingNote } from './fitting-note';
import { OutcomeDock } from './outcome-dock';
import { PhotoStage } from './photo-stage';
import {
  FittingFormData,
  fittingDefaultData,
  fittingSchema,
  mapFittingToForm,
  mapFormToFittingInsert,
  todayDateInput,
} from './schema';
import { TechCardField } from './tech-card-field';
import { useFittingAutosave } from './use-fitting-autosave';
import { DraftEdit, FittingWorkspace, FittingWorkspaceContext, PendingMark } from './workspace';

// Where to go back to — the sample panel passes ?returnTo=<its URL>. Only in-app paths: an
// absolute / protocol-relative value would make navigate() throw.
function useReturnTo(): string {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get('returnTo') || '';
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '';
}

// A sample belongs to its tech card: drop a stale sample link whenever the style changes, and keep
// roundNumber mirroring the linked sample's development round (the carry-over filter reads it).
// Returns the sample actually tried on and its size.
function useSampleLink(form: UseFormReturn<FittingFormData>) {
  const techCardId = useWatch({ control: form.control, name: 'techCardId' }) || 0;
  const sampleId = useWatch({ control: form.control, name: 'sampleId' }) || 0;

  const prevTechCardId = useRef(techCardId);
  useEffect(() => {
    const changed = prevTechCardId.current !== techCardId;
    prevTechCardId.current = techCardId;
    if (changed && form.getValues('sampleId')) {
      form.setValue('sampleId', 0, { shouldDirty: true });
    }
  }, [techCardId, form]);

  const { data: samplesData, isFetched: samplesFetched } = useSamples(techCardId || undefined);
  const sample = (samplesData?.samples ?? []).find((s) => s.id === sampleId);
  const sampleSizeId = sample?.sample?.sizeId || 0;
  const sampleRoundNumber = sample?.sample?.roundNumber || 0;

  useEffect(() => {
    if (!sample) return;
    if (form.getValues('roundNumber') !== sampleRoundNumber) {
      form.setValue('roundNumber', sampleRoundNumber);
    }
  }, [sample, sampleRoundNumber, form]);

  return { techCardId, sampleId, sample, sampleSizeId, sampleRoundNumber, samplesFetched };
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
  if (isEditMode && fitting) {
    return <FittingWorkspaceScreen fittingId={parseInt(id || '0', 10)} fitting={fitting} />;
  }
  return <FittingStart />;
}

// ─── Create: there is nothing to annotate without a fitting row, so the new-fitting screen only
// links the tech card and the sample, creates the row and opens the workspace on it. A deep link
// carrying both (?techCardId=&sampleId=) skips even that.
function FittingStart() {
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const [searchParams] = useSearchParams();
  const initialTechCardId = Number(searchParams.get('techCardId')) || 0;
  const initialSampleId = Number(searchParams.get('sampleId')) || 0;
  const createFitting = useCreateFitting();
  const { canWrite } = usePermissions();
  const { data: account, isFetched: accountFetched } = useCurrentAccount();

  const form = useForm<FittingFormData>({
    resolver: zodResolver(fittingSchema),
    defaultValues: {
      ...fittingDefaultData,
      fittingDate: todayDateInput(),
      techCardId: initialTechCardId,
      sampleId: initialSampleId,
    },
  });
  const { techCardId, sampleId, sample, sampleSizeId, sampleRoundNumber, samplesFetched } =
    useSampleLink(form);
  const allowed = canWrite(SECTION.fittings);

  const startedRef = useRef(false);
  async function start() {
    if (startedRef.current || !techCardId || !sampleId || !allowed) return;
    startedRef.current = true;
    const values = form.getValues();
    try {
      const res = await createFitting.mutateAsync(
        mapFormToFittingInsert(
          {
            ...values,
            fittingDate: todayDateInput(),
            status: 'FITTING_STATUS_PLANNED',
            modelId: 0,
            roundNumber: sampleRoundNumber,
            recordedBy: account?.account?.username || '',
          },
          undefined,
          sampleSizeId,
        ),
      );
      if (!res.id) throw new Error('no fitting id in the response');
      const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
      navigate(`${ROUTES.fittings}/${res.id}${query}`, { replace: true });
    } catch (error) {
      startedRef.current = false;
      console.error('Failed to create fitting', error);
      notify({
        sev: 'error',
        subject: 'FITTING',
        text: 'not added',
        detail: fittingSaveErrorMessage(error),
      });
    }
  }

  // Deep link with both links: create at once (once the sample's size/round and the current
  // account are known, so the row is born complete).
  const autoStart = !!initialTechCardId && !!initialSampleId;
  useEffect(() => {
    if (!autoStart || !samplesFetched || !accountFetched) return;
    if (techCardId !== initialTechCardId || sampleId !== initialSampleId || !sample) return;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, samplesFetched, accountFetched, sample]);

  const busy = createFitting.isPending;

  return (
    <Form {...form}>
      <div className='mx-auto flex w-full max-w-screen-2xl flex-col gap-gutter md:px-4 pt-6 pb-32'>
        <div className='flex flex-wrap items-baseline gap-3'>
          <BackLink to={returnTo || ROUTES.fittings} />
          <Text
            component='h1'
            variant='uppercase'
            tracking='section'
            className='font-bold md:text-lg'
          >
            New fitting
          </Text>
        </div>
        <Section className='max-w-xl'>
          <div className='grid gap-stack'>
            <div className='grid gap-1'>
              <Text size='micro' variant='label' className='uppercase tracking-label'>
                tech card
              </Text>
              <TechCardField />
            </div>
            <div className='grid gap-1'>
              <Text size='micro' variant='label' className='uppercase tracking-label'>
                sample
              </Text>
              <SamplePicker
                techCardId={techCardId || undefined}
                value={sampleId}
                onChange={(id) => form.setValue('sampleId', id, { shouldDirty: true })}
              />
            </div>
            <div>
              <Button
                type='button'
                variant='main'
                size='lg'
                disabled={!techCardId || !sampleId || !sample || !allowed || busy}
                loading={busy}
                onClick={() => void start()}
              >
                Start
              </Button>
            </div>
          </div>
        </Section>
      </div>
    </Form>
  );
}

// ─── Edit: the workspace (FITTING-WORKSPACE mockup v7).
function FittingWorkspaceScreen({
  fittingId,
  fitting,
}: {
  fittingId: number;
  fitting: common_Fitting;
}) {
  const returnTo = useReturnTo();
  const { canWrite } = usePermissions();
  const { dictionary } = useDictionary();
  const { data: models } = useAllModels();

  const form = useForm<FittingFormData>({
    resolver: zodResolver(fittingSchema),
    defaultValues: mapFittingToForm(fitting),
  });
  const { techCardId, sample, sampleSizeId, sampleRoundNumber } = useSampleLink(form);
  const { saveNow, saveState, saveError } = useFittingAutosave({
    form,
    fitting,
    fittingId,
    sampleSizeId,
  });

  // Resolved-media map shared by the stage and the edit list: the media library first, then the
  // fitting's own resolved media, then what was picked in this session (UpdateFitting answers
  // with an empty body, so a fresh pick is known only from here until GetFitting refetches).
  const [picked, setPicked] = useState<common_MediaFull[]>([]);
  const libraryMap = useMediaMap();
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const [mid, item] of libraryMap) m.set(mid, item);
    for (const item of fitting.media ?? []) if (item.id != null) m.set(item.id, item);
    for (const p of picked) if (p.id != null) m.set(p.id, p);
    return m;
  }, [fitting.media, picked, libraryMap]);

  const mediaIds = useWatch({ control: form.control, name: 'mediaIds' }) ?? [];
  const status = useWatch({ control: form.control, name: 'status' });

  const [chosenMediaId, setCurrentMediaId] = useState(0);
  const currentMediaId = mediaIds.includes(chosenMediaId) ? chosenMediaId : mediaIds[0] ?? 0;
  const [hotNumber, setHotNumber] = useState<number | null>(null);
  const [pendingMark, setPendingMark] = useState<PendingMark | null>(null);
  const [drafts, setDrafts] = useState<DraftEdit[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const done = status === 'FITTING_STATUS_DONE';
  const readOnly = !canWrite(SECTION.fittings);
  const changeRequests = fitting.fitting?.changeRequests;

  const workspace = useMemo<FittingWorkspace>(
    () => ({
      fittingId,
      techCardId,
      roundNumber: sampleRoundNumber,
      done,
      readOnly,
      mediaById,
      addPicked: (items) => setPicked((prev) => [...prev, ...items]),
      changeRequests: changeRequests ?? [],
      currentMediaId,
      setCurrentMediaId,
      hotNumber,
      setHotNumber,
      pendingMark,
      setPendingMark,
      drafts,
      setDrafts,
      saveNow,
      saveState,
    }),
    [
      fittingId,
      techCardId,
      sampleRoundNumber,
      done,
      readOnly,
      mediaById,
      changeRequests,
      currentMediaId,
      hotNumber,
      pendingMark,
      drafts,
      saveNow,
      saveState,
    ],
  );

  // Title = garment type, the garment, its size and which fitting of it this is.
  const { data: techCard } = useTechCard(techCardId || undefined);
  const { data: siblings } = useTechCardFittings(techCardId || undefined);
  const card = techCard?.techCard;
  const garment = card?.name || card?.styleNumber || '';
  const garmentType = card?.categoryId
    ? String(findInDictionary(dictionary, card.categoryId, 'category') || '')
    : '';
  const sizeName = sampleSizeId
    ? String(findInDictionary(dictionary, sampleSizeId, 'size') || sampleSizeId)
    : '';
  const title = fittingTitleParts({
    type: garmentType,
    garment,
    size: sizeName,
    ordinal: fittingOrdinal(siblings, fittingId),
  });

  return (
    <Form {...form}>
      <FittingWorkspaceContext.Provider value={workspace}>
        <div className='mx-auto flex w-full max-w-screen-2xl flex-col gap-gutter md:px-4 pt-6 pb-32'>
          <div className='flex flex-col gap-2'>
            <div className='flex flex-wrap items-baseline gap-x-3 gap-y-2 md:flex-nowrap'>
              <BackLink to={returnTo || ROUTES.fittings} className='shrink-0' />
              <Text
                component='h1'
                variant='uppercase'
                tracking='section'
                className='order-last min-w-0 basis-full font-bold md:order-none md:flex-1 md:basis-auto'
              >
                {garment ? <FittingTitle parts={title} /> : `fitting\u00a0${fittingId}`}
              </Text>
              <Button
                type='button'
                variant='underline'
                size='xs'
                className='ml-auto shrink-0 px-0 text-labelColor underline-offset-2 hover:text-textColor'
                aria-expanded={detailsOpen}
                onClick={() => setDetailsOpen(true)}
              >
                Details
              </Button>
            </div>
          </div>

          <div className='flex flex-col gap-gutter lg:flex-row lg:items-start'>
            <div className='min-w-0 lg:flex-[1.5]'>
              <PhotoStage />
            </div>
            <div className='flex min-w-0 flex-col gap-gutter lg:sticky lg:top-0 lg:flex-1'>
              <EditsList />
              <FittingNote />
            </div>
          </div>
        </div>

        <OutcomeDock saveError={saveError} />
        <DetailsDrawer
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          models={models ?? []}
          readOnly={readOnly}
        />
      </FittingWorkspaceContext.Provider>
    </Form>
  );
}
