import { common_HeroEntityInsert, common_HeroType } from 'api/proto-http/admin';
import { v4 as uuidv4 } from 'uuid';
import { heroTypes } from 'constants/constants';
import { cn } from 'lib/utility';
import React, { FC, useEffect, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import Text from 'ui/components/text';
import { validationForSelectHeroType } from '../utility/validationForSelectHeroType';
import { HeroSchema } from './schema';

interface SelectHeroTypeProps {
  append: (value: any) => void;
  insert: (index: number, value: any) => void;
  form: UseFormReturn<HeroSchema>;
  entityRefs: React.MutableRefObject<{ [uid: string]: HTMLDivElement | null }>;
  deletedIndicesRef: React.MutableRefObject<Set<string>>;
}

const HERO_TYPE_DESCRIPTIONS: Record<string, string> = {
  HERO_TYPE_MAIN: 'Full-width hero — landscape + portrait media, headline & description',
  HERO_TYPE_SINGLE: 'Single media block with headline and explore link',
  HERO_TYPE_DOUBLE: 'Two square media blocks side by side',
  HERO_TYPE_FEATURED_PRODUCTS: 'Hand-picked products with a headline',
  HERO_TYPE_FEATURED_PRODUCTS_TAG: 'Products auto-filled by a tag',
};

export const SelectHeroType: FC<SelectHeroTypeProps> = ({
  append,
  insert,
  form,
  entityRefs,
  deletedIndicesRef,
}) => {
  const [addedEntityUid, setAddedEntityUid] = useState<string | null>(null);

  const entities = form.watch('entities');
  const isMainAddExists = entities?.some(
    (entity) =>
      entity.type === 'HERO_TYPE_MAIN' && !deletedIndicesRef.current.has((entity as any)._uid),
  );

  const isEntityIncomplete = entities?.some((entity) => {
    if (deletedIndicesRef.current.has((entity as any)._uid)) return false;

    const validateEntity = validationForSelectHeroType[entity.type as common_HeroType];
    return validateEntity ? validateEntity(entity as common_HeroEntityInsert) : false;
  });

  const addEntity = (type: common_HeroType) => {
    if (type === 'HERO_TYPE_MAIN' && isMainAddExists) return;
    if (isEntityIncomplete) return;

    const newEntity = { type, _uid: uuidv4() };
    if (type === 'HERO_TYPE_MAIN') {
      insert(0, newEntity);
    } else {
      append(newEntity);
    }
    setAddedEntityUid(newEntity._uid);
  };

  useEffect(() => {
    if (addedEntityUid !== null) {
      setTimeout(() => {
        const element = entityRefs.current[addedEntityUid];
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        setAddedEntityUid(null);
      }, 100);
    }
  }, [entities?.length, addedEntityUid, entityRefs]);

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap items-baseline justify-between gap-2'>
        <Text variant='uppercase' size='large'>
          add a block
        </Text>
        {isEntityIncomplete && (
          <Text variant='inactive' size='small'>
            finish the current block before adding another
          </Text>
        )}
      </div>

      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
        {heroTypes.map((type) => {
          const mainTaken = type.value === 'HERO_TYPE_MAIN' && isMainAddExists;
          const disabled = mainTaken || isEntityIncomplete;
          return (
            <button
              key={type.value}
              type='button'
              disabled={disabled}
              onClick={() => addEntity(type.value)}
              className={cn(
                'group flex h-full flex-col items-start gap-1 border border-textColor p-3 text-left transition-colors',
                'hover:bg-textColor hover:text-bgColor',
                'disabled:cursor-not-allowed disabled:border-textInactiveColor disabled:bg-bgColor disabled:text-textInactiveColor',
              )}
            >
              <div className='flex w-full items-center justify-between'>
                <Text variant='uppercase' className='group-hover:text-bgColor group-disabled:text-textInactiveColor'>
                  {type.label}
                </Text>
                <span className='text-lg leading-none'>+</span>
              </div>
              <span className='text-small leading-tight'>
                {mainTaken ? 'already added (only one allowed)' : HERO_TYPE_DESCRIPTIONS[type.value]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
