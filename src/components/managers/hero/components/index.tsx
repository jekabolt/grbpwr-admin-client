import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef } from 'react';
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
  const entityRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const productsByEntityIndexRef = useRef<Record<number, any[]>>({});
  const deletedIndicesRef = useRef<Set<number>>(new Set());

  const form = useForm<HeroSchema>({
    resolver: zodResolver(heroSchema),
    defaultValues: defaultData as HeroSchema,
  });

  useEffect(() => {
    if (heroData) {
      const mappedData = mapHeroFullToFormData(heroData.hero);
      productsByEntityIndexRef.current = mappedData.productsByEntityIndex || {};
      form.reset(mappedData);
      // Clear deleted indices when form is reset
      deletedIndicesRef.current.clear();
    }
  }, [heroData, form]);

  const { append, remove, move, insert } = useFieldArray({
    control: form.control,
    name: 'entities',
  });

  async function onSubmit(data: HeroSchema) {
    const filteredData = {
      ...data,
      entities: data.entities.filter((_, index) => !deletedIndicesRef.current.has(index)),
    };
    const heroData = mapFormFieldsToHeroData(filteredData);
    console.log('Mapped hero data:', heroData);
    try {
      await saveHero.mutateAsync(heroData);
      console.log('Hero saved successfully!');
    } catch (e) {
      console.log('Error saving hero:', e);
    }
  }

  if (isLoading) {
    return (
      <Layout>
        <div className='flex items-center justify-center h-64'>
          <div className='text-lg'>Loading hero data...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className='flex flex-col gap-y-16 lg:pt-24 pt-5 lg:px-12 px-2.5'
        >
          <NavFeatured hero={heroData?.hero} />
          <SelectHeroType append={append} insert={insert} form={form} />
          <Entities
            entityRefs={entityRefs}
            arrayHelpers={{ remove, move, insert }}
            initialProducts={productsByEntityIndexRef.current}
            deletedIndicesRef={deletedIndicesRef}
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
