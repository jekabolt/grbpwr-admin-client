import { SingleMediaViewAndSelect } from 'components/managers/media/media-selector/components/singleMediaViewAndSelect';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { TranslationField } from 'ui/form/fields/translation-field';
import { Props } from '../entities/interface/interface';
import { HeroSchema } from './schema';

export function CommonEntity({
  title,
  prefix,
  portraitLink,
  landscapeLink,
  size,
  aspectRatio,
  isDoubleAd = false,
  onSaveMedia,
}: Props) {
  const { register } = useFormContext<HeroSchema>();
  const [orientation, setOrientation] = useState<'Portrait' | 'Landscape'>('Landscape');

  const handleOrientationChange = (newOrientation: 'Portrait' | 'Landscape') => {
    setOrientation(newOrientation);
  };

  const handleMediaSave = (selectedMedia: any[]) => {
    if (isDoubleAd) {
      onSaveMedia(selectedMedia, 'Portrait');
      onSaveMedia(selectedMedia, 'Landscape');
    } else {
      onSaveMedia(selectedMedia, orientation);
    }
  };

  const currentMediaUrl = orientation === 'Portrait' ? portraitLink : landscapeLink;

  const getCurrentAspectRatio = () => {
    if (Array.isArray(aspectRatio)) {
      return aspectRatio;
    }
    return orientation === 'Portrait' ? aspectRatio.Portrait : aspectRatio.Landscape;
  };

  return (
    <div className='space-y-4'>
      <div>
        <Text className='text-xl font-bold uppercase'>{title}</Text>
      </div>
      <div>
        {!isDoubleAd && (
          <div className='mb-4 flex gap-2'>
            <Button
              type='button'
              variant={orientation === 'Landscape' ? 'default' : 'underline'}
              onClick={() => handleOrientationChange('Landscape')}
            >
              Landscape
            </Button>
            <Button
              type='button'
              variant={orientation === 'Portrait' ? 'default' : 'underline'}
              onClick={() => handleOrientationChange('Portrait')}
            >
              Portrait
            </Button>
          </div>
        )}
        <SingleMediaViewAndSelect
          link={currentMediaUrl}
          aspectRatio={getCurrentAspectRatio()}
          isDeleteAccepted={false}
          saveSelectedMedia={handleMediaSave}
          isEditMode
        />
        <div className='mt-4 space-y-4'>
          <InputField
            name={`${prefix}.exploreLink` as any}
            label='Explore Link'
            placeholder='Enter explore link'
          />

          <div className='space-y-4'>
            <Text className='text-lg font-semibold'>Translations</Text>
            <TranslationField
              label='Headline'
              fieldPrefix={`${prefix}.translations`}
              fieldName='headline'
            />
            <TranslationField
              label='Explore Text'
              fieldPrefix={`${prefix}.translations`}
              fieldName='exploreText'
            />
            <TranslationField label='Tag' fieldPrefix={`${prefix}.translations`} fieldName='tag' />
            <TranslationField
              label='Description'
              fieldPrefix={`${prefix}.translations`}
              fieldName='description'
            />
          </div>
        </div>
      </div>
    </div>
  );
}
