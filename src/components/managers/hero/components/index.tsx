import { zodResolver } from '@hookform/resolvers/zod';

import { useBlockNavigation } from 'hooks/useBlockNavigation';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import { BlockEditorModal } from './block-editor-modal';
import { BlockRail } from './block-rail';
import { HeroPreviewPanel } from './hero-preview-panel';
import { HeroSectionModal } from './hero-section-modal';
import { mapFormFieldsToHeroData, mapHeroFullToFormData } from './map-schema-to-hero-data';
import { NavFeatured } from './nav-featured';
import { defaultData, HeroSchema, heroSchema } from './schema';
import { SelectHeroType } from './selectHeroType';
import { useHero, useSaveHero } from './useHero';
import { useProductSelection } from './useProductSelection';

export function Hero() {
  const { data: heroData, isLoading } = useHero();
  const saveHero = useSaveHero();
  const { showMessage } = useSnackBarStore();
  const entityRefs = useRef<{ [uid: string]: HTMLDivElement | null }>({});
  const productsByEntityUidRef = useRef<Record<string, any[]>>({});
  const deletedIndicesRef = useRef<Set<string>>(new Set());
  const [deletedIndicesVersion, setDeletedIndicesVersion] = useState(0);
  const [hasUserMadeChanges, setHasUserMadeChanges] = useState(false);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const isResettingRef = useRef(false);
  const heroZodResolver = useMemo(() => zodResolver(heroSchema) as any, []);

  const form = useForm<HeroSchema>({
    resolver: async (values, context, options) => {
      // strip entities that are "soft-deleted" so Zod doesn't validate them
      const filteredValues: HeroSchema = {
        ...values,
        entities: values.entities.filter((e: any) => !deletedIndicesRef.current.has(e._uid)),
      };

      return heroZodResolver(filteredValues, context, options);
    },
    defaultValues: defaultData as HeroSchema,
    mode: 'onSubmit',
  });

  useBlockNavigation(hasUserMadeChanges);

  useEffect(() => {
    if (heroData) {
      isResettingRef.current = true;
      const mappedData = mapHeroFullToFormData(heroData.hero);
      productsByEntityUidRef.current = mappedData.productsByEntityUid || {};
      form.reset(mappedData);
      deletedIndicesRef.current.clear();
      setHasUserMadeChanges(false);
      // Give form time to fully reset before allowing watch to track changes
      setTimeout(() => {
        isResettingRef.current = false;
      }, 0);
    }
  }, [heroData, form]);

  // Track when user makes changes
  useEffect(() => {
    const subscription = form.watch(() => {
      if (!isResettingRef.current && form.formState.isDirty) {
        setHasUserMadeChanges(true);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const { append, move, insert } = useFieldArray({
    control: form.control,
    name: 'entities',
  });

  // Lifted here (was in Entities) so the editor and the live preview share one
  // product cache — product edits are reflected in the preview immediately.
  const featuredProducts = useProductSelection(productsByEntityUidRef.current);

  const handleDeletedIndicesChange = useCallback(() => {
    setDeletedIndicesVersion((v) => v + 1);
  }, []);

  // Preview reports a click as an index into the (soft-delete-filtered) draft;
  // map it back to the block's uid and open that block's editor modal.
  const handlePreviewBlockClick = useCallback(
    (index: number) => {
      const live = (form.getValues().entities || []).filter(
        (e: any) => !deletedIndicesRef.current.has(e._uid),
      );
      const uid = (live[index] as any)?._uid;
      if (uid) setEditingUid(uid);
    },
    [form],
  );

  async function handleSubmit(data: HeroSchema) {
    const entities = data.entities;

    // Filter out deleted entities before sending
    const filteredData = {
      ...data,
      entities: entities.filter((e: any) => !deletedIndicesRef.current.has(e._uid)),
    };

    const heroData = mapFormFieldsToHeroData(filteredData);
    try {
      await saveHero.mutateAsync(heroData);
      isResettingRef.current = true;
      form.reset(filteredData);
      deletedIndicesRef.current.clear();
      setHasUserMadeChanges(false);
      setTimeout(() => {
        isResettingRef.current = false;
      }, 0);
      showMessage('Hero saved successfully!', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error saving hero';
      showMessage(msg, 'error');
    }
  }

  function onError(errors: any) {
    // log RHF-level errors
    console.log('Validation errors (RHF):', errors);

    // log Zod schema errors explicitly (ignoring soft-deleted entities)
    const values = form.getValues();
    const filteredValues: HeroSchema = {
      ...values,
      entities: values.entities.filter((e: any) => !deletedIndicesRef.current.has(e._uid)),
    };
    const result = heroSchema.safeParse(filteredValues);

    if (!result.success) {
      console.log(
        'Hero schema errors (Zod):',
        result.error.flatten(), // or result.error.issues for raw issues
      );
    }

    // Clear errors for deleted entities (RHF error paths are positional -> map uid to index)
    if (errors.entities) {
      values.entities.forEach((e: any, index: number) => {
        if (deletedIndicesRef.current.has(e._uid)) {
          form.clearErrors(`entities.${index}` as any);
        }
      });
    }

    showMessage('please fill in all required fields', 'error');

    if (errors.entities) {
      const firstErrorIndex = errors.entities.findIndex(
        (entity: any, index: number) =>
          entity !== undefined &&
          !deletedIndicesRef.current.has((values.entities[index] as any)?._uid),
      );
      const firstErrorUid = (values.entities[firstErrorIndex] as any)?._uid;
      if (firstErrorIndex >= 0 && firstErrorUid && entityRefs.current[firstErrorUid]) {
        entityRefs.current[firstErrorUid]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit, onError)} className='flex flex-col'>
        <div className='-mx-2.5 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-textColor bg-bgColor px-2.5 py-3'>
          <div className='flex items-baseline gap-2'>
            <Text variant='uppercase' size='large'>
              hero
            </Text>
            {hasUserMadeChanges && <Text variant='inactive'>unsaved changes</Text>}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={() => setNavOpen(true)}
            >
              nav featured
            </Button>
            <Button
              size='lg'
              variant='main'
              type='submit'
              disabled={isLoading || form.formState.isSubmitting || saveHero.isPending}
              loading={saveHero.isPending}
              className='uppercase'
            >
              save
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className='flex justify-center py-20'>
            <Text variant='inactive' className='animate-pulse'>
              loading hero…
            </Text>
          </div>
        ) : (
          <div className='flex flex-col gap-4 lg:flex-row lg:items-start'>
            <div className='shrink-0 lg:sticky lg:top-4 lg:w-[240px]'>
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
              <HeroPreviewPanel
                control={form.control}
                products={featuredProducts.products}
                deletedIndicesRef={deletedIndicesRef}
                deletedVersion={deletedIndicesVersion}
                onBlockClick={handlePreviewBlockClick}
              />
            </div>
          </div>
        )}

        <BlockEditorModal
          editingUid={editingUid}
          onOpenChange={(o) => {
            if (!o) setEditingUid(null);
          }}
          featuredProducts={featuredProducts}
        />

        <HeroSectionModal open={addMenuOpen} onOpenChange={setAddMenuOpen} title='add a block'>
          <SelectHeroType
            append={append}
            insert={insert}
            form={form}
            entityRefs={entityRefs}
            deletedIndicesRef={deletedIndicesRef}
            onAdded={(uid) => {
              setAddMenuOpen(false);
              setEditingUid(uid);
            }}
          />
        </HeroSectionModal>

        <HeroSectionModal open={navOpen} onOpenChange={setNavOpen} title='nav featured'>
          <NavFeatured hero={heroData?.hero} />
        </HeroSectionModal>
      </form>
    </Form>
  );
}
