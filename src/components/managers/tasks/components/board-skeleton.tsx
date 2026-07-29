import { SkeletonBlocks, SkeletonLine } from 'ui/components/skeleton';
import { STATUSES } from '../utils/meta';

// The board's loading state keeps the SHAPE of the answer (a hatched header + a
// stack of card blocks per column), so nothing jumps when the data lands. Hatch,
// not a pulse — the design system has no shimmer vocabulary.
export function BoardSkeleton() {
  return (
    <div className='flex gap-4 overflow-hidden pb-4' aria-hidden aria-busy='true'>
      {STATUSES.map((status, i) => (
        <div key={status} className='flex w-[85vw] shrink-0 flex-col sm:w-72'>
          <div className='mb-2 flex items-center justify-between border-b border-borderColor pb-1.5'>
            <SkeletonLine width={72} />
            <SkeletonLine width={16} />
          </div>
          <SkeletonBlocks count={(i % 3) + 1} height={80} className='mt-2' />
        </div>
      ))}
    </div>
  );
}
