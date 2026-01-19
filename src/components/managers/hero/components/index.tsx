import { zodResolver } from '@hookform/resolvers/zod';

import { useBlockNavigation } from 'hooks/useBlockNavigation';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Form } from 'ui/form';
import { Layout } from 'ui/layout';
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

  const form = useForm<HeroSchema>({
    resolver: zodResolver(heroSchema),
    defaultValues: defaultData as HeroSchema,
    mode: 'onChange',
  });

  const isDirty = form.formState.isDirty;
  useBlockNavigation(isDirty);

  useEffect(() => {
    if (heroData) {
      const mappedData = mapHeroFullToFormData(heroData.hero);
      productsByEntityIndexRef.current = mappedData.productsByEntityIndex || {};
      form.reset(mappedData);
      deletedIndicesRef.current.clear();
    }
  }, [heroData, form]);

  const { append, remove, move, insert } = useFieldArray({
    control: form.control,
    name: 'entities',
  });

  const handleDeletedIndicesChange = useCallback(() => {
    setDeletedIndicesVersion((v) => v + 1);
  }, []);

  async function handleSubmit() {
    const data = form.getValues();
    const entities = data.entities;

    deletedIndicesRef.current.forEach((index) => {
      form.clearErrors(`entities.${index}` as any);
    });

    const validationPromises = entities.map((_, index) => {
      if (deletedIndicesRef.current.has(index)) {
        return Promise.resolve(true);
      }
      return form.trigger(`entities.${index}` as any);
    });

    const validationResults = await Promise.all(validationPromises);
    const isValid = validationResults.every((result) => result === true);

    const navFeaturedValid = await form.trigger('navFeatured');

    if (!isValid || !navFeaturedValid) {
      onError(form.formState.errors);
      return;
    }

    const filteredData = {
      ...data,
      entities: entities.filter((_, index) => !deletedIndicesRef.current.has(index)),
    };

    const heroData = mapFormFieldsToHeroData(filteredData);
    try {
      await saveHero.mutateAsync(heroData);
      form.reset(filteredData);
      deletedIndicesRef.current.clear();
      showMessage('Hero saved successfully!', 'success');
    } catch (e) {
      showMessage('Error saving hero:', 'error');
    }
  }

  function onError(errors: any) {
    console.log('Validation errors:', errors);

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
    <Layout>
      <Form {...form}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className='flex flex-col gap-y-16 lg:pt-24 pt-5 lg:px-12 px-2.5'
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
            type='submit'
            disabled={form.formState.isSubmitting || saveHero.isPending}
            className='fixed top-3 right-3 z-50 cursor-pointer uppercase'
          >
            save
          </Button>
        </form>
      </Form>
    </Layout>
  );
}
