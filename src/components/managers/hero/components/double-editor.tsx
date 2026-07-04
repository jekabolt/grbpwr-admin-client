import { common_MediaFull } from 'api/proto-http/admin';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { MediaPreviewWithSelector } from '../../media/components/media-preview-with-selector';
import { LinkField } from './link-field';
import { MediaModifierToggles } from './media-modifier-toggles';

const DOUBLE_TRANSLATION_FIELDS = [
  { name: 'headline', label: 'headline', type: 'input' as const, required: false, maxLength: 39 },
  {
    name: 'exploreText',
    label: 'explore text',
    type: 'input' as const,
    required: false,
    maxLength: 39,
  },
];

// One half of a double ad. A double ad is a single square image per side; store
// it in both the landscape and portrait slots so the existing HeroMedia mapping
// works unchanged.
function DoubleHalf({ side, prefix }: { side: 'left' | 'right'; prefix: string }) {
  const { control, setValue } = useFormContext();
  const mediaUrl = (useWatch({ control, name: `${prefix}.mediaLandscapeUrl` }) as string) || '';

  const save = (media: common_MediaFull[]) => {
    if (!media.length) return;
    const id = media[0].id;
    const thumb = media[0].media?.thumbnail?.mediaUrl || '';
    (['Landscape', 'Portrait'] as const).forEach((o) => {
      setValue(`${prefix}.media${o}Id`, id, { shouldDirty: true, shouldTouch: true });
      setValue(`${prefix}.media${o}Url`, thumb, { shouldDirty: true, shouldTouch: true });
    });
  };

  const clear = () => {
    (['Landscape', 'Portrait'] as const).forEach((o) => {
      setValue(`${prefix}.media${o}Id`, undefined, { shouldDirty: true, shouldTouch: true });
      setValue(`${prefix}.media${o}Url`, '', { shouldDirty: true, shouldTouch: true });
    });
  };

  return (
    <div className='space-y-4 border border-textInactiveColor p-3'>
      <Text variant='uppercase' size='small' className='font-bold'>
        {side}
      </Text>

      <div className='space-y-1'>
        <Text variant='label' size='small'>
          square image (1:1)
        </Text>
        <MediaPreviewWithSelector
          mediaUrl={mediaUrl}
          aspectRatio={['1:1']}
          allowMultiple={false}
          showVideos={true}
          alt={`${side} media`}
          label='select'
          purpose={side}
          heightClass='h-44'
          onSaveMedia={save}
          onClear={clear}
        />
      </div>

      <MediaModifierToggles prefix={prefix} />
      <LinkField name={`${prefix}.exploreLink`} label='explore link (optional)' />
      <UnifiedTranslationFields
        fieldPrefix={`${prefix}.translations`}
        fields={DOUBLE_TRANSLATION_FIELDS}
        editMode
      />
    </div>
  );
}

/**
 * Editor for a DOUBLE block: two square ads shown side by side on the storefront.
 * Purpose-built (replaces the CommonEntity `isDoubleAd` reuse) so the pairing and
 * the single-square-image-per-side model are obvious.
 */
export function DoubleEditor({ index }: { index: number }) {
  return (
    <div className='space-y-5 p-3 lg:p-4'>
      <div className='space-y-1'>
        <Text className='font-bold leading-none' variant='uppercase' size='large'>
          double
        </Text>
        <Text variant='label' size='small'>
          two square blocks shown side by side on the storefront — fill in both.
        </Text>
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <DoubleHalf side='left' prefix={`entities.${index}.double.left`} />
        <DoubleHalf side='right' prefix={`entities.${index}.double.right`} />
      </div>
    </div>
  );
}
