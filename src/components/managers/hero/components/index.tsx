import { zodResolver } from '@hookform/resolvers/zod';

import { useBlockNavigation } from 'hooks/useBlockNavigation';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Form } from 'ui/form';
import { Entities } from './entities';
import { mapFormFieldsToHeroData, mapHeroFullToFormData } from './map-schema-to-hero-data';
import { NavFeatured } from './nav-featured';
import { defaultData, HeroSchema, heroSchema } from './schema';
import { SelectHeroType } from './selectHeroType';
import { useHero, useSaveHero } from './useHero';

export function Hero() {
  const { data: heroData, isLoading } = useHero();
  const saveHero = useSaveHero();
  const { showMessage } = useSnackBarStore();
  const entityRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const productsByEntityIndexRef = useRef<Record<number, any[]>>({});
  const deletedIndicesRef = useRef<Set<number>>(new Set());
  const [deletedIndicesVersion, setDeletedIndicesVersion] = useState(0);
  const [hasUserMadeChanges, setHasUserMadeChanges] = useState(false);
  const isResettingRef = useRef(false);

  const form = useForm<HeroSchema>({
    resolver: zodResolver(heroSchema),
    defaultValues: defaultData as HeroSchema,
    mode: 'onSubmit',
  });

  useBlockNavigation(hasUserMadeChanges);

  useEffect(() => {
    if (heroData) {
      isResettingRef.current = true;
      const mappedData = mapHeroFullToFormData(heroData.hero);
      productsByEntityIndexRef.current = mappedData.productsByEntityIndex || {};
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

  const { append, remove, move, insert } = useFieldArray({
    control: form.control,
    name: 'entities',
  });

  const handleDeletedIndicesChange = useCallback(() => {
    setDeletedIndicesVersion((v) => v + 1);
  }, []);

  async function handleSubmit(data: HeroSchema) {
    const entities = data.entities;

    // Filter out deleted entities before sending
    const filteredData = {
      ...data,
      entities: entities.filter((_, index) => !deletedIndicesRef.current.has(index)),
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
    console.log('Validation errors:', errors);

    // Clear errors for deleted entities
    if (errors.entities) {
      deletedIndicesRef.current.forEach((index) => {
        form.clearErrors(`entities.${index}` as any);
      });
    }

    showMessage('please fill in all required fields', 'error');

    if (errors.entities) {
      const firstErrorIndex = errors.entities.findIndex(
        (entity: any, index: number) =>
          entity !== undefined && !deletedIndicesRef.current.has(index),
      );
      if (firstErrorIndex >= 0 && entityRefs.current[firstErrorIndex]) {
        entityRefs.current[firstErrorIndex]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit, onError)}
        className='flex flex-col gap-y-16  '
      >
        <NavFeatured hero={heroData?.hero} />
        <SelectHeroType
          append={append}
          insert={insert}
          form={form}
          entityRefs={entityRefs}
          deletedIndicesRef={deletedIndicesRef}
        />
        <Entities
          entityRefs={entityRefs}
          arrayHelpers={{ remove, move, insert }}
          initialProducts={productsByEntityIndexRef.current}
          deletedIndicesRef={deletedIndicesRef}
          onDeletedIndicesChange={handleDeletedIndicesChange}
        />
        <Button
          size='lg'
          variant='main'
          type='submit'
          disabled={form.formState.isSubmitting || saveHero.isPending}
          className='fixed bottom-3 right-3 z-50 cursor-pointer uppercase'
        >
          save
        </Button>
      </form>
    </Form>
  );
}
