import { common_MediaFull } from 'api/proto-http/admin';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { MediaPreviewWithSelector } from '../../media/components/media-preview-with-selector';
import { ArchiveFormData } from './schema';

// The url the backend would derive if the user sets no explicit thumbnail: the
// first media across media-bearing blocks (main media, media+caption, media line).
function firstBlockMediaUrl(items: any[]): string {
  for (const i of items) {
    if (i?.type === 'ARCHIVE_ITEM_TYPE_MAIN_MEDIA' && i.mediaUrl) return i.mediaUrl;
    if (i?.type === 'ARCHIVE_ITEM_TYPE_MEDIA_WITH_CAPTION' && i.mediaUrl) return i.mediaUrl;
    if (i?.type === 'ARCHIVE_ITEM_TYPE_MEDIA_LINE' && i.mediaUrls?.[0]) return i.mediaUrls[0];
  }
  return '';
}

/**
 * The timeline-list thumbnail control for the card section. The thumbnail is
 * otherwise invisible in the editor — it's derived on save from the first media
 * block. This surfaces that: it previews the effective thumbnail (explicit
 * choice, else the derived one) and lets you set a custom still or reset to auto.
 */
export function ArchiveThumbnail() {
  const { control, setValue } = useFormContext<ArchiveFormData>();
  const thumbnailId = useWatch({ control, name: 'thumbnailId' });
  const thumbnailUrl = useWatch({ control, name: 'thumbnailUrl' });
  const items = (useWatch({ control, name: 'items' }) || []) as any[];

  const explicit = thumbnailId != null;
  const derivedUrl = firstBlockMediaUrl(items);
  const effectiveUrl = explicit ? thumbnailUrl || '' : derivedUrl;

  const setExplicit = (media: common_MediaFull[]) => {
    const m = media[0];
    if (!m) return;
    setValue('thumbnailId', m.id, { shouldDirty: true, shouldTouch: true });
    setValue('thumbnailUrl', m.media?.thumbnail?.mediaUrl || '', { shouldDirty: true });
  };

  const resetToAuto = () => {
    setValue('thumbnailId', undefined, { shouldDirty: true, shouldTouch: true });
    setValue('thumbnailUrl', undefined, { shouldDirty: true });
  };

  const caption = explicit
    ? 'custom · remove to auto-pick from your first media'
    : derivedUrl
      ? 'auto · from your first media block'
      : 'auto · add a media block, or choose one';

  return (
    <div className='space-y-1'>
      <Text variant='label' size='small'>
        thumbnail
      </Text>
      <MediaPreviewWithSelector
        mediaUrl={effectiveUrl}
        aspectRatio={['4:5']}
        allowMultiple={false}
        showVideos={false}
        heightClass='h-40'
        label='choose thumbnail'
        purpose='timeline thumbnail'
        alt='timeline list thumbnail'
        onSaveMedia={setExplicit}
        onClear={explicit ? resetToAuto : undefined}
      />
      <Text variant='label' size='small'>
        {caption}
      </Text>
    </div>
  );
}
