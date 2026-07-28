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
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { v4 as uuidv4 } from 'uuid';
import { ReleaseDateField } from '../../hero/components/release-date-field';
import { useProductSelection } from '../../hero/components/useProductSelection';
import { ABPanel } from './ab-panel';
import { BlockEditorModal } from './block-editor-modal';
import { BlockRail } from './block-rail';
import { CampaignMetrics } from './campaign-metrics';
import { CampaignPreviewPanel } from './campaign-preview-panel';
import { mapCampaignFullToForm, mapFormToCampaignInsert } from './map-schema-to-campaign';
import { campaignSchema, CampaignSchema, defaultCampaign } from './schema';
import { SegmentPanel } from './segment-builder';
import { SelectEmailType } from './selectEmailType';
import { TestSendModal } from './test-send-modal';
import { useCampaign, useSaveCampaign } from './useCampaign';

/**
 * Email-campaign builder (route :id). Fork of hero/components/index.tsx MINUS the
 * H9 snapshot/revert + H4 carry-forward; the singleton publish-overwrite is
 * replaced by per-campaign UpsertEmailCampaign (id from route, id=0 for new).
 * Editing is gated read-only unless the status is DRAFT/PAUSED.
 */
export function CampaignBuilder() {
  const { id: idParam } = useParams<{ id: string }>();
  const routeId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : 0;
  const navigate = useNavigate();
  const { canWrite } = usePermissions();
  const { showMessage } = useSnackBarStore();

  const { data: campaignData, isLoading, isError, refetch } = useCampaign(routeId);
  const saveCampaign = useSaveCampaign();

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

  const currentStatus: common_EmailCampaignStatus =
    campaignData?.status || 'EMAIL_CAMPAIGN_STATUS_DRAFT';
  const readOnly = routeId > 0 && !EDITABLE_STATUSES.includes(currentStatus as any);
  const canEdit = canWrite(SECTION.marketing) && !readOnly;

  const zResolver = useMemo(() => zodResolver(campaignSchema) as any, []);
  const form = useForm<CampaignSchema>({
    resolver: async (values, ctx, opts) => {
      const filtered: CampaignSchema = {
        ...values,
        body: (values.body || []).filter((b: any) => !deletedIndicesRef.current.has(b._uid)),
      };
      return zResolver(filtered, ctx, opts);
    },
    defaultValues: defaultCampaign,
    mode: 'onTouched',
  });

  useBlockNavigation(hasUserMadeChanges);

  // Load an existing campaign into the form.
  useEffect(() => {
    if (routeId > 0 && campaignData) {
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
    return mapFormToCampaignInsert({ ...values, body: liveBody }, currentStatus);
  }, [form, currentStatus]);

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
              DRAFT / PAUSED campaigns can be edited.
            </Text>
          </div>
        )}

        <div className='flex flex-col gap-4 lg:flex-row lg:items-start'>
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

          <div className='min-w-0 flex-1 space-y-6'>
            {/* ── envelope ─────────────────────────────────────────────── */}
            <div className='space-y-4 border border-textInactiveColor p-4'>
              <Text variant='uppercase'>campaign details</Text>
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
                <ReleaseDateField
                  name='scheduleAt'
                  value={form.watch('scheduleAt')}
                  label='schedule at (optional)'
                />
              </div>
              <ABPanel />
              {routeId > 0 && currentStatus !== 'EMAIL_CAMPAIGN_STATUS_DRAFT' && <CampaignMetrics />}
            </div>

            {/* ── live preview ─────────────────────────────────────────── */}
            <CampaignPreviewPanel
              control={form.control}
              campaignId={routeId || undefined}
              deletedUids={deletedIndicesRef.current}
              deletedVersion={deletedVersion}
            />
          </div>
        </div>

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
