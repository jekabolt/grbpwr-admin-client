import { common_MediaFull, common_TechCardMediaKind } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { techCardMediaKindOptions } from 'constants/filter';
import { isVideo } from 'lib/features/filterContentType';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { MediaViewer, mediaFullToViewerItem, useMediaViewer } from 'ui/components/media-viewer';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { TechCardFormData } from './schema';

// Kinds that make sense for each list (both draw from the same enum; the split just
// filters which options are offered).
const TECHNICAL_KINDS: common_TechCardMediaKind[] = [
  'TECH_CARD_MEDIA_KIND_FRONT',
  'TECH_CARD_MEDIA_KIND_BACK',
  'TECH_CARD_MEDIA_KIND_DETAIL',
  'TECH_CARD_MEDIA_KIND_LINING',
  'TECH_CARD_MEDIA_KIND_PREVIEW',
];
const MOODBOARD_KINDS: common_TechCardMediaKind[] = [
  'TECH_CARD_MEDIA_KIND_MOODBOARD',
  'TECH_CARD_MEDIA_KIND_REFERENCE',
  'TECH_CARD_MEDIA_KIND_SWATCH',
];

type MediaListName = 'moodboardMedia' | 'technicalMedia';

// One sketch-media list (moodboard or technical). Each item carries a `kind` + `caption`;
// the form only stores { mediaId, kind, caption }. The resolved MediaFull map (for
// thumbnails) is owned by the parent SketchTab and shared with the callout canvas.
export function MediaField({
  name,
  mediaById,
  onPickedMedia,
}: {
  name: MediaListName;
  mediaById: Map<number, common_MediaFull>;
  onPickedMedia: (items: common_MediaFull[]) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name });
  const isMoodboard = name === 'moodboardMedia';
  const kinds = isMoodboard ? MOODBOARD_KINDS : TECHNICAL_KINDS;
  const kindOptions = techCardMediaKindOptions.filter((o) => kinds.includes(o.value));
  const defaultKind: common_TechCardMediaKind = kinds[0];
  const emptyLabel = isMoodboard ? 'no moodboard images' : 'no sketches';
  const addLabel = isMoodboard ? 'add moodboard image' : 'add sketch';
  const purpose = isMoodboard ? 'moodboard reference' : 'tech sketch';
  const selectedIds = fields.map((f) => f.mediaId);
  const viewer = useMediaViewer();
  const viewerItems = fields.map((f) => {
    const full = mediaById.get(f.mediaId);
    return full ? mediaFullToViewerItem(full) : { src: '' };
  });

  function handleAdd(items: common_MediaFull[]) {
    const fresh = items.filter((it) => it.id != null && !selectedIds.includes(it.id));
    if (!fresh.length) return;
    onPickedMedia(fresh);
    for (const it of fresh) {
      append({ mediaId: it.id as number, kind: defaultKind });
    }
  }

  return (
    <div className='space-y-3'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          {emptyLabel}
        </Text>
      ) : (
        <div className='grid grid-cols-2 gap-3 md:grid-cols-3'>
          {fields.map((f, index) => {
            const full = mediaById.get(f.mediaId);
            const url = full?.media?.thumbnail?.mediaUrl || full?.media?.fullSize?.mediaUrl || '';
            const video = isVideo(full?.media?.fullSize?.mediaUrl) || isVideo(url);
            return (
              <div key={f.id} className='space-y-2 border border-textInactiveColor p-2'>
                <div
                  className='relative overflow-hidden border border-textInactiveColor'
                  style={{ aspectRatio: '3/4' }}
                >
                  <Media
                    type={video ? 'video' : 'image'}
                    src={url}
                    alt={full?.media?.blurhash || ''}
                    fit='cover'
                    aspectRatio='auto'
                  />
                  <button
                    type='button'
                    aria-label={`View sketch ${index + 1}`}
                    onClick={() => viewer.openAt(index)}
                    className='absolute inset-0 z-10 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                  />
                  <span className='pointer-events-none absolute left-1 top-1 z-20 bg-textColor px-1.5 py-0.5'>
                    <Text className='!text-bgColor' size='small' variant='uppercase'>
                      {index + 1}
                    </Text>
                  </span>
                  <Button
                    type='button'
                    aria-label='remove sketch'
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      remove(index);
                    }}
                    className='absolute right-1 top-1 z-20 border border-textInactiveColor bg-bgColor px-1 leading-none'
                  >
                    [x]
                  </Button>
                </div>
                <SelectField name={`${name}.${index}.kind`} label='kind' items={kindOptions} />
                <InputField name={`${name}.${index}.caption`} label='caption' />
              </div>
            );
          })}
        </div>
      )}

      <MediaSelector
        label={addLabel}
        purpose={purpose}
        aspectRatio={['Custom']}
        allowMultiple
        showVideos
        saveSelectedMedia={handleAdd}
        triggerClassName='uppercase px-3 py-1.5'
      />

      <MediaViewer items={viewerItems} {...viewer} />
    </div>
  );
}
