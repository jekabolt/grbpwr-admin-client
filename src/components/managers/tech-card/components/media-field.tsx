import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { techCardMediaKindOptions } from 'constants/filter';
import { isVideo } from 'lib/features/filterContentType';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { TechCardFormData } from './schema';

// Technical sketch media. Each item carries a `kind` + `caption`; the form only stores
// { mediaId, kind, caption }. The resolved MediaFull map (for thumbnails) is owned by
// the parent SketchTab and shared with the callout canvas.
export function MediaField({
  mediaById,
  onPickedMedia,
}: {
  mediaById: Map<number, common_MediaFull>;
  onPickedMedia: (items: common_MediaFull[]) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'media' });
  const selectedIds = fields.map((f) => f.mediaId);

  function handleAdd(items: common_MediaFull[]) {
    const fresh = items.filter((it) => it.id != null && !selectedIds.includes(it.id));
    if (!fresh.length) return;
    onPickedMedia(fresh);
    for (const it of fresh) {
      append({ mediaId: it.id as number, kind: 'TECH_CARD_MEDIA_KIND_FRONT' });
    }
  }

  return (
    <div className='space-y-3'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no sketches
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
                  className='relative overflow-hidden border border-textColor'
                  style={{ aspectRatio: '3/4' }}
                >
                  <Media
                    type={video ? 'video' : 'image'}
                    src={url}
                    alt={full?.media?.blurhash || ''}
                    fit='cover'
                    controls={video}
                    aspectRatio='auto'
                  />
                  <span className='absolute left-1 top-1 z-20 bg-textColor px-1.5 py-0.5'>
                    <Text className='!text-bgColor' size='small' variant='uppercase'>
                      {index + 1}
                    </Text>
                  </span>
                  <Button
                    type='button'
                    aria-label='remove sketch'
                    onClick={() => remove(index)}
                    className='absolute right-1 top-1 z-20 border border-textColor bg-bgColor px-1 leading-none'
                  >
                    [x]
                  </Button>
                </div>
                <SelectField
                  name={`media.${index}.kind`}
                  label='kind'
                  items={techCardMediaKindOptions}
                />
                <InputField name={`media.${index}.caption`} label='caption' />
              </div>
            );
          })}
        </div>
      )}

      <MediaSelector
        label='add sketch'
        purpose='tech sketch'
        aspectRatio={['Custom']}
        allowMultiple
        showVideos
        saveSelectedMedia={handleAdd}
        triggerClassName='uppercase px-3 py-1.5'
      />
    </div>
  );
}
