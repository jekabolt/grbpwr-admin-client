import { authService } from 'api/api';
import { useEffect, useState } from 'react';
import { Text } from 'ui';

import { baseSuffix, SheetInput } from './sheet';
import { checkSlug, type SlugCheck } from './slug';

// The team address row of sign up and `new team`: the field, `.<base>`, and free / taken.

const DEBOUNCE_MS = 300;

export function useSlugCheck(slug: string, name: string): SlugCheck {
  const local = checkSlug(slug);
  const [remote, setRemote] = useState<{ slug: string; available: boolean } | null>(null);
  const ask = local.status === 'free';

  useEffect(() => {
    if (!ask) return;
    let live = true;
    const t = setTimeout(() => {
      authService
        .CheckTeamSlug({ slug, name })
        .then((r) => live && setRemote({ slug, available: !!r.available }))
        .catch(() => live && setRemote(null));
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [ask, slug, name]);

  if (!ask) return local;
  if (!remote || remote.slug !== slug) return { slug, status: 'checking', word: '' };
  return remote.available
    ? { slug, status: 'free', word: 'free' }
    : { slug, status: 'taken', word: 'taken' };
}

export const isBadCheck = (c: SlugCheck) => c.status === 'bad' || c.status === 'taken';

export function AddressField({
  check,
  onChange,
}: {
  check: SlugCheck;
  onChange: (value: string) => void;
}) {
  const bad = isBadCheck(check);
  return (
    <div className='flex min-w-0 items-center gap-2'>
      <div className='flex min-w-0 flex-1 items-center'>
        <SheetInput
          name='address'
          value={check.slug}
          placeholder='your-team'
          autoComplete='off'
          aria-label='address'
          invalid={bad}
          className='min-w-0 flex-1'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.value.toLowerCase())
          }
        />
        <Text component='span' variant='label' className='shrink-0 pl-1'>
          {baseSuffix()}
        </Text>
      </div>
      <Text
        component='span'
        size='micro'
        className={
          check.status === 'free'
            ? 'shrink-0 text-success'
            : bad
              ? 'shrink-0 text-error'
              : 'shrink-0 text-labelColor'
        }
      >
        {check.word}
      </Text>
    </div>
  );
}
