import { zodResolver } from '@hookform/resolvers/zod';
import * as DialogPrimitives from '@radix-ui/react-dialog';
import { EMAIL_BG_COLOR_OPTIONS, EMAIL_TOPIC_OPTIONS } from 'constants/email-campaign';
import { useBlockNavigation } from 'hooks/useBlockNavigation';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { v4 as uuidv4 } from 'uuid';
import { BlockEditorModal } from './block-editor-modal';
import { BlockRail } from './block-rail';
import { campaignSchema, CampaignSchema, defaultCampaign } from './schema';
import { SelectEmailType } from './selectEmailType';

/**
 * Email-campaign builder SHELL — the proto-independent foundation. It wires the
 * RHF discriminated-union form (campaignSchema), the soft-delete block rail, the
 * click-to-edit block-editor modal and the add-block palette, exactly mirroring
 * the hero builder's architecture — MINUS everything that needs the regenerated
 * proto client:
 *   - useCampaign / useSaveCampaign hooks (load/persist)  -> proto-gated follow-up
 *   - mapFormToCampaignInsert mapper                       -> proto-gated follow-up
 *   - <iframe> RenderCampaignPreview panel                 -> proto-gated follow-up
 *   - route / SECTION / nav registration                  -> proto-gated follow-up
 *
 * It is intentionally NOT registered in src/index.tsx routes yet, so the app
 * bundle is unchanged and `yarn build:check` stays green.
 */
export function CampaignBuilder() {
  const { showMessage } = useSnackBarStore();
  const entityRefs = useRef<{ [uid: string]: HTMLDivElement | null }>({});
  const deletedIndicesRef = useRef<Set<string>>(new Set());
  const [deletedVersion, setDeletedVersion] = useState(0);
  const [hasUserMadeChanges, setHasUserMadeChanges] = useState(false);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [pendingNewUid, setPendingNewUid] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const isResettingRef = useRef(false);

  const form = useForm<CampaignSchema>({
    resolver: async (values, context, options) => {
      // Strip soft-deleted blocks so Zod doesn't validate them (hero parity).
      const filtered: CampaignSchema = {
        ...values,
        body: (values.body || []).filter((b: any) => !deletedIndicesRef.current.has(b._uid)),
      };
      return (zodResolver(campaignSchema) as any)(filtered, context, options);
    },
    defaultValues: defaultCampaign,
    mode: 'onTouched',
  });

  useBlockNavigation(hasUserMadeChanges);

  useEffect(() => {
    const sub = form.watch(() => {
      if (!isResettingRef.current && form.formState.isDirty) setHasUserMadeChanges(true);
    });
    return () => sub.unsubscribe();
  }, [form]);

  const { append, remove, move, insert } = useFieldArray({ control: form.control, name: 'body' });

  const handleDeletedIndicesChange = useCallback(() => setDeletedVersion((v) => v + 1), []);

  const handleDuplicate = useCallback(
    (uid: string) => {
      const list = form.getValues().body || [];
      const idx = list.findIndex((b: any) => b._uid === uid);
      if (idx < 0) return;
      const clone = JSON.parse(JSON.stringify(list[idx]));
      clone._uid = uuidv4();
      insert(idx + 1, clone);
      setEditingUid(clone._uid);
    },
    [form, insert],
  );

  // Proto-independent stand-in for save: validate the draft and report how many
  // blocks are incomplete. The real persistence (useSaveCampaign -> UpsertEmail
  // Campaign) lands with the regenerated proto client.
  const handleValidateDraft = useCallback(async () => {
    await form.trigger();
    const values = form.getValues();
    const liveBlocks = (values.body || []).filter(
      (b: any) => !deletedIndicesRef.current.has(b._uid),
    );
    const result = campaignSchema.safeParse({ ...values, body: liveBlocks });
    if (result.success) {
      showMessage(`draft is valid — ${liveBlocks.length} block(s) ready`, 'success');
    } else {
      const blockIssues = new Set<number>();
      let envelopeIssue = false;
      for (const issue of result.error.issues) {
        if (issue.path[0] === 'body' && typeof issue.path[1] === 'number') {
          blockIssues.add(issue.path[1]);
        } else {
          envelopeIssue = true;
        }
      }
      showMessage(
        `draft incomplete — ${blockIssues.size} block(s)${envelopeIssue ? ' + envelope' : ''} need attention`,
        'error',
      );
    }
    // Deep-scroll to the first flagged block, if any.
    const errs = form.formState.errors.body as any[] | undefined;
    if (Array.isArray(errs)) {
      const firstErrIdx = errs.findIndex(
        (e, i) => e !== undefined && !deletedIndicesRef.current.has((liveBlocks[i] as any)?._uid),
      );
      const uid = (liveBlocks[firstErrIdx] as any)?._uid;
      if (uid && entityRefs.current[uid]) {
        entityRefs.current[uid]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [form, showMessage]);

  return (
    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()} className='flex flex-col'>
        <div className='sticky top-0 z-10 -mx-2.5 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
          <div className='flex items-baseline gap-2'>
            <Text variant='uppercase' size='large'>
              email campaign
            </Text>
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
              onClick={handleValidateDraft}
            >
              validate draft
            </Button>
            <Button type='button' variant='main' size='lg' className='uppercase' disabled title='persistence lands with the proto client'>
              save (proto-gated)
            </Button>
          </div>
        </div>

        <div className='flex flex-col gap-4 lg:flex-row lg:items-start'>
          <div className='max-h-[50vh] shrink-0 overflow-y-auto lg:max-h-none lg:overflow-visible lg:sticky lg:top-20 lg:w-[260px]'>
            <BlockRail
              entityRefs={entityRefs}
              arrayHelpers={{ move }}
              deletedIndicesRef={deletedIndicesRef}
              onDeletedIndicesChange={handleDeletedIndicesChange}
              onSelectBlock={(uid) => setEditingUid(uid)}
              selectedUid={editingUid}
              onAddClick={() => setAddMenuOpen(true)}
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
              />
              <div className='border border-dashed border-textInactiveColor p-3'>
                <Text variant='label' size='small'>
                  segment picker (Ф2), schedule + A/B panel (Ф4) and the server-rendered
                  &lt;iframe&gt; preview (RenderCampaignPreview) are wired in the proto-gated
                  follow-up.
                </Text>
              </div>
            </div>
          </div>
        </div>

        <BlockEditorModal
          editingUid={editingUid}
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
                form={form}
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

        {/* deletedVersion is tracked for future preview re-render parity */}
        <span className='hidden' data-deleted-version={deletedVersion} />
      </form>
    </Form>
  );
}

export default CampaignBuilder;
