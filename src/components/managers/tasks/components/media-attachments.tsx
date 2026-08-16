import { common_MediaFull } from 'api/proto-http/admin';
import { moveItem } from 'components/managers/media/components/gallery-order';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { Button } from 'ui/components/button';
import { MediaViewer, useMediaViewer } from 'ui/components/media-viewer';
import Text from 'ui/components/text';
import { rememberMedia, resolveMedia } from '../api/tasksService';

/** Та же кнопка-глиф, что в подвале плитки галереи: 16 пикселей, серая, чёрная под курсором. */
const ARROW =
  'flex size-4 shrink-0 items-center justify-center text-micro leading-none text-labelColor hover:text-textColor disabled:text-textInactiveColor disabled:hover:text-textInactiveColor';

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
      {/* ПРАВИЛО ОБЛОЖКИ СКАЗАНО ВСЛУХ. `task-card.tsx` берёт обложкой `task.media[0]`, но знали
          об этом только комментарий в коде и тот, кто его писал: на экране первая плитка ничем не
          отличалась от остальных. */}
      {value.length > 0 && (
        <Text size='nano' variant='label' component='span'>
          the first attachment becomes the card cover
        </Text>
      )}
      <div className='flex flex-wrap items-start gap-2'>
        {value.map((id, index) => {
          const m = resolved.find((x) => x.id === id);
          const viewIndex = viewable.indexOf(m as NonNullable<typeof m>);
          return (
            <div key={id} className='w-16'>
              <div className='relative h-16 w-16 border border-borderColor'>
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
                  {/* Глиф удаления во всей подсистеме медиа один: ×. Здесь стоял `×` — знак
                      умножения, четвёртое начертание одной и той же кнопки. */}×
                </button>
              </div>
              {/* ПРАВИЛО ОБЛОЖКИ ТЕПЕРЬ МОЖНО ВЫПОЛНИТЬ. Строка выше называла первое вложение
                  обложкой, а переставить вложения было НЕЧЕМ: чтобы сделать обложкой второй
                  снимок, приходилось снять оба и приложить заново в нужном порядке. Плитка в 64
                  пикселя не вмещает ни ручки перетаскивания, ни подписей — стрелок хватает, и
                  они, в отличие от мыши, работают с клавиатуры. */}
              {value.length > 1 && (
                <div className='flex items-center gap-1 border-t border-hairline px-0.5'>
                  <Button
                    type='button'
                    aria-label={`move attachment ${index + 1} earlier`}
                    title='earlier in the order; the first becomes the cover'
                    disabled={index === 0}
                    onClick={() => onChange(moveItem(value, index, index - 1))}
                    className={ARROW}
                  >
                    ←
                  </Button>
                  <Text size='nano' variant='label' component='span' className='tabular-nums'>
                    {index + 1}
                  </Text>
                  <Button
                    type='button'
                    aria-label={`move attachment ${index + 1} later`}
                    title='later in the order'
                    disabled={index === value.length - 1}
                    onClick={() => onChange(moveItem(value, index, index + 1))}
                    className={ARROW}
                  >
                    →
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {/* Слот той же клеткой, что и вложения: 64 пикселя не вмещают ни глифа, ни подсказки,
            поэтому `compact` — но клик, ⌘V и бросок работают ровно так же. */}
        <MediaSlot
          aspectRatio={['Custom']}
          frameAspect='1/1'
          heightPx={64}
          compact
          label='+ media'
          purpose='attachment'
          allowMultiple
          showVideos
          onSelect={handleAdd}
        />
      </div>

      <MediaViewer items={viewerItems} {...viewer} />
    </div>
  );
}
