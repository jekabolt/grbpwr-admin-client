import { zodResolver } from '@hookform/resolvers/zod';
import { common_ArchiveFull } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useBlockNavigation } from 'hooks/useBlockNavigation';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import InputField from 'ui/form/fields/input-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { useCreateArchive, useUpdateArchive } from '../../archives/components/useArchiveQuery';
import { HeroSectionModal } from '../../hero/components/hero-section-modal';
import { useProductSelection } from '../../hero/components/useProductSelection';
import { ArchivePreviewPanel } from './archive-preview-panel';
import { ArchiveThumbnail } from './archive-thumbnail';
import { BlockEditorModal } from './block-editor-modal';
import { BlockRail } from './block-rail';
import { ArchiveItemValue, DEFAULT_ASPECT } from './item-types';
import { mapArchiveFullToForm } from './map-full-to-form';
import { mapFormToArchiveInsert } from './map-form-to-insert';
import { ArchiveFormData, defaultData, schema } from './schema';
import { SelectItemType } from './select-item-type';

// One header treatment shared by every section on the page: an uppercase title
// over a full-width rule, with an optional right-aligned hint.
function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className='flex flex-wrap items-baseline justify-between gap-2 border-b border-textInactiveColor pb-2'>
      <Text variant='uppercase' size='large'>
        {title}
      </Text>
      {hint && (
        <Text variant='label' size='small'>
          {hint}
        </Text>
      )}
    </div>
  );
}

export function ArchiveForm({
  isEditMode,
  isAddingArchive,
  id,
  archive,
}: {
  isEditMode: boolean;
  isAddingArchive: boolean;
  id?: string;
  archive?: common_ArchiveFull;
}) {
  const { showMessage } = useSnackBarStore();
  const navigate = useNavigate();
  const { canWrite } = usePermissions();

  // Resolved read model → form (+ the resolved-product cache, keyed by block uid).
  const initial = useMemo(
    () => (archive ? mapArchiveFullToForm(archive) : { ...defaultData, productsByUid: {} }),
    [archive],
  );
  const { productsByUid, ...initialValues } = initial;

  const entityRefs = useRef<{ [uid: string]: HTMLDivElement | null }>({});
  const deletedIndicesRef = useRef<Set<string>>(new Set());
  const [deletedVersion, setDeletedVersion] = useState(0);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [pendingNewUid, setPendingNewUid] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveSummary, setSaveSummary] = useState<{
    blocks: number;
    incomplete: number;
    detailsIncomplete: boolean;
  }>({ blocks: 0, incomplete: 0, detailsIncomplete: false });
  const [leaving, setLeaving] = useState(false);

  const createArchive = useCreateArchive();
  const updateArchive = useUpdateArchive();
  const isSaving = createArchive.isPending || updateArchive.isPending;

  const archiveZodResolver = useMemo(() => zodResolver(schema) as any, []);
  const form = useForm<ArchiveFormData>({
    // Strip soft-deleted blocks so Zod doesn't validate them, mirroring hero.
    resolver: async (values, context, options) => {
      const filtered = {
        ...values,
        items: (values.items || []).filter((e: any) => !deletedIndicesRef.current.has(e._uid)),
      };
      return archiveZodResolver(filtered, context, options);
    },
    defaultValues: initialValues as ArchiveFormData,
    mode: 'onTouched',
  });

  const productApi = useProductSelection(productsByUid);

  const { append, remove, move, insert } = useFieldArray({ control: form.control, name: 'items' });

  const hasChanges =
    form.formState.isDirty || (deletedVersion >= 0 && deletedIndicesRef.current.size > 0);

  // Warn on browser back / refresh / close and on the "← timeline" link while
  // there are unsaved edits. Suppressed once `leaving` flips (successful create).
  useBlockNavigation(hasChanges && !leaving);

  useEffect(() => {
    if (leaving) navigate(ROUTES.archives);
  }, [leaving, navigate]);

  const handleDeletedIndicesChange = useCallback(() => setDeletedVersion((v) => v + 1), []);

  const handlePreviewBlockClick = useCallback(
    (index: number) => {
      const live = (form.getValues().items || []).filter(
        (e: any) => !deletedIndicesRef.current.has(e._uid),
      );
      const uid = (live[index] as any)?._uid;
      if (uid) setEditingUid(uid);
    },
    [form],
  );

  const handleAddItem = useCallback(
    (type: ArchiveItemValue) => {
      const _uid = uuidv4();
      const seed: any = { type, _uid };
      if (DEFAULT_ASPECT[type]) seed.aspectRatio = DEFAULT_ASPECT[type];
      if (type === 'ARCHIVE_ITEM_TYPE_MEDIA_LINE') {
        seed.mediaIds = [];
        seed.mediaUrls = [];
      }
      append(seed);
      setAddMenuOpen(false);
      setEditingUid(_uid);
      setPendingNewUid(_uid);
    },
    [append],
  );

  // Clone a block: deep-copy its values under a fresh uid, copy its resolved-
  // product cache to that uid, insert right after the original, open the copy.
  const handleDuplicate = useCallback(
    (uid: string) => {
      const list = form.getValues().items || [];
      const idx = list.findIndex((e: any) => e._uid === uid);
      if (idx < 0) return;
      const clone = JSON.parse(JSON.stringify(list[idx]));
      const newUid = uuidv4();
      clone._uid = newUid;
      insert(idx + 1, clone);
      const prods = productApi.products[uid];
      if (prods?.length) productApi.saveSelection([...prods], newUid);
      setEditingUid(newUid);
    },
    [form, insert, productApi],
  );

  async function handleSubmit(data: ArchiveFormData) {
    const filtered = {
      ...data,
      items: (data.items || []).filter((e: any) => !deletedIndicesRef.current.has(e._uid)),
    };
    const archiveInsert = mapFormToArchiveInsert(filtered);
    try {
      if (isEditMode) {
        await updateArchive.mutateAsync({ id: parseInt(id || '0'), archiveData: archiveInsert });
        showMessage('timeline entry updated', 'success');
        form.reset(filtered);
        deletedIndicesRef.current.clear();
        setDeletedVersion((v) => v + 1);
      } else {
        await createArchive.mutateAsync(archiveInsert);
        showMessage('timeline entry created', 'success');
        setLeaving(true);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to submit archive';
      showMessage(msg, 'error');
      console.error('Failed to submit archive', error);
    }
  }

  // Pre-flight before saving: validate everything (so every incomplete block gets
  // its (!) flag in the rail and the card fields show inline errors), tally live
  // vs incomplete blocks and whether the card is incomplete, then open the confirm.
  const handleSaveClick = useCallback(async () => {
    await form.trigger();
    const values = form.getValues();
    const liveItems = (values.items || []).filter(
      (e: any) => !deletedIndicesRef.current.has(e._uid),
    );
    const result = schema.safeParse({ ...values, items: liveItems });
    const incompleteUids = new Set<string>();
    let detailsIncomplete = false;
    if (!result.success) {
      for (const issue of result.error.issues) {
        if (issue.path[0] === 'items' && typeof issue.path[1] === 'number') {
          const uid = (liveItems[issue.path[1]] as any)?._uid;
          if (uid) incompleteUids.add(uid);
        } else {
          detailsIncomplete = true;
        }
      }
    }
    setSaveSummary({
      blocks: liveItems.length,
      incomplete: incompleteUids.size,
      detailsIncomplete,
    });
    setConfirmOpen(true);
  }, [form]);

  const handleConfirmSave = () => {
    setConfirmOpen(false);
    form.handleSubmit(handleSubmit, onError)();
  };

  // Cmd/Ctrl+S opens the pre-save confirm (and suppresses the browser's save
  // dialog). Ignored while saving, when a sub-modal is open, or when an edit has
  // nothing to save.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (isSaving) return;
      if (editingUid || addMenuOpen || confirmOpen) return;
      if (isEditMode && !hasChanges) return;
      handleSaveClick();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSaving, editingUid, addMenuOpen, confirmOpen, isEditMode, hasChanges, handleSaveClick]);

  function onError(errors: any) {
    showMessage('please fill in all required fields', 'error');
    const values = form.getValues();
    if (errors.items) {
      const firstIdx = (errors.items as any[]).findIndex(
        (e, index) =>
          e !== undefined && !deletedIndicesRef.current.has((values.items?.[index] as any)?._uid),
      );
      const uid = (values.items?.[firstIdx] as any)?._uid;
      if (firstIdx >= 0 && uid && entityRefs.current[uid]) {
        const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        entityRefs.current[uid]?.scrollIntoView({
          behavior: prefersReduced ? 'auto' : 'smooth',
          block: 'center',
        });
      }
    }
  }

  return (
    <Form {...form}>
      <form
        className='flex flex-col gap-6 px-2 pt-0 pb-12 lg:px-6'
        onSubmit={form.handleSubmit(handleSubmit, onError)}
      >
        <div className='sticky top-0 z-10 -mx-2 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2 py-3 lg:-mx-6 lg:px-6'>
          <div className='flex flex-wrap items-center gap-3'>
            <Button asChild variant='secondary' size='lg'>
              <Link to={ROUTES.archives} aria-label='back to timeline'>
                <span className='sm:hidden'>←</span>
                <span className='hidden sm:inline'>← timeline</span>
              </Link>
            </Button>
            <Text variant='uppercase' size='large'>
              {isAddingArchive ? 'new timeline entry' : 'edit timeline entry'}
            </Text>
            {hasChanges && (
              <span className='border border-warning px-1.5 py-0.5 leading-none'>
                <Text size='small' variant='uppercase' className='text-warning'>
                  unsaved changes
                </Text>
              </span>
            )}
          </div>
          {canWrite(SECTION.archive) && (
            <Button
              type='button'
              variant='main'
              size='lg'
              className='uppercase cursor-pointer'
              disabled={(isEditMode && !hasChanges) || isSaving}
              loading={isSaving}
              onClick={handleSaveClick}
            >
              {isEditMode ? 'save' : 'create'}
            </Button>
          )}
        </div>

        <section className='space-y-4'>
          <SectionHeader title='card' hint='how this entry appears in the timeline list' />
          <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
            <div className='w-full space-y-4 lg:w-2/3'>
              <UnifiedTranslationFields
                fieldPrefix='translations'
                fields={[{ name: 'heading', label: 'heading (title)', maxLength: 90 }]}
              />
              {/* A10: this archive-level free-text label and the PRODUCTS_TAG
                  block's dictionary-backed product filter (block-editor.tsx) were
                  both called "tag" in the same form — two unrelated concepts
                  sharing one label. This one classifies the whole timeline entry
                  (e.g. a season or editorial); renamed to disambiguate. */}
              <InputField
                name='tag'
                label='timeline tag'
                placeholder='free text, e.g. ss24 or editorial — classifies this entry, unrelated to a block’s product tag'
              />
            </div>
            <div className='w-full lg:w-1/3'>
              <ArchiveThumbnail />
            </div>
          </div>
        </section>

        <div className='flex flex-col gap-4 lg:flex-row lg:items-start'>
          <div className='max-h-[50vh] shrink-0 overflow-y-auto lg:max-h-none lg:overflow-visible lg:sticky lg:top-20 lg:w-[240px]'>
            <BlockRail
              entityRefs={entityRefs}
              arrayHelpers={{ move }}
              deletedIndicesRef={deletedIndicesRef}
              onDeletedIndicesChange={handleDeletedIndicesChange}
              onSelectBlock={(uid) => setEditingUid(uid)}
              selectedUid={editingUid}
              onAddClick={() => setAddMenuOpen(true)}
              products={productApi.products}
            />
          </div>
          <div className='min-w-0 flex-1'>
            <ArchivePreviewPanel
              control={form.control}
              products={productApi.products}
              deletedIndicesRef={deletedIndicesRef}
              deletedVersion={deletedVersion}
              onBlockClick={handlePreviewBlockClick}
            />
          </div>
        </div>
      </form>

      <BlockEditorModal
        editingUid={editingUid}
        onOpenChange={(o) => {
          if (o) return;
          if (editingUid && editingUid === pendingNewUid) {
            const idx = (form.getValues().items || []).findIndex(
              (e: any) => e._uid === pendingNewUid,
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
        productApi={productApi}
      />

      <HeroSectionModal open={addMenuOpen} onOpenChange={setAddMenuOpen} title='add a block'>
        <SelectItemType onAdd={handleAddItem} />
      </HeroSectionModal>

      <ConfirmationModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmSave}
        title={isEditMode ? 'save timeline entry' : 'create timeline entry'}
        confirmLabel={isEditMode ? 'save' : 'create'}
        cancelLabel='keep editing'
        confirmDisabled={saveSummary.incomplete > 0 || saveSummary.detailsIncomplete}
      >
        <div className='space-y-2'>
          <Text>
            {isEditMode
              ? `this updates the live timeline entry (${saveSummary.blocks} block${
                  saveSummary.blocks === 1 ? '' : 's'
                }).`
              : saveSummary.blocks === 0
                ? 'this publishes a timeline entry with no body blocks yet.'
                : `this publishes a new timeline entry with ${saveSummary.blocks} block${
                    saveSummary.blocks === 1 ? '' : 's'
                  }.`}
          </Text>
          {saveSummary.detailsIncomplete && (
            <Text variant='error'>the card is incomplete — check the heading and tag.</Text>
          )}
          {saveSummary.incomplete > 0 && (
            <Text variant='error'>
              {saveSummary.incomplete} block
              {saveSummary.incomplete === 1 ? ' is' : 's are'} incomplete — fix the flagged (!)
              block{saveSummary.incomplete === 1 ? '' : 's'} in the rail first.
            </Text>
          )}
        </div>
      </ConfirmationModal>
    </Form>
  );
}
