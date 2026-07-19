import { FC, ReactNode } from 'react';
import Text from 'ui/components/text';

/**
 * The shared Products-tab section shell, matching the approved stub (products-final.html):
 * a strong header with a 2px ink underline (title + muted "— subtitle"), a BOLD verdict line
 * stating what it means, then a white bordered panel holding the content.
 */
export const ProductSection: FC<{
  title: string;
  subtitle: string;
  verdict: ReactNode;
  children: ReactNode;
}> = ({ title, subtitle, verdict, children }) => (
  <section className='space-y-2.5'>
    <div className='flex flex-wrap items-baseline gap-x-2.5 border-b-2 border-textColor pb-1'>
      <Text
        component='h2'
        variant='uppercase'
        className='text-textBaseSize font-bold tracking-wide'
      >
        {title}
      </Text>
      <Text className='text-labelColor text-textBaseSize'>{subtitle}</Text>
    </div>
    <Text className='block text-[13px] font-bold leading-snug'>{verdict}</Text>
    <div className='border border-textInactiveColor p-3'>{children}</div>
  </section>
);
