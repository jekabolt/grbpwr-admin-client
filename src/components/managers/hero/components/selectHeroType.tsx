import { common_HeroEntityInsert, common_HeroType } from 'api/proto-http/admin';
import { FC, useEffect, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Button } from 'ui/components/button';
import SelectComponent from 'ui/components/select';
import { heroTypes } from '../utility/mapHeroFunction';
import { validationForSelectHeroType } from '../utility/validationForSelectHeroType';
import { HeroSchema } from './schema';

interface SelectHeroTypeProps {
  append: (value: any) => void;
  insert: (index: number, value: any) => void;
  form: UseFormReturn<HeroSchema>;
}

export const SelectHeroType: FC<SelectHeroTypeProps> = ({ append, insert, form }) => {
  const [entityType, setEntityType] = useState<string>('');
  const [addedEntityIndex, setAddedEntityIndex] = useState<number | null>(null);

  const entities = form.watch('entities');

  const isOtherEntitiesExist = entities?.some((entity) => entity.type !== 'HERO_TYPE_MAIN');
  const isMainAddExists = entities?.some((entity) => entity.type === 'HERO_TYPE_MAIN');

  const isEntityIncomplete = entities?.some((entity) => {
    const validateEntity = validationForSelectHeroType[entity.type as common_HeroType];
    return validateEntity ? validateEntity(entity as common_HeroEntityInsert) : false;
  });

  const handleAddEntity = () => {
    if (entityType === 'HERO_TYPE_MAIN' && isMainAddExists) {
      return;
    }

    const newEntity = { type: entityType as common_HeroType };

    // If it's a main entity, insert it at the top (index 0)
    // Otherwise, append it to the end
    if (entityType === 'HERO_TYPE_MAIN') {
      insert(0, newEntity);
      setAddedEntityIndex(0);
    } else {
      append(newEntity);
      setAddedEntityIndex(entities ? entities.length : 0);
    }
  };

  useEffect(() => {
    if (addedEntityIndex !== null) {
      // Scroll to the newly added entity
      const element = document.getElementById(`entity-${addedEntityIndex}`);
      element?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entities?.length, addedEntityIndex]);

  return (
    <div className='flex gap-4 items-end'>
      <div>
        <SelectComponent
          name='entityType'
          placeholder='SELECT ENTITY TYPE'
          customWidth={250}
          value={entityType}
          onValueChange={setEntityType}
          items={heroTypes
            .filter((type) => {
              // Only hide main type if it already exists
              if (type.value === 'HERO_TYPE_MAIN' && isMainAddExists) {
                return false;
              }
              return true;
            })
            .map((type) => ({
              value: type.value,
              label: type.label.toUpperCase(),
            }))}
        />
      </div>

      <Button size='lg' onClick={handleAddEntity} disabled={!entityType || isEntityIncomplete}>
        +
      </Button>
    </div>
  );
};
