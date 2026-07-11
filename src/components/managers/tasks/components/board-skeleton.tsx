import { STATUSES } from '../utils/meta';

// Column/card skeleton for the board's loading state (product register prefers
// skeletons over a centered spinner). Mirrors the real board's layout so the
// switch to loaded content doesn't shift.
export function BoardSkeleton() {
  return (
    <div className='flex gap-4 overflow-hidden pb-4' aria-hidden>
      {STATUSES.map((status, i) => (
        <div key={status} className='flex w-[85vw] shrink-0 flex-col sm:w-72'>
          <div className='mb-2 flex items-center justify-between border-b border-textColor pb-2'>
            <div className='h-3 w-20 bg-black/[0.12]' />
            <div className='h-3 w-4 bg-black/[0.08]' />
          </div>
          <div className='mt-2 flex flex-col gap-2'>
            {Array.from({ length: (i % 3) + 1 }).map((_, j) => (
              <div
                key={j}
                className='h-20 animate-pulse border border-textInactiveColor bg-black/[0.03] motion-reduce:animate-none'
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
