import { SingleMediaViewAndSelect } from 'components/managers/media/media-selector/components/singleMediaViewAndSelect';
import { cn } from 'lib/utility';
import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { Props } from '../utility/interface';

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

export function CommonEntity({
  title,
  prefix,
  portraitLink,
  landscapeLink,
  aspectRatio,
  isDoubleAd = false,
  onSaveMedia,
}: Props) {
  const {
    formState: { errors },
  } = useFormContext();

  const getAspectRatioFor = (orientation: 'Portrait' | 'Landscape') => {
    if (Array.isArray(aspectRatio)) {
      return aspectRatio;
    }
    return aspectRatio[orientation];
  };

  const getAspectOnPreview = (orientation: 'Portrait' | 'Landscape') => {
    const ratios = getAspectRatioFor(orientation);
    const ratio = ratios[0];
    // Convert '2:1' to '2/1' for CSS aspect-ratio compatibility
    return ratio?.replace(':', '/') || '4/5';
  };

  const getTranslationFields = () => {
    if (prefix.includes('.main')) return TRANSLATION_CONFIGS.main;
    if (prefix.includes('.single')) return TRANSLATION_CONFIGS.single;
    if (prefix.includes('.double')) return TRANSLATION_CONFIGS.double;
    return TRANSLATION_CONFIGS.single;
  };

  const getFieldError = (fieldPath: string) => {
    const pathParts = fieldPath.split('.');
    let error: any = errors;

    for (const part of pathParts) {
      if (!error) return null;
      error = error[part];
    }

    return error?.message;
  };

  return (
    <div className='lg:px-2.5 lg:pb-8 p-2.5 space-y-6'>
      <div className='flex flex-col items-start justify-start gap-4'>
        {title && (
          <Text className='text-xl font-bold leading-none' variant='uppercase'>
            {title}
          </Text>
        )}
      </div>
      <div className='flex lg:flex-row flex-col lg:gap-4'>
        <div
          className={cn('w-full h-full flex flex-col gap-4', {
            'lg:w-1/3': isDoubleAd,
          })}
        >
          {!isDoubleAd ? (
            <div className='flex flex-col gap-4'>
              <div className='w-full space-y-2'>
                <Text className='text-sm font-bold leading-none' variant='uppercase'>
                  landscape
                </Text>
                <SingleMediaViewAndSelect
                  link={landscapeLink}
                  aspectRatio={getAspectRatioFor('Landscape')}
                  aspectOnPreview={getAspectOnPreview('Landscape')}
                  isDeleteAccepted={false}
                  saveSelectedMedia={(media) => onSaveMedia(media, 'Landscape')}
                  error={getFieldError(`${prefix}.mediaLandscapeId`)}
                  isEditMode
                />
              </div>
              <div className='lg:w-1/2 w-full space-y-2'>
                <Text className='text-sm font-bold leading-none' variant='uppercase'>
                  portrait
                </Text>
                <SingleMediaViewAndSelect
                  link={portraitLink}
                  aspectRatio={getAspectRatioFor('Portrait')}
                  aspectOnPreview={getAspectOnPreview('Portrait')}
                  isDeleteAccepted={false}
                  saveSelectedMedia={(media) => onSaveMedia(media, 'Portrait')}
                  error={getFieldError(`${prefix}.mediaPortraitId`)}
                  isEditMode
                />
              </div>
            </div>
          ) : (
            <div className='w-full'>
              <SingleMediaViewAndSelect
                link={landscapeLink}
                aspectRatio={['1:1']}
                aspectOnPreview='1/1'
                isDeleteAccepted={false}
                saveSelectedMedia={(media) => {
                  onSaveMedia(media, 'Landscape');
                  onSaveMedia(media, 'Portrait');
                }}
                error={
                  getFieldError(`${prefix}.mediaLandscapeId`) ||
                  getFieldError(`${prefix}.mediaPortraitId`)
                }
                isEditMode
              />
            </div>
          )}
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
