import { cn } from 'lib/utility';
import type { ReactNode } from 'react';
import { CopyToClipboard, HeaderNote, Pill, Text } from 'ui';
import { type Mark, splitHost } from './model';

// Local layout of the «shop» screen (mockup `.row`): key · value · actions on one line from md;
// on a phone the key and the actions share the first line and the value takes the second.

export function Line({
  k,
  children,
  actions,
}: {
  k: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className='grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-hairline py-1.5 last:border-b-0 md:grid-cols-[10rem_minmax(0,1fr)_auto] md:py-1'>
      <Text component='span' variant='label' size='micro' className='min-w-0 break-words'>
        {k}
      </Text>
      <div className='col-span-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 md:col-span-1 md:col-start-2 md:row-start-1'>
        {children}
      </div>
      <div className='col-start-2 row-start-1 flex items-center justify-end gap-3.5 md:col-start-3'>
        {actions}
      </div>
    </div>
  );
}

export const StatusMark = ({ m }: { m: Mark }) => (
  <Pill lowercase tone={m.tone}>
    {m.word}
  </Pill>
);

/** `! 2` in the block header: things left to do. */
export const Todo = ({ n }: { n: number }) =>
  n > 0 ? <HeaderNote tone='warn'>! {n}</HeaderNote> : null;

export const Copy = ({ v }: { v: string }) => (
  <CopyToClipboard text={v} iconOnly copiedLabel='copied' className='text-labelColor' />
);

/** `golden-a.com`: the first label in ink, the rest grey; all grey when `muted`. */
export function HostWord({ host, muted }: { host: string; muted?: boolean }) {
  const [first, rest] = splitHost(host);
  return (
    <span className='min-w-0 break-all text-labelColor'>
      <span className={cn(!muted && 'text-textColor')}>{first}</span>
      {rest}
    </span>
  );
}

/** An outside link as an underlined word, same tab for nothing: a shop opens in a new one. */
export const OpenLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a
    href={href}
    target='_blank'
    rel='noreferrer'
    className='underline underline-offset-2 hover:opacity-70'
  >
    {children}
  </a>
);
