import { fittingTitleParts } from './utils';

type Parts = ReturnType<typeof fittingTitleParts>;

// One line: only the garment name gives way, so type, size and «fitting N» always stay readable.
// `stacked` (a narrow card): the garment on the first line, size and «fitting N» on the second.
export function FittingTitle({ parts, stacked }: { parts: Parts; stacked?: boolean }) {
  if (stacked) {
    return (
      <>
        <span className='block truncate'>
          {[parts.head, parts.garment].filter(Boolean).join(' · ')}
        </span>
        {parts.tail.length > 0 && <span className='block truncate'>{parts.tail.join(' · ')}</span>}
      </>
    );
  }
  return (
    <span className='flex min-w-0 whitespace-nowrap'>
      {parts.head && <span className='shrink-0'>{parts.head}&nbsp;·&nbsp;</span>}
      <span className='min-w-0 truncate'>{parts.garment}</span>
      {parts.tail.map((t) => (
        <span key={t} className='shrink-0'>
          &nbsp;·&nbsp;{t}
        </span>
      ))}
    </span>
  );
}
