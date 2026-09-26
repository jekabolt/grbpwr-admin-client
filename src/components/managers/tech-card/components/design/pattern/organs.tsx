import { cn } from 'lib/utility';
import type { JSX, ReactNode } from 'react';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';

import { BENCH_CELL_PX } from '../bench-slot';
import { useElapsed } from '../generation';

/* ═══ `LockLine` И `GoToStep` СНЕСЕНЫ ВМЕСТЕ С ПОЛКОЙ, КОТОРАЯ ИХ ЗВАЛА (STEP 3) ═══════════════════
   Оба стояли ровно в одном месте — в полосе «made earlier, not kept» (`pattern-library.tsx`):
   замок полной полки с дверью на FABRIC RENDER. Полосы нет (одна история на шаге — карусель), а
   двери шага на соседние экраны теперь пропсы композитора (`onGoStep`, `onGoTab`): писатель
   `?step=` один, и это `goStep` в `studio-tab.tsx`. Экспорт без читателя — обещание, за которое
   никто не платит. */

/**
 * THE PATTERN STEP'S LOCAL ORGANS — the small printers this screen needs and the core does not
 * yet carry: a corner label, the 2×2 face of a repeat, the cell geometry and the hole of a live
 * run. Each is written once here and used by every file of this folder; none reads the wire.
 * ⚠ THE FIRST TWO ASK TO LIVE IN `core/`: the colour tile of FABRIC RENDER and the detached ON
 * MODEL draw the same corner labels, and a second copy there would part from this one silently.
 */

/**
 * A LABEL IN A CORNER OF A TILE'S FACE — the prototype's `.frole` / `.fbadge` / `.fmark`.
 *
 * Solid ink for a verdict or a kind (`seamless`, `pattern`, `colour`, `in`); `gap` — white with
 * a dashed edge, label grey — for «not the case» (`join visible`, `not kept`). No red: red in this
 * admin means loss, and a tile whose join shows is not a loss, it is a fact about the picture.
 *
 * It is positioned absolutely, so the parent must be `relative` — `PictureTile`'s box and the
 * face span of a colour tile both are. `stack` lifts a bottom label one storey up, for a corner
 * already taken by another label.
 */
export function CornerLabel({
  at,
  gap,
  stack,
  children,
  className,
  ...rest
}: {
  at: 'tl' | 'tr' | 'bl' | 'br';
  gap?: boolean;
  stack?: boolean;
  children: ReactNode;
  className?: string;
  [k: string]: unknown;
}): JSX.Element {
  const place =
    at === 'tl'
      ? 'left-1 top-1'
      : at === 'tr'
        ? 'right-1 top-1'
        : at === 'bl'
          ? cn('left-1', stack ? 'bottom-6' : 'bottom-1')
          : cn('right-1', stack ? 'bottom-6' : 'bottom-1');
  return (
    <span
      {...rest}
      className={cn(
        'pointer-events-none absolute z-20 inline-block max-w-[calc(100%-8px)] px-1 py-0.5',
        place,
        gap
          ? 'border border-dashed border-borderColor bg-bgColor'
          : 'border border-textColor bg-textColor',
        className,
      )}
    >
      <Text
        size='nano'
        variant='uppercase'
        component='span'
        className={cn('block truncate', gap ? 'text-labelColor' : '!text-bgColor')}
      >
        {children}
      </Text>
    </span>
  );
}

/**
 * THE FACE OF A REPEATING TILE: the picture laid out 2×2, so the ONE join of four copies runs
 * through the middle of the face — the most visible place on the card. A tile that does not join
 * gives itself away with a cross in the centre, without being opened.
 *
 * ⚠ `background-size: 50% auto`, NOT `50% 50%` (review M-3). The fraction was taken from the box
 * on BOTH axes, which is exact only on a square box — and the slot cell is not square (138 × 162,
 * `FABRIC_CELL_ASPECT`): there the square swatch was drawn 69 × 81, stretched 17 % tall, i.e. the
 * cell showed a cloth that is not the one in the render. Now the width is exactly half the box
 * (two copies across, the vertical join in the middle) and the height follows the picture's own
 * proportion, so a copy is never stretched on any box.
 *
 * THE HORIZONTAL JOIN STAYS IN THE MIDDLE BY POSITION, NOT BY STRETCHING. With a square copy of
 * height W/2 in a box of height H, a copy edge lands on H/2 when the grid is shifted by
 * (H − W)/2; `calc(50% − 25cqw)` is exactly that (a percentage position resolves against
 * H − W/2, and `cqw` is a hundredth of the face's own width — the wrapper is the size container).
 * On a square box the shift is zero and the face is the old 2×2 to the pixel. Four copies, one
 * cross through the centre, on the carousel's square tile and on the portrait cell alike.
 */
export function TiledFace({ url, alt }: { url: string; alt: string }): JSX.Element {
  return (
    <div
      role='img'
      aria-label={`${alt} — the tile repeated four times, so the join runs through the middle`}
      data-tiled-face
      className='h-full w-full'
      style={{ containerType: 'inline-size' }}
    >
      <div
        className='h-full w-full bg-bgColor'
        style={{
          backgroundImage: `url(${JSON.stringify(url)})`,
          backgroundSize: '50% auto',
          backgroundPosition: '0 calc(50% - 25cqw)',
          backgroundRepeat: 'repeat',
        }}
      />
    </div>
  );
}

/**
 * ═══ ЯЧЕЙКА ТКАНИ — 138 × 162, ТА ЖЕ КОРОБКА, ЧТО У ФЛЭТ-СЛОТА И У ЯЧЕЙКИ IMAGE TO FABRIC ═══════
 *
 * Отношение СНАРУЖИ рамки: элементы, которые его носят (`PictureTile`, `Placeholder`), держат рамку
 * на себе и `box-sizing: border-box`, поэтому 138 в ширину дают ровно 162 в высоту. Числа
 * берутся у верстака (`BENCH_CELL_PX` + подвал 24), а не пишутся второй раз: «того же размера, что
 * ячейки FLAT SLOTS» — это замер, который владелец проверяет глазами (r2 п.25).
 */
export const FABRIC_CELL_ASPECT = `${BENCH_CELL_PX}/${BENCH_CELL_PX + 24}`;

/**
 * THE HOLE OF A LIVE RUN — the shape of the answer, standing where the answer will land. A screen
 * that does not change after the click reads as «nothing happened», and the next thing a person
 * does is pay twice. Its own component because of the hook: `useElapsed` ticks once a second and
 * must redraw one cell, not every tiled face around it.
 *
 * Слово — серое (`label`), а не цвет плейсхолдера: «идёт прогон» — это состояние, которое читают,
 * а `#ccc` в этой админке только для рамок и пустоты.
 */
export function PendingTile({
  startedAt,
  label = 'making the fabric…',
  aspect = FABRIC_CELL_ASPECT,
  className,
}: {
  startedAt?: string | null;
  label?: string;
  aspect?: string;
  className?: string;
}): JSX.Element {
  const elapsed = useElapsed(startedAt ?? undefined);
  return (
    <div data-pattern-pending='' className={cn('w-full', className)}>
      <Placeholder dashed style={{ aspectRatio: aspect }} className='w-full px-2'>
        <span className='flex flex-col items-center gap-0.5 text-center'>
          <Text size='micro' variant='label' component='span' className='normal-case'>
            {label}
          </Text>
          <Text size='nano' variant='label' component='span'>
            {elapsed || '0:00'}
          </Text>
        </span>
      </Placeholder>
    </div>
  );
}
