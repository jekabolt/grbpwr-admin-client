import { FC, ReactNode } from 'react';
import Text from 'ui/components/text';

/** Section header shared across the analytics tabs: 2px ink underline, uppercase title +
 *  muted subtitle, optional right-aligned slot. Matches the approved configurator `.sec-h`. */
export const SectionHead: FC<{ title: string; sub?: string; right?: ReactNode }> = ({
  title,
  sub,
  right,
}) => (
  <div className='flex flex-wrap items-baseline gap-x-2.5 border-b-2 border-textColor pb-1'>
    <Text component='h3' variant='uppercase' className='text-textBaseSize font-bold tracking-wide'>
      {title}
    </Text>
    {sub && <Text className='text-labelColor text-textBaseSize'>{sub}</Text>}
    {right && <span className='ml-auto'>{right}</span>}
  </div>
);
