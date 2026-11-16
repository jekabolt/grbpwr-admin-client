import { cn } from 'lib/utility';
import { useDockBottom } from 'hooks/useDockBottom';
import { useTypingOnPhone } from './use-typing-on-phone';
import { type ComponentProps, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import {
  type AddModelResponse,
  common_BodyMeasurementName,
  type common_GenderEnum,
  common_Model,
  common_ModelInsert,
} from 'api/proto-http/admin';
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
import { useForm, useFormContext, useWatch } from 'react-hook-form';
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
import {
  type MeasurementEntryModeV1,
  MeasurementsFields,
  MeasurementsHeaderActions,
  MeasurementsQuiz,
  preferredMeasurementEntryModeV1,
} from './measurements-fields';
import {
  retryCreatedModelMannequinPoseV1,
  saveCreatedModelMannequinPoseV1,
  submitModelCreateWithPoseHandoffV1,
  type ModelCreatePoseHandoffPendingV1,
} from './model-create-pose-handoff-v1';
import { ModelMedia } from './model-media';
import {
  createModelMannequinPoseDraftOwnerV1,
  type ModelMannequinPoseDraftOwnerV1,
  type ModelMannequinPoseDraftSnapshotV1,
} from './model-mannequin-pose-draft-owner-v1';
import {
  createModelMannequinPoseSessionBindingV1,
  modelMannequinPosePersistenceViewV1,
} from './model-mannequin-pose-session-v1';
import { modelMannequinPoseRpcEnabledV1 } from './model-mannequin-pose-transport-v1';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from './model-open-reference-direct-pose-v9';
import { resolveModelGuidedMeasurementPreviewInputV1 } from './model-guided-measurement-preview-input-v1';
import {
  ModelOpenReferencePreview,
  ModelOpenReferencePreviewFromInput,
} from './model-open-reference-preview';
import {
  mapFormToModelInsert,
  mapModelToForm,
  ModelFormData,
  modelDefaultData,
  modelFormRevisionKeyV1,
  modelSchema,
} from './schema';
import {
  SheetMeasurementFocusProvider,
  SheetMeasurementMobileStrip,
  useSheetMeasurementFocus,
} from './sheet-measurement-focus';
import { MeasurementUnitProvider } from './units';
import type { ModelMannequinPoseTransportControllerV1 } from './use-model-mannequin-pose-transport-v1';
import './sheet-model-form.css';

type ModelFormProps = {
  isEditMode: boolean;
  id?: string;
  model?: common_Model;
  poseOwner?: ModelMannequinPoseDraftOwnerV1;
  poseTransport?: ModelMannequinPoseTransportControllerV1;
};

function ActiveMeasurementBodyPreview({
  compact = false,
  ...props
}: Omit<
  ComponentProps<typeof ModelOpenReferencePreview>,
  | 'activeMeasurementName'
  | 'variant'
  | 'directPoseViewportEditingEnabledV9'
  | 'hideDirectPoseControlV9'
> & { compact?: boolean }) {
  const { active } = useSheetMeasurementFocus();
  const { control } = useFormContext<ModelFormData>();
  const gender = useWatch({ control, name: 'gender' }) as common_GenderEnum | '' | undefined;
  const measurements =
    (useWatch({ control, name: 'measurements' }) as ModelFormData['measurements']) ?? {};
  const guidedPreview = useMemo(
    () =>
      resolveModelGuidedMeasurementPreviewInputV1({
        gender: gender || undefined,
        measurements,
      }),
    [gender, measurements],
  );
  const sharedProps = {
    ...props,
    activeMeasurementName: (active as common_BodyMeasurementName) || undefined,
    variant: compact ? ('workbench' as const) : ('form' as const),
    directPoseViewportEditingEnabledV9: !compact,
    hideDirectPoseControlV9: compact,
  };

  return compact ? (
    <ModelOpenReferencePreviewFromInput {...sharedProps} input={guidedPreview.input} />
  ) : (
    <ModelOpenReferencePreview {...sharedProps} />
  );
}

export type ModelFormDevDependenciesV1 = {
  readonly canWriteModels: boolean;
  readonly createModel: (model: common_ModelInsert) => Promise<AddModelResponse>;
  readonly updateModel: (input: { id: number; model: common_ModelInsert }) => Promise<unknown>;
  readonly durableCreatePoseEnabled: boolean;
  readonly saveCreatedModelPose: (
    owner: ModelMannequinPoseDraftOwnerV1,
    modelId: number,
  ) => Promise<void>;
  readonly leaveForm: () => void;
  readonly renderMedia: (input: {
    model?: common_Model;
    canEdit: boolean;
    onBusyChange: (busy: boolean) => void;
  }) => ReactNode;
  readonly renderDefaultSizes: () => ReactNode;
  readonly renderFittings: (modelId: number) => ReactNode;
};

type ModelFormRuntimeV1 = ModelFormDevDependenciesV1;

function useModelMannequinPoseSnapshotV1(owner?: ModelMannequinPoseDraftOwnerV1) {
  const [state, setState] = useState<{
    readonly owner: ModelMannequinPoseDraftOwnerV1 | undefined;
    readonly snapshot: ModelMannequinPoseDraftSnapshotV1 | null;
  }>(() => ({ owner, snapshot: owner ? owner.getSnapshot() : null }));
  const snapshot = state.owner === owner ? state.snapshot : owner?.getSnapshot() ?? null;

  useEffect(() => {
    if (!owner) return;
    setState({ owner, snapshot: owner.getSnapshot() });
    return owner.subscribe(() => setState({ owner, snapshot: owner.getSnapshot() }));
  }, [owner]);

  return snapshot;
}

/**
 * Production resolves its ordinary hooks and child integrations below. A DEV-only audit surface may
 * inject local no-op boundaries while still mounting this exact form, its real measurement inputs,
 * and the production mannequin preview. Production builds ignore the injected branch.
 */
export function ModelForm(
  props: ModelFormProps & { devDependencies?: ModelFormDevDependenciesV1 },
) {
  if (import.meta.env.DEV && props.devDependencies) {
    return <ModelFormRuntime {...props} runtime={props.devDependencies} />;
  }
  return <ProductionModelForm {...props} />;
}

function ProductionModelForm(props: ModelFormProps) {
  const navigate = useNavigate();
  const createModel = useCreateModel();
  const updateModel = useUpdateModel();
  const { canWrite } = usePermissions();
  const runtime: ModelFormRuntimeV1 = {
    canWriteModels: canWrite(SECTION.models),
    createModel: (model) => createModel.mutateAsync(model),
    updateModel: (input) => updateModel.mutateAsync(input),
    durableCreatePoseEnabled: modelMannequinPoseRpcEnabledV1(),
    saveCreatedModelPose: (owner, modelId) =>
      saveCreatedModelMannequinPoseV1({ service: adminService, owner, modelId }),
    leaveForm: () => navigate(ROUTES.models),
    renderMedia: ({ model, canEdit, onBusyChange }) => (
      <ModelMedia model={model} canEdit={canEdit} onBusyChange={onBusyChange} />
    ),
    renderDefaultSizes: () => <DefaultSizesField />,
    renderFittings: (modelId) => <FittingsReadonlyList modelId={modelId} />,
  };
  return <ModelFormRuntime {...props} runtime={runtime} />;
}

function ModelFormRuntime({
  isEditMode,
  id,
  model,
  poseOwner,
  poseTransport,
  runtime,
}: ModelFormProps & { runtime: ModelFormRuntimeV1 }) {
  const saveBarRef = useRef<HTMLDivElement>(null);
  // A white-bg press is out on the photo: saving now would store the photo it is about to replace.
  const [photoBusy, setPhotoBusy] = useState(false);
  useDockBottom(saveBarRef, []);
  const typingOnPhone = useTypingOnPhone();
  const [measurementEntryMode, setMeasurementEntryMode] = useState<MeasurementEntryModeV1>(() =>
    preferredMeasurementEntryModeV1(typeof window === 'undefined' ? undefined : window.innerWidth),
  );
  const saved = useDoneFlash();
  // A refused save stands in the save bar until the next attempt.
  const [formError, setFormError] = useState<string | null>(null);
  const [createPoseOwner] = useState(() => {
    if (isEditMode) return undefined;
    const owner = createModelMannequinPoseDraftOwnerV1({
      neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    });
    void owner.loadRemote({ kind: 'absent' });
    return owner;
  });
  const activePoseOwner = poseOwner ?? createPoseOwner;
  const [createPosePending, setCreatePosePending] =
    useState<ModelCreatePoseHandoffPendingV1 | null>(null);
  const [createPoseRetrying, setCreatePoseRetrying] = useState(false);
  const modelFieldsLocked = createPosePending !== null;
  const poseSnapshot = useModelMannequinPoseSnapshotV1(activePoseOwner);
  const directPoseBindingV9 = useMemo(() => {
    if (!activePoseOwner || !poseSnapshot || poseSnapshot.phase === 'unloaded') return undefined;
    if (!poseTransport?.enabled) {
      return createModelMannequinPoseSessionBindingV1(activePoseOwner, poseSnapshot);
    }
    const view = modelMannequinPosePersistenceViewV1({
      snapshot: poseSnapshot,
      canWrite: runtime.canWriteModels,
      mutationPending: poseTransport.savePending,
    });
    return createModelMannequinPoseSessionBindingV1(activePoseOwner, poseSnapshot, {
      ...view,
      onSave: () => void poseTransport.savePose().catch(() => undefined),
      onKeepMine: () => {
        activePoseOwner.rebaseDraftOnConflict();
        return activePoseOwner.getSnapshot().draft.pose;
      },
      onReloadTheirs: () => {
        activePoseOwner.discardDraftForConflict();
        return activePoseOwner.getSnapshot().draft.pose;
      },
    });
  }, [activePoseOwner, poseSnapshot, poseTransport, runtime.canWriteModels]);
  const form = useForm<ModelFormData>({
    resolver: zodResolver(modelSchema),
    defaultValues: model ? mapModelToForm(model) : modelDefaultData,
    mode: 'onSubmit',
  });

  async function handleSubmit(data: ModelFormData) {
    if (photoBusy) return;
    const modelInsert = mapFormToModelInsert(data);
    setFormError(null);
    try {
      if (isEditMode) {
        await runtime.updateModel({ id: parseInt(id || '0', 10), model: modelInsert });
        saved.flash();
        form.reset(data);
      } else {
        const createResult = await submitModelCreateWithPoseHandoffV1({
          model: modelInsert,
          pending: createPosePending,
          poseOwner: activePoseOwner!,
          poseRpcEnabled: runtime.durableCreatePoseEnabled,
          createModel: runtime.createModel,
          saveCreatedPose: runtime.saveCreatedModelPose,
        });
        if (createResult.kind !== 'complete') {
          setCreatePosePending(createResult);
          setFormError(createResult.message);
          return;
        }
        // Leaving for the list is the receipt.
        runtime.leaveForm();
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

  async function handleCreatePoseRetry() {
    if (createPosePending?.kind !== 'pose-retry' || !activePoseOwner || createPoseRetrying) {
      return;
    }
    setCreatePoseRetrying(true);
    setFormError(null);
    try {
      const retryResult = await retryCreatedModelMannequinPoseV1({
        pending: createPosePending,
        poseOwner: activePoseOwner,
        saveCreatedPose: runtime.saveCreatedModelPose,
      });
      if (retryResult.kind === 'complete') {
        runtime.leaveForm();
        return;
      }
      setCreatePosePending(retryResult);
      setFormError(retryResult.message);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'The mannequin pose could not be saved.',
      );
    } finally {
      setCreatePoseRetrying(false);
    }
  }

  const renderBodyPreview = (compact: boolean) => {
    if (activePoseOwner && poseTransport?.enabled && poseTransport.readError) {
      return (
        <CalloutBox tone='error'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <Text size='micro' component='p' role='alert'>
              <b>saved pose not loaded</b> ·{' '}
              {poseTransport.readError instanceof Error
                ? poseTransport.readError.message
                : 'The saved mannequin pose could not be read.'}
            </Text>
            <Button type='button' variant='underline' size='xs' onClick={poseTransport.retryRead}>
              retry pose
            </Button>
          </div>
        </CalloutBox>
      );
    }
    if (activePoseOwner && !directPoseBindingV9) {
      return (
        <Text size='micro' variant='inactive' role='status'>
          {poseTransport?.enabled ? 'loading saved pose…' : 'preparing session pose…'}
        </Text>
      );
    }
    return (
      <ActiveMeasurementBodyPreview
        compact={compact}
        modelId={model?.id == null ? 'model-form:create' : `model-form:model:${model.id}`}
        modelContentRevision={
          model == null ? 'model-form:create:unbound' : modelFormRevisionKeyV1(model)
        }
        poseControls='full-body-v9'
        directPoseBindingV9={directPoseBindingV9}
      />
    );
  };

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

            <fieldset
              disabled={modelFieldsLocked}
              className='contents'
              aria-label='Model measurement navigation'
            >
              <SheetMeasurementMobileStrip />
            </fieldset>

            <SectionStack>
              <fieldset
                disabled={modelFieldsLocked}
                className='contents'
                aria-label='Model fields'
                data-testid='model-create-fields'
              >
                <Section>
                  <div className='flex flex-col gap-4 md:flex-row md:items-stretch'>
                    <div className='mx-auto w-full max-w-60 shrink-0 md:mx-0'>
                      {runtime.renderMedia({
                        model,
                        canEdit: runtime.canWriteModels,
                        onBusyChange: setPhotoBusy,
                      })}
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
                      {runtime.renderDefaultSizes()}
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

                <Section
                  title='measurements'
                  action={
                    <MeasurementsHeaderActions
                      showAudit={isEditMode}
                      mode={measurementEntryMode}
                      onModeChange={setMeasurementEntryMode}
                    />
                  }
                >
                  {measurementEntryMode === 'table' ? (
                    <MeasurementsFields showAudit={isEditMode} />
                  ) : (
                    <MeasurementsQuiz
                      showAudit={isEditMode}
                      preview={renderBodyPreview(true)}
                      onComplete={() => setMeasurementEntryMode('table')}
                    />
                  )}
                </Section>
              </fieldset>

              {measurementEntryMode === 'table' ? (
                <Section title='body preview'>{renderBodyPreview(false)}</Section>
              ) : null}

              {isEditMode && id && (
                <Section title='fittings'>{runtime.renderFittings(parseInt(id, 10))}</Section>
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
                onClick={runtime.leaveForm}
              >
                cancel
              </Button>
              {runtime.canWriteModels && (
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  className='cursor-pointer uppercase'
                  disabled={
                    (isEditMode && !form.formState.isDirty) ||
                    createPosePending?.kind === 'created-id-missing' ||
                    form.formState.isSubmitting ||
                    createPoseRetrying ||
                    photoBusy
                  }
                  loading={form.formState.isSubmitting || createPoseRetrying}
                  done={saved.on}
                  onClick={() =>
                    createPosePending?.kind === 'pose-retry'
                      ? void handleCreatePoseRetry()
                      : form.handleSubmit(handleSubmit)()
                  }
                >
                  {isEditMode
                    ? 'save'
                    : createPosePending?.kind === 'pose-retry'
                      ? 'retry pose'
                      : createPosePending?.kind === 'created-id-missing'
                        ? 'model added'
                        : 'add model'}
                </Button>
              )}
            </div>
          </div>
        </SheetMeasurementFocusProvider>
      </MeasurementUnitProvider>
    </Form>
  );
}
