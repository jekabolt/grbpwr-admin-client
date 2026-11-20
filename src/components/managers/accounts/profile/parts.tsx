import { useQuery } from '@tanstack/react-query';
import { authService } from 'api/api';
import { cn } from 'lib/utility';
import type { ReactNode } from 'react';
import { Text } from 'ui';

// Shared bits of the profile blocks: the two reads, the label · value line, the plain row
// (word · quiet · control) and the two button sizes the mockup draws.

export const myProfileKey = ['myProfile'] as const;
export const mySessionsKey = ['mySessions'] as const;

export function useMyProfile() {
  return useQuery({
    queryKey: myProfileKey,
    queryFn: () => authService.GetMyProfile({}),
    retry: false,
    staleTime: 0,
  });
}

export function useMySessions(enabled: boolean) {
  return useQuery({
    queryKey: mySessionsKey,
    queryFn: () => authService.ListMySessions({}),
    retry: false,
    staleTime: 0,
    enabled,
  });
}

/** label · value: two columns from md, the label above the value on a phone. */
export function Line({
  label,
  top,
  children,
}: {
  label: ReactNode;
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-1 border-hairline py-1.5 first:pt-0 md:grid-cols-[6rem_minmax(0,1fr)] md:items-center md:gap-3 [&+&]:border-t',
        top && 'md:items-start',
      )}
    >
      <Text component='span' variant='label' size='micro' className={cn(top && 'md:pt-2')}>
        {label}
      </Text>
      {children}
    </div>
  );
}

/** word · quiet · control on one line; on a phone the quiet half drops under the word. */
export function PlainRow({
  word,
  quiet,
  control,
}: {
  word: ReactNode;
  quiet?: ReactNode;
  control?: ReactNode;
}) {
  return (
    <div className='grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-hairline py-1 md:min-h-[2.125rem] [&+&]:border-t'>
      <span className='flex min-w-0 flex-col md:flex-row md:flex-wrap md:items-baseline md:gap-3'>
        <span className='whitespace-nowrap'>{word}</span>
        {quiet ? <span className='break-words text-labelColor'>{quiet}</span> : null}
      </span>
      {control ?? <span />}
    </div>
  );
}

/** Size of the 26px block buttons (`log out`, `cancel`, `sign out others`, the block's action). */
export const BLOCK_BUTTON = 'h-[1.625rem] whitespace-nowrap px-3 max-md:h-10 max-md:flex-1';

/** Size of the 22px row buttons (`change`, `sign out`). */
export const ROW_BUTTON = 'h-[1.375rem] whitespace-nowrap px-2 text-micro tracking-label';

/** A refusal or a quiet state under a field or in a block foot. */
export function Note({ bad, children }: { bad?: boolean; children: ReactNode }) {
  return (
    <Text
      component='span'
      variant={bad ? 'errorLabel' : 'label'}
      size='micro'
      role={bad ? 'alert' : undefined}
    >
      {children}
    </Text>
  );
}
