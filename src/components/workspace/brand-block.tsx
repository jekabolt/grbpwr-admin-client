import type { TeamBrand } from 'api/proto-http/admin';
import { failureClassOfError } from 'components/managers/tech-card/components/useTechCardAutosave';
import { notify } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useDockBottom } from 'hooks/useDockBottom';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, EmptyCell, Input, Section, Text, useDoneFlash } from 'ui';
import { BrandLogo, type LogoState } from './brand-logo';
import {
  type BrandValues,
  brandValues,
  type LogoChange,
  refusedField,
  useSaveBrand,
} from './use-brand';

// The brand block of `/workspace` (fix mockup `fBrand` + `dock`): logo · identity · legal. An
// editor types into boxes and saves from the dock at the foot of the screen; everyone else reads
// bare values. `unavailable` (control plane unreadable) = nothing to edit, nothing to save.

const FIELDS_1: [keyof BrandValues, string][] = [
  ['brandName', 'brand name'],
  ['contactEmail', 'email'],
  ['website', 'website'],
];
const FIELDS_2: [keyof BrandValues, string][] = [
  ['legalEntity', 'legal entity'],
  ['street', 'street'],
  ['city', 'city'],
  ['country', 'country'],
];

/** label · value: two columns from md, label above the value on a phone. */
function Line({ label, top, children }: { label: string; top?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-1 border-hairline py-1.5 first:pt-0 md:grid-cols-[6rem_minmax(0,1fr)] md:items-center md:gap-3 [&+&]:border-t',
        top && 'md:items-start',
      )}
    >
      <Text component='span' variant='label' size='micro' className={cn(top && 'md:pt-1')}>
        {label}
      </Text>
      {children}
    </div>
  );
}

const bare = (v: string) =>
  v ? (
    <span className='min-w-0 break-words py-1'>{v}</span>
  ) : (
    <span className='py-1'>
      <EmptyCell />
    </span>
  );

export function WorkspaceBrand({
  brand,
  logoUrl,
  editor,
}: {
  brand: TeamBrand | null;
  logoUrl: string;
  editor: boolean;
}) {
  const unavailable = !brand || !!brand.unavailable;
  const values = useMemo(() => brandValues(unavailable ? null : brand), [brand, unavailable]);
  const form = useForm<BrandValues>({ values });
  const [logo, setLogo] = useState<LogoState>({ kind: 'keep' });
  const [badLogo, setBadLogo] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const save = useSaveBrand();
  const saved = useDoneFlash();
  const dockRef = useRef<HTMLDivElement>(null);

  // a new answer (save, refresh) drops the local logo pick
  useEffect(() => setLogo({ kind: 'keep' }), [logoUrl]);

  const live = editor && !unavailable;
  const dirty = live && (form.formState.isDirty || logo.kind !== 'keep');
  const showDock = live && (dirty || saved.on || !!refused);
  useDockBottom(dockRef, [showDock]);

  const shownLogo = logo.kind === 'set' ? logo.preview : logo.kind === 'remove' ? '' : logoUrl;

  const submit = form.handleSubmit((v) => {
    const change: LogoChange =
      logo.kind === 'set'
        ? { kind: 'set', base64: logo.base64 }
        : logo.kind === 'remove'
          ? { kind: 'remove' }
          : { kind: 'keep' };
    setRefused(null);
    form.clearErrors();
    save.mutate(
      { values: v, logo: change },
      {
        onSuccess: () => {
          saved.flash();
          form.reset(v);
          setLogo({ kind: 'keep' });
        },
        onError: (e) => {
          const field = refusedField(e);
          if (field === 'logo') setBadLogo(true);
          else if (field) form.setError(field, { type: 'server' });
          if (failureClassOfError(e) === 'transient')
            notify({
              sev: 'error',
              subject: 'BRAND',
              text: 'not saved',
              detail: e instanceof Error ? e.message : String(e),
              action: { label: 'retry', onClick: () => void submit() },
            });
          else setRefused('not saved');
        },
      },
    );
  });

  const field = (name: keyof BrandValues, label: string) => (
    <Line key={name} label={label}>
      {editor ? (
        <Input
          {...form.register(name)}
          aria-label={label}
          aria-invalid={form.formState.errors[name] ? true : undefined}
          autoComplete='off'
          spellCheck={false}
          disabled={!live}
          className='h-[1.625rem]'
        />
      ) : (
        bare(values[name])
      )}
    </Line>
  );

  const address = [values.street, values.city, values.country].filter(Boolean);

  return (
    <>
      <Section
        title='brand'
        headerClassName='[&_h3]:normal-case'
        action={
          unavailable ? (
            <Text component='span' variant='errorLabel' size='micro'>
              not loaded
            </Text>
          ) : undefined
        }
      >
        <div className='@container'>
          <div className='grid grid-cols-1 gap-4 @[43.75rem]:grid-cols-[8rem_minmax(0,1fr)] @[68.75rem]:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] @[68.75rem]:gap-6'>
            <BrandLogo
              src={shownLogo}
              live={live}
              bad={badLogo}
              onPick={(next) => {
                setBadLogo(false);
                setLogo(next);
              }}
              onBad={() => setBadLogo(true)}
            />
            <div className='flex flex-col'>{FIELDS_1.map(([n, l]) => field(n, l))}</div>
            <div className='flex flex-col @[43.75rem]:col-start-2 @[68.75rem]:col-start-auto'>
              {editor ? (
                FIELDS_2.map(([n, l]) => field(n, l))
              ) : (
                <>
                  <Line label='legal entity'>{bare(values.legalEntity)}</Line>
                  <Line label='address' top>
                    {address.length ? (
                      <span className='min-w-0 break-words py-1'>
                        {address.map((l, i) => (
                          <span key={i} className='block'>
                            {l}
                          </span>
                        ))}
                      </span>
                    ) : (
                      bare('')
                    )}
                  </Line>
                </>
              )}
            </div>
          </div>
        </div>
      </Section>

      {showDock && (
        <div
          ref={dockRef}
          className='fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-borderColor bg-bgColor px-3 py-2'
        >
          {refused ? (
            <Text component='span' variant='errorLabel' size='small' role='alert'>
              {refused}
            </Text>
          ) : (
            <Text component='span' variant='label' size='small'>
              {saved.on && !dirty ? 'saved' : 'unsaved'}
            </Text>
          )}
          <Button
            type='button'
            variant='main'
            className='px-4 py-1.5'
            disabled={save.isPending || !dirty}
            loading={save.isPending}
            onClick={() => void submit()}
          >
            save
          </Button>
        </div>
      )}
    </>
  );
}
