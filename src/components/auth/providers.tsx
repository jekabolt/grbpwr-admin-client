import { authService } from 'api/api';
import type { GetSignInOptionsResponse } from 'api/proto-http/auth';
import { useEffect, useState } from 'react';
import { Button, Text } from 'ui';

import { type Provider, startProvider } from './oauth';

// Provider buttons above a sheet's fields (mockup `login`, `login-noapple`, `signup`, `invite`):
// which ones show comes from GetSignInOptions; none → no buttons and no `or`.

let options: Promise<Provider[]> | null = null;
let known: Provider[] | null = null;

const pick = (o: GetSignInOptionsResponse): Provider[] => [
  ...(o.google ? (['google'] as const) : []),
  ...(o.apple ? (['apple'] as const) : []),
];

/** Asked once per page; a sheet may await it so the buttons arrive with the form, not after. */
export function signInOptions(): Promise<Provider[]> {
  if (!options) {
    options = authService.GetSignInOptions({}).then(
      (o) => (known = pick(o)),
      () => {
        options = null;
        return [];
      },
    );
  }
  return options;
}

/** One-colour marks (ink): the house allows colour only on text and borders. */
const MARKS: Record<Provider, string> = {
  google:
    'M12 10.2v3.9h5.4c-.24 1.4-1.66 4.1-5.4 4.1-3.25 0-5.9-2.69-5.9-6s2.65-6 5.9-6c1.85 0 3.09.79 3.8 1.47l2.6-2.5C16.73 3.6 14.6 2.6 12 2.6 6.8 2.6 2.6 6.8 2.6 12s4.2 9.4 9.4 9.4c5.43 0 9.03-3.82 9.03-9.2 0-.62-.07-1.09-.15-1.56z',
  apple:
    'M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66zM14.1 5.86c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.27z',
};

const LABEL: Record<Provider, string> = {
  google: 'continue with google',
  apple: 'continue with apple',
};

export function ProviderButtons({
  fields,
  gate,
}: {
  fields: () => Record<string, string>;
  /** False keeps the person on the page (e.g. consent not given yet). */
  gate?: () => boolean;
}) {
  const [shown, setShown] = useState<Provider[] | null>(known);
  const [leaving, setLeaving] = useState<Provider | null>(null);

  useEffect(() => {
    let live = true;
    void signInOptions().then((o) => live && setShown(o));
    // back from the provider through the browser's page cache: the buttons work again
    const back = (e: PageTransitionEvent) => e.persisted && setLeaving(null);
    window.addEventListener('pageshow', back);
    return () => {
      live = false;
      window.removeEventListener('pageshow', back);
    };
  }, []);

  if (!shown || shown.length === 0) return null;
  return (
    <>
      <div className='flex flex-col gap-2 pt-1.5'>
        {shown.map((p) => (
          <Button
            key={p}
            variant='secondary'
            size='lg'
            loading={leaving === p}
            disabled={leaving !== null}
            className='flex w-full items-center justify-center gap-2.5 py-2 max-sm:py-2.5'
            onClick={() => {
              if (gate && !gate()) return;
              setLeaving(p);
              startProvider(p, fields());
            }}
          >
            <svg viewBox='0 0 24 24' aria-hidden='true' className='size-3.5 flex-none fill-current'>
              <path d={MARKS[p]} />
            </svg>
            <span>{LABEL[p]}</span>
          </Button>
        ))}
      </div>
      <Text
        component='p'
        size='micro'
        variant='label'
        tracking='label'
        className='flex items-center gap-2.5 pt-1.5 before:flex-1 before:border-t before:border-hairline before:content-[""] after:flex-1 after:border-t after:border-hairline after:content-[""]'
      >
        or
      </Text>
    </>
  );
}
