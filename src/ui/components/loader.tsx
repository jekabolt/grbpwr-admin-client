'use client';

import { cn } from 'lib/utility';

interface LoaderProps {
  type?: 'default' | 'order-processing' | 'overlay';
  reverse?: boolean;
  children?: React.ReactNode;
}

export function Loader({ type = 'default', reverse = false, children }: LoaderProps) {
  if (type === 'overlay') {
    return (
      <div className='relative flex h-full w-full items-center justify-center overflow-hidden'>
        <div
          className={cn(
            'absolute left-0 top-0 h-full w-full bg-textColor',
            reverse
              ? 'animate-[loading-reverse_1s_ease-out_forwards]'
              : 'animate-[loading_1s_ease-out_forwards]',
          )}
        />
        {children && <div className='relative z-10 text-bgColor'>{children}</div>}
      </div>
    );
  }

  return (
    <div className='flex w-full justify-center p-2'>
      <div className='relative h-[0.5px] w-full overflow-hidden bg-gray-200/20 lg:w-[175px]'>
        <div
          className={cn(
            'absolute left-0 top-0 h-full w-full animate-[loading_1s_ease-out_forwards]',
            reverse ? 'bg-bgColor' : 'bg-textColor',
          )}
        />
      </div>
    </div>
  );
}
