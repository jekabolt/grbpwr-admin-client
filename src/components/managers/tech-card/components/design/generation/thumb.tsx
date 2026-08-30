import type { common_MediaFull } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';

/**
 * The address of a picture's smallest usable rendition. Thumbnail first, then compressed, then the
 * original — a run panel draws a dozen of these at 44px, and pulling full-size files for that is how
 * opening a history costs ten megabytes.
 *
 * Empty string when the media carries no address at all, which is a real state: an input snapshot
 * whose media has since been deleted serves `media` unset and `deleted` true.
 */
export function thumbUrl(media?: common_MediaFull | null): string {
  const m = media?.media;
  return m?.thumbnail?.mediaUrl || m?.compressed?.mediaUrl || m?.fullSize?.mediaUrl || '';
}

/**
 * A fixed-size picture cell. `object-contain` and never `cover`: these are flats and photographs of
 * garments, and a crop that eats the hem to fill a square is a different picture from the one the
 * run produced.
 */
export function Thumb({
  media,
  alt,
  className,
  gone,
}: {
  media?: common_MediaFull | null;
  alt?: string;
  className?: string;
  /** The snapshot froze a media id that no longer resolves — say so instead of drawing a hole. */
  gone?: boolean;
}) {
  const src = thumbUrl(media);
  return (
    <span
      className={cn(
        // МАТ ПОД СНИМКОМ БЕЛЫЙ, И ЭТО ПРАВИЛО, А НЕ ВКУС (R-12).
        //
        // Владелец: «после кропа картинка с белым фоном становится серой». Серверный рез при этом
        // невиновен — он отдаёт (255,255,255,a=255), это доказано опытом в бэкенде
        // (design_crop_lossless_test.go). Серым белое делал МАТ, и двумя путями сразу: при
        // object-contain он виден ВОКРУГ снимка, чьё соотношение не совпало с кадром, а у PNG с
        // честной прозрачностью просвечивает СКВОЗЬ него.
        //
        // Пустоту называет СЛОВО («no image» / «deleted») — ровно как в band-feed. Цвет за
        // «пусто» не отвечает, иначе он же начинает врать про «белое».
        //
        // ГРАНИЦУ ЯЧЕЙКИ ДЕРЖИТ РАМКА, И ОНА ЖИВЁТ ЗДЕСЬ, В ПРИМИТИВЕ. Пока мат был серым, серое
        // и было ячейкой; на белой строке белый мат без рамки — невидимая коробка, и слово
        // пустоты повисает в воздухе. Вызывающие передают только размеры (h-14 w-11 и им
        // подобные) — рамки от них не дождаться, а близнецы этой формы в той же волне
        // (diff-modal Thumb, what-model-gets, new-detail-modal) и вторая ветка
        // FrozenInputPicture (AnnotationSurface) все несут border-borderColor.
        'relative flex shrink-0 items-center justify-center overflow-hidden border border-borderColor bg-bgColor',
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? ''}
          loading='lazy'
          className='block h-full w-full'
          style={{ objectFit: 'contain' }}
        />
      ) : (
        <Text size='nano' variant='label' component='span' className='px-0.5 text-center'>
          {gone ? 'deleted' : 'no image'}
        </Text>
      )}
    </span>
  );
}
