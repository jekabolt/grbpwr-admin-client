import { zodResolver } from '@hookform/resolvers/zod';
import * as DialogPrimitives from '@radix-ui/react-dialog';
import { common_Colorway, common_EmailCampaignInsert, common_EmailCampaignStatus } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  EDITABLE_STATUSES,
  EMAIL_BG_COLOR_OPTIONS,
  EMAIL_TOPIC_OPTIONS,
  STATUS_LABELS,
} from 'constants/email-campaign';
import { ROUTES, SECTION } from 'constants/routes';
import { useBlockNavigation } from 'hooks/useBlockNavigation';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { v4 as uuidv4 } from 'uuid';
import { useProductSelection } from '../../hero/components/useProductSelection';
import { ABPanel } from './ab-panel';
import { BlockEditorModal } from './block-editor-modal';
import { BlockRail } from './block-rail';
import { CampaignMetrics } from './campaign-metrics';
import { CampaignPreviewPanel } from './campaign-preview-panel';
import { DispatchPanel } from './dispatch-panel';
import { mapCampaignFullToForm, mapFormToCampaignInsert } from './map-schema-to-campaign';
import { campaignSchema, CampaignSchema, defaultCampaign } from './schema';
import { SegmentPanel } from './segment-builder';
import { SelectEmailType } from './selectEmailType';
import { TestSendModal } from './test-send-modal';
import { useAutoTranslateCampaign, useCampaign, useSaveCampaign } from './useCampaign';

/**
 * Email-campaign builder (route :id). Fork of hero/components/index.tsx MINUS the
 * H9 snapshot/revert + H4 carry-forward; the singleton publish-overwrite is
 * replaced by per-campaign UpsertEmailCampaign (id from route, id=0 for new).
 * Editing is gated read-only unless the status is DRAFT (see EDITABLE_STATUSES —
 * the upsert RPC and the store both refuse anything but a draft).
 */
export function CampaignBuilder() {
  const { id: idParam } = useParams<{ id: string }>();
  const routeId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : 0;
  const navigate = useNavigate();
  const { canWrite } = usePermissions();
  const { showMessage } = useSnackBarStore();

  const { data: campaignData, isLoading, isError, refetch } = useCampaign(routeId);
  const saveCampaign = useSaveCampaign();
  const autoTranslate = useAutoTranslateCampaign();

  const entityRefs = useRef<{ [uid: string]: HTMLDivElement | null }>({});
  const productsByBlockUidRef = useRef<Record<string, common_Colorway[]>>({});
  const deletedIndicesRef = useRef<Set<string>>(new Set());
  const [deletedVersion, setDeletedVersion] = useState(0);
  const [hasUserMadeChanges, setHasUserMadeChanges] = useState(false);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [pendingNewUid, setPendingNewUid] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const isResettingRef = useRef(false);
  // Which campaign id the form has already been hydrated from — the first load must
  // always win, later refetches must not clobber unsaved edits (see the load effect).
  const loadedForRef = useRef<number | null>(null);

  const currentStatus: common_EmailCampaignStatus =
    campaignData?.status || 'EMAIL_CAMPAIGN_STATUS_DRAFT';
  const readOnly = routeId > 0 && !EDITABLE_STATUSES.includes(currentStatus as any);
  const canEdit = canWrite(SECTION.marketing) && !readOnly;

  const zResolver = useMemo(() => zodResolver(campaignSchema) as any, []);
  const form = useForm<CampaignSchema>({
    // Soft-deleted blocks are excluded from validation (they never reach the upsert),
    // but zod then keys body errors by FILTERED position while the rail badge and the
    // editor's `body.${index}` field paths use the UNFILTERED field-array position —
    // so map the indices back before handing the errors to RHF, otherwise a deleted
    // row above an incomplete block steals its "!" badge and its inline messages.
    resolver: async (values, ctx, opts) => {
      const all = (values.body || []) as any[];
      const livePositions: number[] = [];
      const body = all.filter((b: any, i: number) => {
        if (deletedIndicesRef.current.has(b?._uid)) return false;
        livePositions.push(i);
        return true;
      });
      const result = await zResolver({ ...values, body } as CampaignSchema, ctx, opts);
      const bodyErrors = result?.errors?.body;
      if (!bodyErrors || livePositions.every((pos, filteredIdx) => pos === filteredIdx)) {
        return result;
      }
      // Keep the array-ish container zodResolver builds; non-numeric keys (root /
      // message / type carried on the array itself) ride through untouched.
      const remapped: any = [];
      Object.keys(bodyErrors).forEach((key) => {
        const filteredIdx = Number(key);
        if (Number.isInteger(filteredIdx) && livePositions[filteredIdx] !== undefined) {
          remapped[livePositions[filteredIdx]] = bodyErrors[key];
        } else {
          remapped[key] = bodyErrors[key];
        }
      });
      return { ...result, errors: { ...result.errors, body: remapped } };
    },
    defaultValues: defaultCampaign,
    mode: 'onTouched',
  });

  useBlockNavigation(hasUserMadeChanges);

  // Load an existing campaign into the form. Every background refetch (save
  // invalidation, auto-translate, window remount) re-runs this, so a reset would
  // silently overwrite whatever the operator has typed since — after the FIRST load
  // for this id we only reset while the form is clean. Dirty edits win; they stay
  // flagged as "unsaved changes" until the operator saves them.
  useEffect(() => {
    if (routeId > 0 && campaignData) {
      const firstLoad = loadedForRef.current !== routeId;
      if (!firstLoad && form.formState.isDirty) return;
      loadedForRef.current = routeId;
      isResettingRef.current = true;
      const { productIdsByBlockUid, productsByBlockUid, ...formValues } =
        mapCampaignFullToForm(campaignData);
      void productIdsByBlockUid;
      productsByBlockUidRef.current = productsByBlockUid;
      form.reset(formValues);
      deletedIndicesRef.current.clear();
      setHasUserMadeChanges(false);
      setTimeout(() => {
        isResettingRef.current = false;
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignData, routeId]);

  useEffect(() => {
    const sub = form.watch(() => {
      if (!isResettingRef.current && form.formState.isDirty) setHasUserMadeChanges(true);
    });
    return () => sub.unsubscribe();
  }, [form]);

  const { append, remove, move, insert } = useFieldArray({ control: form.control, name: 'body' });
  const featuredProducts = useProductSelection(productsByBlockUidRef.current);

  const handleDeletedIndicesChange = useCallback(() => setDeletedVersion((v) => v + 1), []);

  const handleDuplicate = useCallback(
    (uid: string) => {
      const list = form.getValues().body || [];
      const idx = list.findIndex((b: any) => b._uid === uid);
      if (idx < 0) return;
      const clone = JSON.parse(JSON.stringify(list[idx]));
      clone._uid = uuidv4();
      insert(idx + 1, clone);
      const prods = featuredProducts.products[uid];
      if (prods?.length) featuredProducts.saveSelection([...prods], clone._uid);
      setEditingUid(clone._uid);
    },
    [form, insert, featuredProducts],
  );

  const buildInsert = useCallback((): common_EmailCampaignInsert => {
    const values = form.getValues();
    const liveBody = (values.body || []).filter(
      (b: any) => !deletedIndicesRef.current.has(b._uid),
    );
    // status is server-owned (the upsert accepts drafts only), so the mapper always
    // declares DRAFT — never echo currentStatus back or every save of a
    // paused/scheduled campaign is rejected with "campaign status is server-owned".
    return mapFormToCampaignInsert({ ...values, body: liveBody });
  }, [form]);

  const handleSave = useCallback(async () => {
    // Surface incomplete-block flags in the rail, but drafts may be saved partial.
    await form.trigger();
    const insert = buildInsert();
    try {
      const res = await saveCampaign.mutateAsync({ id: routeId, campaign: insert });
      isResettingRef.current = true;
      const values = form.getValues();
      form.reset({
        ...values,
        body: (values.body || []).filter((b: any) => !deletedIndicesRef.current.has(b._uid)),
      });
      deletedIndicesRef.current.clear();
      setHasUserMadeChanges(false);
      setTimeout(() => {
        isResettingRef.current = false;
      }, 0);
      showMessage('campaign saved', 'success');
      if (routeId === 0 && res?.id) navigate(`${ROUTES.emailCampaigns}/${res.id}`);
    } catch {
      // error toast surfaced by useSaveCampaign.onError
    }
  }, [form, buildInsert, saveCampaign, routeId, navigate, showMessage]);

  // Auto-translate runs server-side over the LAST SAVED copy and then refetches the
  // campaign, so firing it with unsaved edits would translate stale copy and pull a
  // server payload over the editor. Refuse and ask for a save instead of silently
  // discarding work (the load effect also refuses to reset a dirty form).
  const handleAutoTranslate = useCallback(() => {
    if (!routeId || readOnly) return;
    if (hasUserMadeChanges || form.formState.isDirty) {
      showMessage('save your changes first — auto-translate runs on the saved campaign', 'error');
      return;
    }
    autoTranslate.mutate({ id: routeId });
  }, [routeId, readOnly, hasUserMadeChanges, form, autoTranslate, showMessage]);

  // Cmd/Ctrl+S saves (when editable and no sub-modal is open).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (!canEdit || saveCampaign.isPending || isLoading) return;
      if (editingUid || addMenuOpen || testOpen) return;
      handleSave();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canEdit, saveCampaign.isPending, isLoading, editingUid, addMenuOpen, testOpen, handleSave]);

  if (routeId > 0 && isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='animate-pulse'>
          loading campaign…
        </Text>
      </div>
    );
  }

  if (routeId > 0 && isError) {
    return (
      <div className='flex flex-col items-center gap-3 py-20'>
        <Text variant='error'>couldn&apos;t load this campaign.</Text>
        <Button type='button' variant='secondary' size='lg' onClick={() => refetch()}>
          retry
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()} className='flex flex-col'>
        <div className='sticky top-0 z-10 -mx-2.5 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
          <div className='flex items-baseline gap-2'>
            <Button
              type='button'
              variant='secondary'
              className='px-2 py-1'
              onClick={() => navigate(ROUTES.emailCampaigns)}
            >
              ← campaigns
            </Button>
            <Text variant='uppercase' size='large'>
              {routeId > 0 ? 'edit campaign' : 'new campaign'}
            </Text>
            <span className='border border-textInactiveColor px-1.5 py-0.5 leading-none'>
              <Text size='small' variant='uppercase'>
                {STATUS_LABELS[currentStatus as keyof typeof STATUS_LABELS] ?? currentStatus}
              </Text>
            </span>
            {hasUserMadeChanges && (
              <span className='border border-warning px-1.5 py-0.5 leading-none'>
                <Text size='small' variant='uppercase' className='text-warning'>
                  unsaved changes
                </Text>
              </span>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={handleAutoTranslate}
              disabled={
                !canWrite(SECTION.marketing) ||
                !routeId ||
                readOnly ||
                autoTranslate.isPending ||
                saveCampaign.isPending
              }
              loading={autoTranslate.isPending}
              title={
                readOnly
                  ? 'auto-translate can only run on a draft.'
                  : 'Fill the other languages from English via AI — translates the SAVED copy, so save first. Review before sending.'
              }
            >
              auto-translate
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={() => setTestOpen(true)}
              disabled={!canWrite(SECTION.marketing)}
            >
              test send
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              className='uppercase'
              onClick={handleSave}
              disabled={!canEdit || saveCampaign.isPending}
              loading={saveCampaign.isPending}
            >
              save
            </Button>
          </div>
        </div>

        {readOnly && (
          <div className='mb-4 border border-warning p-2'>
            <Text size='small' variant='uppercase' className='text-warning'>
              read-only — this campaign is {STATUS_LABELS[currentStatus as keyof typeof STATUS_LABELS]}. only
              DRAFT campaigns can be edited; the content of a scheduled or sent campaign is frozen.
            </Text>
          </div>
        )}

        {/* ── dispatch lifecycle + status (saved campaigns only) ───────────── */}
        {routeId > 0 && (
          <div className='mb-6'>
            <DispatchPanel campaign={campaignData} canOperate={canWrite(SECTION.marketing)} />
          </div>
        )}

        <SectionStack row>
          <div className='max-h-[50vh] shrink-0 overflow-y-auto lg:max-h-none lg:overflow-visible lg:sticky lg:top-20 lg:w-[260px]'>
            <BlockRail
              entityRefs={entityRefs}
              arrayHelpers={{ move }}
              deletedIndicesRef={deletedIndicesRef}
              onDeletedIndicesChange={handleDeletedIndicesChange}
              onSelectBlock={(uid) => setEditingUid(uid)}
              selectedUid={editingUid}
              onAddClick={() => (canEdit ? setAddMenuOpen(true) : undefined)}
            />
          </div>

          <SectionStack className='min-w-0 flex-1'>
            {/* ── envelope ─────────────────────────────────────────────── */}
            <Section title='campaign details'>
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                <InputField name='name' label='name' placeholder='internal campaign name' />
                <SelectField name='topic' label='topic' items={EMAIL_TOPIC_OPTIONS} />
                <InputField name='fromName' label='from name' placeholder='GRBPWR' />
                <InputField
                  name='fromEmail'
                  label='from email'
                  type='email'
                  placeholder='hello@grbpwr.com'
                />
                <InputField
                  name='replyTo'
                  label='reply-to (optional)'
                  type='email'
                  placeholder='replies@grbpwr.com'
                />
                <SelectField
                  name='backgroundColor'
                  label='background color'
                  items={EMAIL_BG_COLOR_OPTIONS}
                  placeholder='default'
                />
              </div>
              <UnifiedTranslationFields
                fieldPrefix='subjectI18n'
                fields={[{ name: 'subject', label: 'subject line' }]}
                editMode={canEdit}
              />
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                <SegmentPanel name='segmentId' />
                {/* Scheduling is NOT a saved field: UpsertEmailCampaign resets
                    schedule_at to NULL and only the ScheduleCampaign RPC (dispatch
                    panel) can set it, so the envelope points at the real control
                    instead of offering an input whose value is thrown away. */}
                <div className='flex flex-col gap-1'>
                  <Text variant='label' size='small'>
                    schedule
                  </Text>
                  <Text variant='inactive' size='small'>
                    {routeId > 0
                      ? 'scheduling is a dispatch action — set the send time in the dispatch panel above.'
                      : 'save the campaign first, then schedule it from the dispatch panel.'}
                  </Text>
                </div>
              </div>
            </Section>

            <ABPanel campaign={campaignData} />
            {routeId > 0 && (
              <CampaignMetrics
                campaignId={routeId}
                status={currentStatus}
                winnerVariantId={campaignData?.abConfig?.winnerVariantId}
              />
            )}

            {/* ── live preview ─────────────────────────────────────────── */}
            <CampaignPreviewPanel
              control={form.control}
              campaignId={routeId || undefined}
              deletedUids={deletedIndicesRef.current}
              deletedVersion={deletedVersion}
            />
          </SectionStack>
        </SectionStack>

        <BlockEditorModal
          editingUid={editingUid}
          featuredProducts={featuredProducts}
          onOpenChange={(o) => {
            if (o) return;
            if (editingUid && editingUid === pendingNewUid) {
              const idx = (form.getValues().body || []).findIndex(
                (b: any) => b._uid === pendingNewUid,
              );
              if (idx >= 0) remove(idx);
              setPendingNewUid(null);
            }
            setEditingUid(null);
          }}
          isNew={!!pendingNewUid && editingUid === pendingNewUid}
          onConfirm={() => {
            setPendingNewUid(null);
            setEditingUid(null);
          }}
          onDuplicate={handleDuplicate}
        />

        <DialogPrimitives.Root open={addMenuOpen} onOpenChange={setAddMenuOpen}>
          <DialogPrimitives.Portal>
            <DialogPrimitives.Overlay className='fixed inset-0 z-50 h-screen bg-overlay' />
            <DialogPrimitives.Content className='fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col overflow-y-auto border border-textInactiveColor bg-bgColor px-2.5 pb-4 pt-5 text-textColor lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:h-[88vh] lg:w-[92vw] lg:max-w-[900px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:p-4'>
              <DialogPrimitives.Title className='mb-3 shrink-0'>
                <Text variant='uppercase' size='large'>
                  add a block
                </Text>
              </DialogPrimitives.Title>
              <DialogPrimitives.Description className='sr-only'>
                pick an email block type to append to the campaign body
              </DialogPrimitives.Description>
              <SelectEmailType
                append={append}
                entityRefs={entityRefs}
                onAdded={(uid) => {
                  setAddMenuOpen(false);
                  setEditingUid(uid);
                  setPendingNewUid(uid);
                }}
              />
            </DialogPrimitives.Content>
          </DialogPrimitives.Portal>
        </DialogPrimitives.Root>

        <TestSendModal
          open={testOpen}
          onOpenChange={setTestOpen}
          buildDraft={buildInsert}
          campaignId={routeId || undefined}
        />
      </form>
    </Form>
  );
}

export default CampaignBuilder;
