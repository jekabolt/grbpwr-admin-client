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

  const form = useForm<HeroSchema>({
    resolver: zodResolver(heroSchema),
    defaultValues: defaultData as HeroSchema,
  });

  useEffect(() => {
    if (heroData) {
      const formData = mapHeroFullToFormData(heroData.hero);
      form.reset(formData);
    }
  }, [heroData, form]);

  const { append, remove, move, insert } = useFieldArray({
    control: form.control,
    name: 'entities',
  });

  async function onSubmit(data: HeroSchema) {
    const heroData = mapFormFieldsToHeroData(data);
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
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <NavFeatured hero={heroData?.hero} />

          <SelectHeroType append={append} insert={insert} form={form} />

          <Entities entityRefs={entityRefs} arrayHelpers={{ remove, move, insert }} />

          <Button size='lg' type='submit'>
            Save
          </Button>
        </form>
      </Form>
    </Layout>
  );
}
