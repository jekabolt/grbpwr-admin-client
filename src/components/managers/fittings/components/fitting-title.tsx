import { fittingTitleParts } from './utils';

// One line: only the garment name gives way, so type, size and «fitting N» always stay readable.
export function FittingTitle({ parts }: { parts: ReturnType<typeof fittingTitleParts> }) {
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
