import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { MediaViewer, mediaFullToViewerItem, useMediaViewer } from 'ui/components/media-viewer';
import Text from 'ui/components/text';
import { readSlotAspect } from '../utils/calculate-aspect';
import { useMediaIntake } from '../utils/useMediaIntake';
import { MediaSlot } from './media-slot';

interface MediaGallerySelectorProps {
  media: common_MediaFull[];
  editMode?: boolean;
  /** Aspect ratio options offered in the picker dialog. */
  aspectRatio: string[];
  /** CSS aspect-ratio for each cell frame, e.g. '4/5'. */
  frameAspect: string;
  label?: string;
  purpose?: string;
  /** Caption under the add slot (e.g. 'any ratio', '2:1'). */
  ratioCaption?: string;
  fit?: 'cover' | 'contain';
  /** Mark the first item as the thumbnail (first media becomes the entry thumbnail). */
  firstIsThumbnail?: boolean;
  onSelect: (media: common_MediaFull[]) => void;
  onDelete: (id: number) => void;
}

// Shared multi-select media gallery — used by product ads, archive media, etc.
export function MediaGallerySelector({
  media,
  editMode = true,
  aspectRatio,
  frameAspect,
  label = '+ add',
  purpose,
  ratioCaption,
  fit = 'cover',
  firstIsThumbnail = false,
  onSelect,
  onDelete,
}: MediaGallerySelectorProps) {
  const viewer = useMediaViewer();
  const viewerItems = media.map(mediaFullToViewerItem);
  const slot = readSlotAspect(aspectRatio);

  // ⌘V И БРОСОК РАБОТАЮТ НАД ВСЕЙ ГАЛЕРЕЕЙ, а не только над пустой клеткой в её конце. Целиться
  // указателем в добавляющий слот, чтобы вставить картинку, — требование, которого никто не
  // угадает: жест адресован галерее.
  //
  // Слот в конце сетки держит свою очередь, и это не двойная загрузка: ⌘V обрабатывает ВЕРХНИЙ в
  // стопке приёмник — ровно один из двух, — а кладут результат оба одним и тем же `onSelect`.
  const intake = useMediaIntake({
    accept: 'media',
    aspect: slot.primary,
    lockAspect: slot.constrained,
    purpose,
    enabled: editMode,
    onMedia: onSelect,
  });

  return (
    <>
      <div
        {...intake.regionHandlers}
        className={cn(
          'grid grid-cols-2 gap-2',
          // Бросок на ЗАНЯТУЮ клетку тоже добавляет кадр — и это надо показать: без отклика жест
          // над готовой галереей выглядит как промах мимо слота в её конце.
          intake.dragging && 'outline outline-1 outline-offset-4 outline-textColor',
        )}
      >
        {media.map((m, i) => {
          const url = m.media?.thumbnail?.mediaUrl || m.media?.fullSize?.mediaUrl || '';
          const video = isVideo(m.media?.fullSize?.mediaUrl) || isVideo(url);
          const tags = [String(i + 1)];
          if (video) tags.push('video');
          if (firstIsThumbnail && i === 0) tags.push('thumbnail');
          return (
            <div
              key={m.id ?? i}
              className='relative overflow-hidden border border-textInactiveColor'
              style={{ aspectRatio: frameAspect }}
            >
              <Media
                type={video ? 'video' : 'image'}
                src={url}
                alt={m.media?.blurhash || ''}
                fit={video ? 'contain' : fit}
                aspectRatio='auto'
              />
              {/* Full-cell click target opens the shared viewer at this index. Sits
                under the badge/delete controls (which stop propagation). */}
              <button
                type='button'
                aria-label={`View item ${i + 1} of ${media.length}`}
                onClick={() => viewer.openAt(i)}
                className='absolute inset-0 z-10 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
              />
              <span className='pointer-events-none absolute left-1 top-1 z-20 bg-textColor px-1.5 py-0.5'>
                <Text className='!text-bgColor' size='small' variant='uppercase'>
                  {tags.join(' · ')}
                </Text>
              </span>
              {editMode && (
                <Button
                  type='button'
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onDelete(m.id || 0);
                  }}
                  className='absolute right-1 top-1 z-20 cursor-pointer border border-textInactiveColor bg-bgColor px-1 leading-none'
                >
                  [x]
                </Button>
              )}
            </div>
          );
        })}
        {/* Слот «ещё кадр» стоит В САМОЙ СЕТКЕ и той же клеткой, что и снимки: пустое место и есть
            средство его заполнить. Кнопка внутри пунктирной рамки читалась как отдельный контрол
            рядом с галереей, а заполняет она именно эту клетку. */}
        {editMode && (
          <MediaSlot
            aspectRatio={aspectRatio}
            frameAspect={frameAspect}
            label={label}
            purpose={purpose}
            hint={ratioCaption}
            allowMultiple
            showVideos
            onSelect={onSelect}
          />
        )}
      </div>

      {intake.dialog}

      <MediaViewer items={viewerItems} {...viewer} />
    </>
  );
}
