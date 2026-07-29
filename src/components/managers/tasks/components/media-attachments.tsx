import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { MediaViewer, useMediaViewer } from 'ui/components/media-viewer';
import Text from 'ui/components/text';
import { rememberMedia, resolveMedia } from '../api/tasksService';

// Attach reference images/files from the existing media bucket. Stores media ids
// on the task; the MediaSelector (same one tech cards use) handles the gallery.
// The first attachment also becomes the card cover (tskCard v3).
export function MediaAttachments({
  value,
  onChange,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const resolved = resolveMedia(value);
  const viewer = useMediaViewer();

  // Only ids that resolved to a url are viewable; the viewer index tracks this
  // filtered list so clicking a tile opens the matching image.
  const viewable = value
    .map((id) => resolved.find((x) => x.id === id))
    .filter((m): m is NonNullable<typeof m> => !!(m && (m.fullSize || m.thumbnail)));
  const viewerItems = viewable.map((m) => ({
    src: m.fullSize || m.thumbnail || '',
    thumbnail: m.thumbnail,
  }));

  function handleAdd(picked: common_MediaFull[]) {
    const media = picked
      .filter((m) => m.id != null)
      .map((m) => ({
        id: m.id as number,
        thumbnail: m.media?.thumbnail?.mediaUrl,
        fullSize: m.media?.fullSize?.mediaUrl,
        blurhash: m.media?.blurhash,
      }));
    rememberMedia(media);
    const next = media.map((m) => m.id).filter((id) => !value.includes(id));
    if (next.length) onChange([...value, ...next]);
  }

  return (
    <div className='flex flex-col gap-2'>
      {value.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {value.map((id) => {
            const m = resolved.find((x) => x.id === id);
            const viewIndex = viewable.indexOf(m as NonNullable<typeof m>);
            return (
              <div key={id} className='relative h-16 w-16 border border-borderColor'>
                {m?.thumbnail ? (
                  <button
                    type='button'
                    aria-label='view attachment'
                    onClick={() => viewIndex >= 0 && viewer.openAt(viewIndex)}
                    className='block h-full w-full cursor-zoom-in'
                  >
                    <img src={m.thumbnail} alt='' className='h-full w-full object-cover' />
                  </button>
                ) : (
                  <div className='flex h-full w-full items-center justify-center'>
                    <Text size='nano' variant='label' component='span'>
                      #{id}
                    </Text>
                  </div>
                )}
                <button
                  type='button'
                  aria-label='remove attachment'
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  className='absolute -right-1 -top-1 z-10 flex h-4 w-4 items-center justify-center bg-textColor text-nano leading-none text-bgColor'
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <MediaSelector
        label='+ attach media'
        purpose='attachment'
        aspectRatio={['Custom']}
        allowMultiple
        showVideos
        saveSelectedMedia={handleAdd}
        triggerClassName='self-start uppercase px-2.5 py-1 text-micro tracking-label'
      />

      <MediaViewer items={viewerItems} {...viewer} />
    </div>
  );
}
