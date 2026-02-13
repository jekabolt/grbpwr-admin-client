import { common_HeroEntityInsert, common_HeroType } from 'api/proto-http/admin';
import { heroTypes } from 'constants/constants';
import React, { FC, useEffect, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Button } from 'ui/components/button';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { validationForSelectHeroType } from '../utility/validationForSelectHeroType';
import { HeroSchema } from './schema';

interface SelectHeroTypeProps {
  append: (value: any) => void;
  insert: (index: number, value: any) => void;
  form: UseFormReturn<HeroSchema>;
  entityRefs: React.MutableRefObject<{ [key: number]: HTMLDivElement | null }>;
  deletedIndicesRef: React.MutableRefObject<Set<number>>;
}

export const SelectHeroType: FC<SelectHeroTypeProps> = ({
  append,
  insert,
  form,
  entityRefs,
  deletedIndicesRef,
}) => {
  const [entityType, setEntityType] = useState<string>('');
  const [addedEntityIndex, setAddedEntityIndex] = useState<number | null>(null);

  const entities = form.watch('entities');
  const isMainAddExists = entities?.some(
    (entity, index) => entity.type === 'HERO_TYPE_MAIN' && !deletedIndicesRef.current.has(index),
  );

  const isEntityIncomplete = entities?.some((entity, index) => {
    if (deletedIndicesRef.current.has(index)) return false;

    const validateEntity = validationForSelectHeroType[entity.type as common_HeroType];
    return validateEntity ? validateEntity(entity as common_HeroEntityInsert) : false;
  });

  const handleAddEntity = () => {
    if (entityType === 'HERO_TYPE_MAIN' && isMainAddExists) {
      return;
    }
    const newEntity = { type: entityType as common_HeroType };
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
      setTimeout(() => {
        const element = entityRefs.current[addedEntityIndex];
        if (element) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }
        setAddedEntityIndex(null);
      }, 100);
    }
  }, [entities?.length, addedEntityIndex, entityRefs]);

  return (
    <div className='flex gap-4 items-end justify-between'>
      <Text variant='uppercase' size='large'>
        hero entities
      </Text>
      <div className='border border-2 border-text flex items-center gap-2 p-2'>
        <div>
          <SelectComponent
            name='entityType'
            placeholder='SELECT ENTITY TYPE'
            className='border border-none'
            customWidth={250}
            value={entityType}
            onValueChange={setEntityType}
            items={heroTypes
              .filter((type) => {
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

        <Button
          variant='main'
          onClick={handleAddEntity}
          disabled={!entityType || isEntityIncomplete}
          className='px-2 py-1'
        >
          +
        </Button>
      </div>
    </div>
  );
};
