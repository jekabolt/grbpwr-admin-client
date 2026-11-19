import { type BrandDraft, type BrandKey, BRAND_FIELDS } from 'lib/workspace/brand-fields';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { AddDoor } from 'ui';

import { type PickedLogo, readLogo } from './logo';
import { teamLogoUrl } from './oauth';
import { SheetFoot, SheetForm, SheetInput, SheetLink, SheetRow, SheetSubmit } from './sheet';

// Step two of `sign up` and `new team` (fix mockup `logo · one button`): the square is the add
// door, the chosen picture previews in it; beside it (under it on the phone) the team's brand
// fields as in the workspace `brand` block. One button sends it all, with or without either.

/**
 * A team's square: hairline border, the logo fitted inside, empty when there is none (never a
 * hole). `side` — 44px under a sheet's wordmark; `tile` — the full width of a team tile.
 */
export function TeamMark({
  src,
  size = 'side',
}: {
  src?: string;
  size?: 'side' | 'tile' | 'plate';
}) {
  return (
    <span
      aria-hidden={src ? undefined : 'true'}
      className={cn(
        'flex flex-none items-center justify-center overflow-hidden border border-borderColor bg-bgColor',
        size === 'tile' && 'aspect-square w-full p-[22%]',
        size === 'side' && 'size-11 p-1',
        size === 'plate' && 'size-24 p-3 lg:size-40 lg:p-5',
      )}
    >
      {src && <img src={src} alt='' className='block size-full object-contain' />}
    </span>
  );
}

/**
 * A team's public logo before sign-in (the same address the invite uses): the URL once the picture
 * has loaded, `undefined` while it loads, when the team has none, or when it fails.
 */
export function useTeamLogo(slug: string): string | undefined {
  const [loaded, setLoaded] = useState<string>();
  useEffect(() => {
    const src = slug ? teamLogoUrl(slug) : '';
    if (!src) return;
    const img = new Image();
    img.onload = () => setLoaded(src);
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [slug]);
  return loaded;
}

const SQUARE = 'size-28 max-sm:size-30';

export function LogoStep({
  title,
  logo,
  onLogo,
  bad,
  onBad,
  brand,
  onBrand,
  invalid,
  busy,
  note,
  onBack,
  onSend,
}: {
  title: string;
  logo: PickedLogo | null;
  onLogo: (logo: PickedLogo | null) => void;
  /** The picture was refused (here or by the server's `bad_logo`): the square turns red. */
  bad: boolean;
  onBad: (bad: boolean) => void;
  brand: BrandDraft;
  onBrand: (key: BrandKey, value: string) => void;
  /** Fields refused here or by the server. */
  invalid: readonly BrandKey[];
  busy: boolean;
  note: string;
  onBack: () => void;
  onSend: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    const read = await readLogo(f);
    if (!read) {
      onBad(true);
      return;
    }
    onBad(false);
    onLogo(read);
  };

  const input = (
    <input
      ref={file}
      type='file'
      accept='image/png,image/jpeg'
      aria-label='logo'
      aria-invalid={bad || undefined}
      tabIndex={logo ? 0 : -1}
      className='pointer-events-none absolute size-px opacity-0'
      onChange={(e) => {
        void pick(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  const drop = {
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      void pick(e.dataTransfer.files?.[0]);
    },
  };

  return (
    <SheetForm title={title} note={note} onSubmit={() => !busy && onSend()}>
      <div className='grid grid-cols-1 items-start gap-3.5 pb-2 pt-3.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5'>
        <div className='relative flex flex-col items-start gap-2'>
          {logo ? (
            <>
              <label
                {...drop}
                className={cn(
                  'relative flex flex-none cursor-pointer items-center justify-center border bg-bgColor p-2 hover:border-textColor has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-textColor',
                  SQUARE,
                  bad ? 'border-error' : 'border-borderColor',
                )}
              >
                {input}
                <img src={logo.preview} alt='logo' className='block size-full object-contain' />
              </label>
              <SheetLink onClick={() => onLogo(null)}>remove</SheetLink>
            </>
          ) : (
            <>
              {input}
              <AddDoor
                {...drop}
                shape='tile'
                lowercase
                aria-invalid={bad || undefined}
                className={cn(SQUARE, bad && 'border-error')}
                onClick={() => file.current?.click()}
              >
                logo
              </AddDoor>
            </>
          )}
        </div>
        <div className='flex min-w-0 flex-col [&>*:first-child]:pt-0'>
          {BRAND_FIELDS.map((f) => (
            <SheetRow key={f.key} label={f.label}>
              <SheetInput
                name={`brand-${f.key}`}
                type={f.type}
                value={brand[f.key]}
                maxLength={f.max}
                autoComplete={f.autoComplete}
                aria-label={f.label}
                invalid={invalid.includes(f.key)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onBrand(f.key, e.target.value)
                }
              />
            </SheetRow>
          ))}
        </div>
      </div>
      <SheetFoot left={<SheetLink onClick={onBack}>back</SheetLink>}>
        <SheetSubmit loading={busy}>create team</SheetSubmit>
      </SheetFoot>
    </SheetForm>
  );
}
