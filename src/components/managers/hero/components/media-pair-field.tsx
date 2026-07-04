import { common_MediaFull } from 'api/proto-http/admin';
import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import { MediaPreviewWithSelector } from '../../media/components/media-preview-with-selector';
import { MediaModifierToggles } from './media-modifier-toggles';

interface MediaPairFieldProps {
  /** RHF path prefix for the slot, e.g. `entities.3.statement`. */
  prefix: string;
  landscapeUrl: string;
  portraitUrl: string;
  landscapeRatio?: string[];
  portraitRatio?: string[];
  /** Slot labels (default "landscape" / "portrait"). */
  landscapeLabel?: string;
  portraitLabel?: string;
  /** Append "(optional)" to the slot labels. */
  optional?: boolean;
}

/**
 * A portrait + landscape media pair for the v2 hero blocks whose media is a
 * HeroMedia (mapped through the form's flat media{Landscape,Portrait}{Id,Url}
 * fields). Writes the id + thumbnail url straight to the form; the id feeds the
 * insert mapper, the url feeds the live preview.
 */
export function MediaPairField({
  prefix,
  landscapeUrl,
  portraitUrl,
  landscapeRatio = ['2:1'],
  portraitRatio = ['9:16'],
  landscapeLabel = 'landscape',
  portraitLabel = 'portrait',
  optional,
}: MediaPairFieldProps) {
  const { setValue } = useFormContext();

  const save = (orientation: 'Landscape' | 'Portrait', media: common_MediaFull[]) => {
    if (!media.length) return;
    setValue(`${prefix}.media${orientation}Id` as any, media[0].id, {
      shouldDirty: true,
      shouldTouch: true,
    });
    setValue(`${prefix}.media${orientation}Url` as any, media[0].media?.thumbnail?.mediaUrl || '', {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const clear = (orientation: 'Landscape' | 'Portrait') => {
    setValue(`${prefix}.media${orientation}Id` as any, undefined, {
      shouldDirty: true,
      shouldTouch: true,
    });
    setValue(`${prefix}.media${orientation}Url` as any, '', {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const suffix = optional ? ' (optional)' : '';

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start'>
        <div className='w-full space-y-1 sm:w-auto'>
          <Text variant='label' size='small'>
            {landscapeLabel}
            {suffix}
          </Text>
          <MediaPreviewWithSelector
            mediaUrl={landscapeUrl}
            aspectRatio={landscapeRatio}
            allowMultiple={false}
            showVideos={true}
            alt='landscape'
            label='select'
            purpose='landscape'
            heightClass='h-44'
            onSaveMedia={(media) => save('Landscape', media)}
            onClear={() => clear('Landscape')}
          />
        </div>
        <div className='w-full space-y-1 sm:w-auto'>
          <Text variant='label' size='small'>
            {portraitLabel}
            {suffix}
          </Text>
          <MediaPreviewWithSelector
            mediaUrl={portraitUrl}
            aspectRatio={portraitRatio}
            allowMultiple={false}
            showVideos={true}
            alt='portrait'
            label='select'
            purpose='portrait'
            heightClass='h-44'
            onSaveMedia={(media) => save('Portrait', media)}
            onClear={() => clear('Portrait')}
          />
        </div>
      </div>
      <MediaModifierToggles prefix={prefix} />
    </div>
  );
}
