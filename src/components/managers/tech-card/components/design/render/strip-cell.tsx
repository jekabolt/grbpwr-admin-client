import { cn } from 'lib/utility';
import type { JSX } from 'react';
import type { MediaViewerItem } from 'ui/components/media-viewer';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';

import { PictureTile } from '../picture-tile';

/**
 * ONE CELL OF AN INPUT STRIP — a frame, two caption lines and one action, at a fixed width.
 *
 * The two generative screens both open on a horizontal band of inputs, and they must be the same
 * band: the render's flats and the 3D's renders are read in the same glance, on the same baseline,
 * with the provenance in the same place. Two cell components would drift by a pixel and by a word.
 *
 * ═══ КАДР РИСУЕТ ОБЩИЙ ПРИМИТИВ `PictureTile`, И ЭТО ВЕСЬ ОТВЕТ НА T-8 ════════════════════════
 *
 * Владелец, дословно (круг 4, пункт 8): «зум кнопку на ховер картинки ТАК КАК У НАС ВЕЗДЕ СДЕЛАНО
 * и что бы можно было в зум вью по всем картинкам из всех генераций итерироваться не только этой
 * и сделай везде одинаково включая кнопку сплит нахуя ты делаешь везде по разному».
 *
 * Замер до этой правки: ячейка рисовала угол САМА (проп `corner`), а оба экрана, которые ею
 * пользуются, монтировали ПО СВОЕМУ `MediaViewer` со своим рядом — рядом из четырёх плит одного
 * экрана. То есть в FABRIC RENDER стрелка «дальше» упиралась в край полосы флэтов не по решению, а
 * потому что дальше ничего не было передано: ни референсов, ни истории, ни верстака. Это ровно тот
 * архитектурный дефект, который владелец и просил устранить, повторённый ещё в двух местах.
 *
 * Теперь кадр — `PictureTile`. Угол больше не рисуется здесь и не задаётся снаружи: раскладка
 * органов — решение примитива, а ячейка объявляет только КАДР ДЛЯ РЯДА (`gallery`). Ряд собирает
 * `PictureGalleryProvider`, смонтированный на всю студию (`studio-tab.tsx`), поэтому листается всё,
 * что на экране, в порядке документа — включая картинки соседних блоков.
 *
 * ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ: пропа `corner`. Он был единственным способом поставить в эту ячейку
 * свой орган, и пока он существует, «сделать везде одинаково» остаётся задачей, которую можно
 * выполнить наполовину.
 *
 * THE FRAME IS A FIXED BOX AND THE PICTURE IS CONTAINED IN IT, which is deliberate and is the same
 * choice the bench makes. A frame cut to each picture's own proportions would give a strip of
 * ragged heights whose captions no longer line up, and the rule that a frame must match its
 * picture's ratio binds only where FRACTIONAL geometry is drawn over the frame — a callout at 0.5,
 * 0.16 lands in a different place on a letterboxed image than on a fitted one. Nothing fractional
 * is drawn here: the view badge and the corner organs are anchored to corners, so `object-contain`
 * inside a fixed box is honest. The moment a marker is placed on one of these frames, the box has
 * to become the picture's own ratio — and `media.thumbnail.width/height` is on the wire for it.
 */

export const CELL_WIDTH = 'w-[132px] shrink-0';
/** 132 × 148 — та же коробка, что была задана высотой, теперь сказанная пропорцией: `PictureTile`
 *  меряет кадр отношением сторон, а ячейка стоит в колонке шириной ровно 132px. */
const FRAME_ASPECT = '132/148';
const FRAME_HEIGHT = 'h-[148px]';

export function StripCell({
  src,
  alt,
  /** Drawn in the top-left corner of the frame, filled ink — the view this picture stands for. */
  badge,
  /**
   * КАДР ЭТОЙ ЯЧЕЙКИ ДЛЯ ОБЩЕГО ПРОСМОТРЩИКА СТУДИИ. Есть — примитив сам рисует угловой `zoom` и
   * ставит картинку в общий ряд; нет — ячейка зума не обещает и в ряд не встаёт.
   *
   * Полный адрес, а не миниатюра `src`: миниатюра на сцене просмотрщика — это мыло, выданное за
   * увеличение, и человек читает его как испорченный файл.
   */
  gallery,
  /** Shown instead of the frame when there is no picture. */
  empty,
  emphasis,
  lines,
  action,
  className,
}: {
  src?: string;
  alt: string;
  badge?: string;
  gallery?: MediaViewerItem;
  empty?: React.ReactNode;
  /** The cell holds something the screen READS — a heavier frame, as on a filled bench slot. */
  emphasis?: boolean;
  lines: React.ReactNode[];
  action?: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1', CELL_WIDTH, className)}>
      {src ? (
        /* `contain`, never `cover`: these are DRAWINGS, and a crop of a flat loses the outline of
           the garment — the one thing the sheet is printed for. Белая подложка задаётся здесь, а не
           примитивом: при `contain` поля кадра иначе показывали бы серый грунт страницы. */
        <PictureTile
          url={src}
          alt={alt}
          badge={badge}
          aspect={FRAME_ASPECT}
          fit='contain'
          selected={emphasis}
          gallery={gallery}
          className='w-full bg-bgColor'
        />
      ) : (
        <div
          className={cn(placeholderClass({ dashed: true }), FRAME_HEIGHT, 'w-full px-1 text-center')}
          style={PLACEHOLDER_SURFACE}
        >
          {empty}
        </div>
      )}

      {lines.map((line, i) => (
        <Text key={i} size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {line}
        </Text>
      ))}

      {action && <div className='mt-auto pt-0.5'>{action}</div>}
    </div>
  );
}

/**
 * The scrolling band the cells sit in.
 *
 * `overflow-x-auto` ON ITS OWN CONTAINER, not on the page: a card with a dozen flats is exactly the
 * case this strip exists for, and a page that scrolls sideways to show it takes every other block
 * with it.
 */
export function Strip({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className='flex items-stretch gap-2 overflow-x-auto pb-1'>{children}</div>;
}

/** The vertical rule that separates «what the render reads» from «everything else on the card». */
export function StripDivider(): JSX.Element {
  return <span aria-hidden='true' className='w-px shrink-0 self-stretch bg-borderColor' />;
}
