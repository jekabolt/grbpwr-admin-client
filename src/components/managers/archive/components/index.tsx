import { zodResolver } from '@hookform/resolvers/zod';
import { adminService } from 'api/api';
import { common_ArchiveFull, common_ArchiveItemType } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { HeroSectionModal } from '../../hero/components/hero-section-modal';
import { TagPicker } from '../../hero/components/tag-picker';
import { useProductSelection } from '../../hero/components/useProductSelection';
import { ArchiveMainMedia } from './archive-main-media';
import { ArchivePreviewPanel } from './archive-preview-panel';
import { BlockEditorModal } from './block-editor-modal';
import { BlockRail } from './block-rail';
import { mapArchiveFullToForm } from './map-full-to-form';
import { mapFormToArchiveInsert } from './map-form-to-insert';
import { ArchiveFormData, defaultData, schema } from './schema';
import { SelectItemType } from './select-item-type';

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
  const editMode = isEditMode || isAddingArchive;

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
    // onTouched so incomplete-block badges + inline errors surface as the user edits.
    mode: 'onTouched',
  });

  // Lifted so the editor and the live preview share one product cache — product
  // edits are reflected in the preview immediately.
  const productApi = useProductSelection(productsByUid);

  const { append, remove, move, insert } = useFieldArray({ control: form.control, name: 'items' });

  // deletedVersion (a state counter bumped on soft-delete change) is read in the
  // preview props below; referencing it here keeps hasChanges recomputing too.
  const hasChanges =
    form.formState.isDirty || (deletedVersion >= 0 && deletedIndicesRef.current.size > 0);

  const handleDeletedIndicesChange = useCallback(() => setDeletedVersion((v) => v + 1), []);

  // Preview reports a click as an index into the (soft-delete-filtered) draft;
  // map it back to the block's uid and open that block's editor modal.
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
    (type: common_ArchiveItemType) => {
      const _uid = uuidv4();
      append({ type, _uid } as any);
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
        await adminService.UpdateArchive({ id: parseInt(id || '0'), archiveInsert });
        showMessage('archive updated', 'success');
        form.reset(filtered);
        deletedIndicesRef.current.clear();
        setDeletedVersion((v) => v + 1);
      } else {
        await adminService.AddArchive({ archiveInsert });
        showMessage('archive created', 'success');
        navigate(ROUTES.archives);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to submit archive';
      showMessage(msg, 'error');
      console.error('Failed to submit archive', error);
    }
  }

  function onError(errors: any) {
    showMessage('please fill in all required fields', 'error');
    // Scroll the first incomplete body block into view in the rail.
    const values = form.getValues();
    if (errors.items) {
      const firstIdx = (errors.items as any[]).findIndex(
        (e, index) =>
          e !== undefined && !deletedIndicesRef.current.has((values.items?.[index] as any)?._uid),
      );
      const uid = (values.items?.[firstIdx] as any)?._uid;
      if (firstIdx >= 0 && uid && entityRefs.current[uid]) {
        entityRefs.current[uid]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  const handleCancel = () => navigate(ROUTES.archives);
  const submit = () => form.handleSubmit(handleSubmit, onError)();

  return (
    <Form {...form}>
      <form
        className='flex flex-col gap-6 px-2 pt-2 pb-24 lg:px-6'
        onSubmit={form.handleSubmit(handleSubmit, onError)}
      >
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textColor pb-3'>
          <div className='flex flex-wrap items-center gap-3'>
            <Button asChild variant='secondary' size='lg'>
              <Link to={ROUTES.archives}>← timeline</Link>
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
        </div>

        <Section title='details'>
          <div className='flex flex-col gap-6 lg:flex-row lg:items-start'>
            <div className='w-full space-y-4 lg:w-1/2'>
              <UnifiedTranslationFields
                fieldPrefix='translations'
                fields={[
                  { name: 'heading', label: 'heading', maxLength: 90 },
                  {
                    name: 'description',
                    label: 'description',
                    type: 'textarea',
                    rows: 5,
                    maxLength: 10000,
                  },
                ]}
              />
              <Controller
                control={form.control}
                name='tag'
                render={({ field, fieldState }) => (
                  <div className='space-y-1'>
                    <TagPicker
                      value={field.value || ''}
                      onChange={field.onChange}
                      label='tag'
                      placeholder='select or type a tag'
                    />
                    {fieldState.error && <Text variant='error'>{fieldState.error.message}</Text>}
                  </div>
                )}
              />
            </div>
            <div className='w-full space-y-2 lg:w-1/2'>
              <Text variant='label' size='small'>
                main media (timeline header band)
              </Text>
              <ArchiveMainMedia archive={archive} control={form.control} editMode={editMode} />
            </div>
          </div>
        </Section>

        <div className='flex flex-col gap-4 lg:flex-row lg:items-start'>
          <div className='max-h-[50vh] shrink-0 overflow-y-auto lg:max-h-none lg:overflow-visible lg:sticky lg:top-4 lg:w-[240px]'>
            <Text variant='uppercase' size='small' className='mb-2 block'>
              body
            </Text>
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

      <div className='fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-textColor bg-bgColor px-3 py-2'>
        <Text variant='inactive' size='small'>
          {hasChanges ? 'unsaved changes' : ' '}
        </Text>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase cursor-pointer'
            onClick={handleCancel}
          >
            cancel
          </Button>
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase cursor-pointer'
            disabled={(isEditMode && !hasChanges) || form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
            onClick={submit}
          >
            {isEditMode ? 'save' : 'add'}
          </Button>
        </div>
      </div>

      <BlockEditorModal
        editingUid={editingUid}
        onOpenChange={(o) => {
          if (o) return;
          // Closing a freshly-added block without confirming discards it.
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
    </Form>
  );
}
