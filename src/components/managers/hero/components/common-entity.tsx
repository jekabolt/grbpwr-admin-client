import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { MediaPreviewWithSelector } from '../../media/components/media-preview-with-selector';
import { Props } from '../utility/interface';

const TRANSLATION_CONFIGS = {
  main: [
    { name: 'headline', label: 'headline', type: 'input' as const },
    { name: 'tag', label: 'tag', type: 'input' as const, required: false },
    {
      name: 'description',
      label: 'description',
      type: 'textarea' as const,
      rows: 3,
      maxLength: 138,
    },
    { name: 'exploreText', label: 'explore text', type: 'input' as const },
  ],
  single: [
    {
      name: 'headline',
      label: 'headline',
      type: 'input' as const,
      required: false,
      maxLength: 117,
    },
    { name: 'exploreText', label: 'explore text', type: 'input' as const, maxLength: 39 },
  ],
  double: [
    { name: 'headline', label: 'headline', type: 'input' as const, required: false, maxLength: 39 },
    { name: 'exploreText', label: 'explore text', type: 'input' as const, maxLength: 39 },
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
  onClearMedia,
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

  const getTranslationFields = () => {
    if (prefix.includes('.main')) return TRANSLATION_CONFIGS.main;
    if (prefix.includes('.single')) return TRANSLATION_CONFIGS.single;
    if (prefix.includes('.double')) return TRANSLATION_CONFIGS.double;
    return TRANSLATION_CONFIGS.single;
  };

  return (
    <div className='p-3 lg:p-4 space-y-5'>
      {title && (
        <Text className='font-bold leading-none' variant='uppercase' size='large'>
          {title}
        </Text>
      )}

      {/* Media row — both previews share one height, widths derive from their ratio */}
      {!isDoubleAd ? (
        <div className='flex flex-col gap-4 sm:flex-row sm:items-start'>
          <div className='w-full space-y-1 sm:w-auto'>
            <Text variant='label' size='small'>
              landscape
            </Text>
            <MediaPreviewWithSelector
              mediaUrl={landscapeLink}
              aspectRatio={getAspectRatioFor('Landscape')}
              allowMultiple={false}
              showVideos={true}
              alt='Landscape preview'
              label='select'
              purpose='landscape'
              heightClass='sm:h-44'
              onSaveMedia={(media) => onSaveMedia(media, 'Landscape')}
              onClear={onClearMedia ? () => onClearMedia('Landscape') : undefined}
            />
          </div>
          <div className='w-full space-y-1 sm:w-auto'>
            <Text variant='label' size='small'>
              portrait
            </Text>
            <MediaPreviewWithSelector
              mediaUrl={portraitLink}
              aspectRatio={getAspectRatioFor('Portrait')}
              allowMultiple={false}
              showVideos={true}
              alt='Portrait preview'
              label='select'
              purpose='portrait'
              heightClass='sm:h-44'
              onSaveMedia={(media) => onSaveMedia(media, 'Portrait')}
              onClear={onClearMedia ? () => onClearMedia('Portrait') : undefined}
            />
          </div>
        </div>
      ) : (
        <div className='w-full space-y-1 sm:w-auto'>
          <Text variant='label' size='small'>
            media
          </Text>
          <MediaPreviewWithSelector
            mediaUrl={landscapeLink || portraitLink}
            aspectRatio={['1:1']}
            allowMultiple={false}
            showVideos={true}
            alt='Media preview'
            label='select'
            purpose='media'
            heightClass='sm:h-44'
            onSaveMedia={(media) => {
              onSaveMedia(media, 'Landscape');
              onSaveMedia(media, 'Portrait');
            }}
            onClear={
              onClearMedia
                ? () => {
                    onClearMedia('Landscape');
                    onClearMedia('Portrait');
                  }
                : undefined
            }
          />
        </div>
      )}

      {/* Text + translations — full width below the media */}
      <div className='space-y-4'>
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
  );
}
