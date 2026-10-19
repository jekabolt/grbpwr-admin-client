import { cn } from 'lib/utility';
import { SkeletonBlocks, SkeletonLine } from 'ui';
import { STATUSES } from '../utils/meta';

// The board's loading state keeps the SHAPE of the answer (a hatched header + a
// stack of card blocks per column; one full-width column on a phone), so nothing jumps when the data lands. Hatch,
// not a pulse — the design system has no shimmer vocabulary.
export function BoardSkeleton() {
  return (
    <div className='flex gap-4 overflow-hidden pb-4' aria-hidden aria-busy='true'>
      {STATUSES.map((status, i) => (
        <div
          key={status}
          className={cn('flex w-full shrink-0 flex-col sm:w-72', i > 0 && 'max-sm:hidden')}
        >
          <div className='hidden items-center justify-between border-b border-borderColor bg-bgColor pb-1.5 sm:flex'>
            <SkeletonLine width={72} />
            <SkeletonLine width={16} />
          </div>
          <div className='bg-transparent p-0 sm:mt-2 sm:bg-bgZebra sm:p-1'>
            <SkeletonBlocks count={(i % 3) + 1} height={80} />
          </div>
        </div>
      ))}
    </div>
  );
}
