import { zodResolver } from '@hookform/resolvers/zod';

import { common_HeroFullWithTranslations } from 'api/proto-http/frontend';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useBlockNavigation } from 'hooks/useBlockNavigation';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
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

// H9: publishing the hero is a full, unversioned overwrite of the live storefront
// hero with no server-side history. This is a frontend-only mitigation: stash the
// state that's about to be overwritten (a single slot, refreshed on every publish)
// so "revert to last published" can load it back into the editor for review.
const HERO_SNAPSHOT_KEY = 'hero:lastPublishedSnapshot';

// H4: LAST_CHANCE/NEW_ARRIVALS stockThreshold/limit are write-only on read (the
// contract returns resolved `products`, not the rule that produced them — see the
// comments in map-schema-to-hero-data.ts). Any heroData-driven form reset —
// including the background refetch that follows a publish — would otherwise stomp
// a value the operator just entered with `undefined` moments later. Carry the
// last-known value forward positionally when the freshly mapped entity is missing
// it and the previous form state (same slot, same type) had one.
function carryForwardWriteOnlyRuleValues(prevEntities: any[], newEntities: any[]): any[] {
  return newEntities.map((entity, i) => {
    const prev = prevEntities[i];
    if (!prev || prev.type !== entity.type) return entity;
    if (entity.type === 'HERO_TYPE_LAST_CHANCE') {
      const stockThreshold = entity.lastChance?.stockThreshold ?? prev.lastChance?.stockThreshold;
      const limit = entity.lastChance?.limit ?? prev.lastChance?.limit;
      if (
        stockThreshold === entity.lastChance?.stockThreshold &&
        limit === entity.lastChance?.limit
      ) {
        return entity;
      }
      return { ...entity, lastChance: { ...entity.lastChance, stockThreshold, limit } };
    }
    if (entity.type === 'HERO_TYPE_NEW_ARRIVALS') {
      const limit = entity.newArrivals?.limit ?? prev.newArrivals?.limit;
      if (limit === entity.newArrivals?.limit) return entity;
      return { ...entity, newArrivals: { ...entity.newArrivals, limit } };
    }
    return entity;
  });
}

export function Hero() {
  const { data: heroData, isLoading, isError, refetch } = useHero();
  const saveHero = useSaveHero();
  const { canWrite } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const entityRefs = useRef<{ [uid: string]: HTMLDivElement | null }>({});
  const productsByEntityUidRef = useRef<Record<string, any[]>>({});
  const deletedIndicesRef = useRef<Set<string>>(new Set());
  const [deletedIndicesVersion, setDeletedIndicesVersion] = useState(0);
  const [hasUserMadeChanges, setHasUserMadeChanges] = useState(false);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [pendingNewUid, setPendingNewUid] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishSummary, setPublishSummary] = useState<{ live: number; incomplete: number }>({
    live: 0,
    incomplete: 0,
  });
  const isResettingRef = useRef(false);
  // H9: tracks the most-recently-loaded live hero, so a publish can snapshot
  // "what's about to be overwritten" right before it does.
  const publishedSnapshotRef = useRef<common_HeroFullWithTranslations | null>(null);
  const [revertAvailable, setRevertAvailable] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
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
    // Validate on blur (then re-validate on change) so incomplete-block badges in
    // the rail and inline field errors surface as the user edits, not only after a
    // failed publish.
    mode: 'onTouched',
  });

  useBlockNavigation(hasUserMadeChanges);

  useEffect(() => {
    if (heroData) {
      isResettingRef.current = true;
      const mappedData = mapHeroFullToFormData(heroData.hero);
      productsByEntityUidRef.current = mappedData.productsByEntityUid || {};
      // H4: patch in any write-only rule values (LAST_CHANCE/NEW_ARRIVALS) the
      // current form already knows but this fresh read doesn't carry.
      const prevEntities = form.getValues().entities || [];
      const patchedEntities = carryForwardWriteOnlyRuleValues(
        prevEntities,
        mappedData.entities || [],
      );
      form.reset({ ...mappedData, entities: patchedEntities });
      deletedIndicesRef.current.clear();
      setHasUserMadeChanges(false);
      // Give form time to fully reset before allowing watch to track changes
      setTimeout(() => {
        isResettingRef.current = false;
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroData, form]);

  // H9: remember the live hero as last loaded (pre-edit), so a publish can
  // snapshot it right before overwriting it.
  useEffect(() => {
    if (heroData?.hero) {
      publishedSnapshotRef.current = heroData.hero;
    }
  }, [heroData]);

  useEffect(() => {
    try {
      setRevertAvailable(!!localStorage.getItem(HERO_SNAPSHOT_KEY));
    } catch {
      setRevertAvailable(false);
    }
  }, []);

  // Track when user makes changes
  useEffect(() => {
    const subscription = form.watch(() => {
      if (!isResettingRef.current && form.formState.isDirty) {
        setHasUserMadeChanges(true);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const { append, remove, move, insert } = useFieldArray({
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

  // Clone a block: deep-copy its form values under a fresh uid, copy its
  // resolved-product display cache to that uid, insert it right after the
  // original, and open the copy for editing (kept on close, not a pendingNew).
  const handleDuplicate = useCallback(
    (uid: string) => {
      const list = form.getValues().entities || [];
      const idx = list.findIndex((e: any) => e._uid === uid);
      if (idx < 0) return;
      const clone = JSON.parse(JSON.stringify(list[idx]));
      const newUid = uuidv4();
      clone._uid = newUid;
      insert(idx + 1, clone);
      const prods = featuredProducts.products[uid];
      if (prods?.length) featuredProducts.saveSelection([...prods], newUid);
      setEditingUid(newUid);
    },
    [form, insert, featuredProducts],
  );

  async function handleSubmit(data: HeroSchema) {
    const entities = data.entities;

    // Filter out deleted entities before sending
    const filteredData = {
      ...data,
      entities: entities.filter((e: any) => !deletedIndicesRef.current.has(e._uid)),
    };

    const heroData = mapFormFieldsToHeroData(filteredData);

    // H9: stash what's about to be overwritten (a single slot, refreshed on every
    // publish — including a revert-publish) so "revert to last published" can
    // load it back in. Best-effort: storage being full/unavailable shouldn't block
    // publishing.
    if (publishedSnapshotRef.current) {
      try {
        localStorage.setItem(
          HERO_SNAPSHOT_KEY,
          JSON.stringify({
            hero: publishedSnapshotRef.current,
            savedAt: new Date().toISOString(),
          }),
        );
        setRevertAvailable(true);
      } catch {
        // ignore — revert just won't be offered from this publish
      }
    }

    try {
      await saveHero.mutateAsync(heroData);
      isResettingRef.current = true;
      form.reset(filteredData);
      deletedIndicesRef.current.clear();
      setHasUserMadeChanges(false);
      setTimeout(() => {
        isResettingRef.current = false;
      }, 0);
      showMessage('hero published to the live storefront', 'success');
    } catch {
      // The error toast is surfaced by useSaveHero's onError; swallow the
      // rejected mutateAsync here so it doesn't bubble as an unhandled rejection
      // (and so the form isn't reset — the user's edits are preserved).
    }
  }

  // H9: load the pre-last-publish snapshot into the editor for review. Nothing
  // goes live until the operator reviews it and clicks publish themselves — this
  // reuses the normal validate/confirm/publish pipeline rather than force-pushing
  // straight back to the storefront.
  const handleRevertConfirm = useCallback(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(HERO_SNAPSHOT_KEY);
    } catch {
      raw = null;
    }
    if (!raw) {
      showMessage('no earlier published snapshot to revert to', 'error');
      setRevertConfirmOpen(false);
      return;
    }
    try {
      const snapshot = JSON.parse(raw) as { hero: common_HeroFullWithTranslations };
      const formData = mapHeroFullToFormData(snapshot.hero);
      isResettingRef.current = true;
      productsByEntityUidRef.current = formData.productsByEntityUid || {};
      form.reset(formData);
      deletedIndicesRef.current.clear();
      setHasUserMadeChanges(true);
      setTimeout(() => {
        isResettingRef.current = false;
      }, 0);
      showMessage(
        'loaded the last published snapshot — review it, then click publish to make it live',
        'success',
      );
    } catch {
      showMessage("couldn't read the last published snapshot", 'error');
    }
    setRevertConfirmOpen(false);
  }, [form, showMessage]);

  // Pre-flight before publishing: validate everything (so every incomplete block
  // gets flagged in the rail), tally live vs incomplete blocks, then open the
  // confirm/summary. Publishing overwrites the live storefront hero.
  const handlePublishClick = useCallback(async () => {
    await form.trigger();
    const values = form.getValues();
    const liveEntities = (values.entities || []).filter(
      (e: any) => !deletedIndicesRef.current.has(e._uid),
    );
    const result = heroSchema.safeParse({ ...values, entities: liveEntities });
    const incompleteUids = new Set<string>();
    if (!result.success) {
      for (const issue of result.error.issues) {
        if (issue.path[0] === 'entities' && typeof issue.path[1] === 'number') {
          const uid = (liveEntities[issue.path[1]] as any)?._uid;
          if (uid) incompleteUids.add(uid);
        }
      }
    }
    setPublishSummary({ live: liveEntities.length, incomplete: incompleteUids.size });
    setConfirmOpen(true);
  }, [form]);

  // Cmd/Ctrl+S opens the pre-publish confirm (and suppresses the browser's save
  // dialog). Ignored while loading/erroring/publishing or when the confirm is
  // already open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (isLoading || isError || saveHero.isPending) return;
      // don't stack the publish confirm on top of an open sub-modal
      if (editingUid || addMenuOpen || navOpen || confirmOpen) return;
      handlePublishClick();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isLoading,
    isError,
    saveHero.isPending,
    editingUid,
    addMenuOpen,
    navOpen,
    confirmOpen,
    handlePublishClick,
  ]);

  const handleConfirmPublish = () => {
    setConfirmOpen(false);
    form.handleSubmit(handleSubmit, onError)();
  };

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
        <div className='sticky top-0 z-10 -mx-2.5 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
          <div className='flex items-baseline gap-2'>
            <Text variant='uppercase' size='large'>
              hero
            </Text>
            {hasUserMadeChanges && (
              <span className='border border-warning px-1.5 py-0.5 leading-none'>
                <Text size='small' variant='uppercase' className='text-warning'>
                  unsaved changes
                </Text>
              </span>
            )}
          </div>
          {canWrite(SECTION.hero) && (
            <div className='flex items-center gap-2'>
              {/* H9: frontend-only "undo" — loads the state from right before the
                  last publish back into the editor for review. */}
              {revertAvailable && (
                <Button
                  type='button'
                  variant='secondary'
                  size='lg'
                  className='uppercase'
                  onClick={() => setRevertConfirmOpen(true)}
                  disabled={isLoading || isError || saveHero.isPending}
                >
                  revert to last published
                </Button>
              )}
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='uppercase'
                onClick={() => setNavOpen(true)}
              >
                nav featured
              </Button>
              {/* H12: this button used to read "save" but was wired to an
                  immediate full publish to the live storefront — relabeled to
                  match what it actually does. */}
              <Button
                size='lg'
                variant='main'
                type='button'
                onClick={handlePublishClick}
                disabled={isLoading || isError || form.formState.isSubmitting || saveHero.isPending}
                loading={saveHero.isPending}
                className='uppercase'
              >
                publish
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className='flex justify-center py-20'>
            <Text variant='inactive' className='animate-pulse'>
              loading hero…
            </Text>
          </div>
        ) : isError ? (
          <div className='flex flex-col items-center gap-3 py-20'>
            <Text variant='error'>couldn&apos;t load the hero.</Text>
            <Text variant='label' size='small'>
              publishing is disabled until it loads, so the live hero isn&apos;t overwritten.
            </Text>
            <Button type='button' variant='secondary' size='lg' onClick={() => refetch()}>
              retry
            </Button>
          </div>
        ) : (
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
            if (o) return;
            // Closing a freshly-added block without confirming discards it.
            if (editingUid && editingUid === pendingNewUid) {
              const idx = (form.getValues().entities || []).findIndex(
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
          featuredProducts={featuredProducts}
        />

        <HeroSectionModal open={addMenuOpen} onOpenChange={setAddMenuOpen} title='add a block'>
          <SelectHeroType
            append={append}
            form={form}
            entityRefs={entityRefs}
            onAdded={(uid) => {
              setAddMenuOpen(false);
              setEditingUid(uid);
              setPendingNewUid(uid);
            }}
          />
        </HeroSectionModal>

        <HeroSectionModal open={navOpen} onOpenChange={setNavOpen} title='nav featured'>
          <NavFeatured hero={heroData?.hero} />
        </HeroSectionModal>

        <ConfirmationModal
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={handleConfirmPublish}
          title='publish hero'
          confirmLabel='publish'
          cancelLabel='cancel'
          confirmDisabled={publishSummary.incomplete > 0}
        >
          <div className='space-y-2'>
            <Text>
              {publishSummary.live === 0
                ? 'this publishes an empty hero (no blocks) to the live storefront.'
                : `this replaces the live storefront hero with ${publishSummary.live} block${
                    publishSummary.live === 1 ? '' : 's'
                  }.`}
            </Text>
            {publishSummary.incomplete > 0 && (
              <Text variant='error'>
                {publishSummary.incomplete} block
                {publishSummary.incomplete === 1 ? ' is' : 's are'} incomplete — fix the flagged (!)
                block{publishSummary.incomplete === 1 ? '' : 's'} in the rail first.
              </Text>
            )}
          </div>
        </ConfirmationModal>

        <ConfirmationModal
          open={revertConfirmOpen}
          onOpenChange={setRevertConfirmOpen}
          onConfirm={handleRevertConfirm}
          title='revert to last published'
          confirmLabel='load snapshot'
          cancelLabel='cancel'
        >
          <Text>
            this loads the hero as it looked right before your last publish back into the editor
            (discarding any unsaved edits here). nothing goes live until you review it and click
            publish.
          </Text>
        </ConfirmationModal>
      </form>
    </Form>
  );
}
