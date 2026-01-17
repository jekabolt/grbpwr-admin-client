import { SingleMediaViewAndSelect } from 'components/managers/media/media-selector/components/singleMediaViewAndSelect';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { Props } from '../entities/interface/interface';

const TRANSLATION_CONFIGS = {
  main: [
    { name: 'headline', label: 'headline', type: 'input' as const },
    { name: 'tag', label: 'tag', type: 'input' as const },
    { name: 'description', label: 'description', type: 'textarea' as const, rows: 3 },
    { name: 'exploreText', label: 'explore text', type: 'input' as const },
  ],
  single: [
    { name: 'headline', label: 'headline', type: 'input' as const },
    { name: 'exploreText', label: 'explore text', type: 'input' as const },
  ],
  double: [
    { name: 'headline', label: 'headline', type: 'input' as const },
    { name: 'exploreText', label: 'explore text', type: 'input' as const },
  ],
};

const ORIENTATIONS = ['Landscape', 'Portrait'] as const;

export function CommonEntity({
  title,
  prefix,
  portraitLink,
  landscapeLink,
  aspectRatio,
  isDoubleAd = false,
  onSaveMedia,
}: Props) {
  const [orientation, setOrientation] = useState<'Landscape' | 'Portrait'>('Landscape');

  const currentMediaUrl = orientation === 'Portrait' ? portraitLink : landscapeLink;

  const handleSaveMedia = (selectedMedia: any[]) => {
    if (isDoubleAd) {
      onSaveMedia(selectedMedia, 'Portrait');
      onSaveMedia(selectedMedia, 'Landscape');
    } else {
      onSaveMedia(selectedMedia, orientation);
    }
  };

  const getCurrentAspectRatio = () => {
    if (Array.isArray(aspectRatio)) {
      return aspectRatio;
    }
    return orientation === 'Portrait' ? aspectRatio.Portrait : aspectRatio.Landscape;
  };

  const getTranslationFields = () => {
    if (prefix.includes('.main')) return TRANSLATION_CONFIGS.main;
    if (prefix.includes('.single')) return TRANSLATION_CONFIGS.single;
    if (prefix.includes('.double')) return TRANSLATION_CONFIGS.double;
    return TRANSLATION_CONFIGS.single;
  };

  return (
    <div className='lg:px-2.5 lg:pb-8 p-2.5 space-y-6'>
      <div className='flex flex-col items-start justify-start gap-4'>
        {title && (
          <Text className='text-xl font-bold leading-none' variant='uppercase'>
            {title}
          </Text>
        )}
        {!title && isDoubleAd && <div className='h-5' />}
        {!isDoubleAd && (
          <div className='flex gap-2'>
            {ORIENTATIONS.map((orient) => (
              <Button
                key={orient}
                type='button'
                className='cursor-pointer p-2.5 uppercase'
                variant={orientation === orient ? 'default' : 'simpleReverse'}
                onClick={() => setOrientation(orient)}
              >
                {orient}
              </Button>
            ))}
          </div>
        )}
      </div>
      <div
        className={cn('flex flex-col', {
          'lg:flex-row flex-col lg:justify-between lg:gap-4': !isDoubleAd,
        })}
      >
        <div className='w-full h-full'>
          <SingleMediaViewAndSelect
            link={currentMediaUrl}
            aspectRatio={getCurrentAspectRatio()}
            isDeleteAccepted={false}
            saveSelectedMedia={handleSaveMedia}
            isEditMode
          />
        </div>
        <div className='space-y-4 w-full'>
          <InputField
            name={`${prefix}.exploreLink` as any}
            label='explore link'
            placeholder='Enter explore link'
          />

          <UnifiedTranslationFields
            fieldPrefix={`${prefix}.translations`}
            fields={getTranslationFields()}
            editMode={true}
          />
        </div>
      </div>
    </div>
  );
}
