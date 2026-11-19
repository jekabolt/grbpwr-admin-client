import { cn } from 'lib/utility';
import { Button, Text } from 'ui';

import { type PickedLogo, readLogo } from './logo';
import { SheetFoot, SheetForm, SheetLink, SheetSubmit } from './sheet';

// Step two of `sign up` and `new team` (mockup `signup-step2`, `signup-logo`, `new-team-step2`,
// `new-team-logo`): a square pick target, the picture previews inside it; `skip` sends without one.
// The square is built here from tokens: no primitive draws a picture slot of this shape.

/** A team's logo in a row: 20 px square, hairline border; `nil` keeps the slot empty. */
export function TeamMark({ src, size = 'row' }: { src?: string; size?: 'row' | 'side' }) {
  const box = size === 'side' ? 'size-11 p-1' : 'size-5 p-0.5';
  if (!src) return <span aria-hidden='true' className={cn('inline-flex flex-none', box)} />;
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center justify-center overflow-hidden border border-borderColor bg-bgColor',
        box,
      )}
    >
      <img src={src} alt='' className='block size-full object-contain' />
    </span>
  );
}

export function LogoStep({
  title,
  team,
  primary,
  logo,
  onLogo,
  bad,
  onBad,
  busy,
  note,
  onBack,
  onSend,
}: {
  title: string;
  team: string;
  primary: string;
  logo: PickedLogo | null;
  onLogo: (logo: PickedLogo | null) => void;
  /** The picture was refused (here or by the server's `bad_logo`): the square turns red. */
  bad: boolean;
  onBad: (bad: boolean) => void;
  busy: 'create' | 'skip' | null;
  note: string;
  onBack: () => void;
  onSend: (withLogo: boolean) => void;
}) {
  const pick = async (file: File | undefined) => {
    if (!file) return;
    const read = await readLogo(file);
    if (!read) {
      onBad(true);
      return;
    }
    onBad(false);
    onLogo(read);
  };

  return (
    <SheetForm
      title={title}
      note={note || team}
      noteTone={note ? 'warn' : 'mut'}
      onSubmit={() => logo && !busy && onSend(true)}
    >
      <div className='flex items-end gap-3 pb-2 pt-3.5'>
        <label
          className={cn(
            'relative flex size-28 flex-none cursor-pointer items-center justify-center border bg-bgColor p-2 transition-colors duration-150 ease-out hover:border-textColor has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-textColor max-sm:size-30',
            bad ? 'border-error' : 'border-borderColor',
          )}
        >
          <input
            type='file'
            accept='image/png,image/jpeg'
            aria-label='logo'
            aria-invalid={bad || undefined}
            className='pointer-events-none absolute size-px opacity-0'
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {logo ? (
            <img src={logo.preview} alt='logo' className='block size-full object-contain' />
          ) : (
            <Text size='micro' variant='label' tracking='label' component='span'>
              logo
            </Text>
          )}
        </label>
        {logo && <SheetLink onClick={() => onLogo(null)}>remove</SheetLink>}
      </div>
      <SheetFoot left={<SheetLink onClick={onBack}>back</SheetLink>}>
        <span className='flex flex-row-reverse flex-wrap items-center gap-2 max-sm:w-full max-sm:flex-col'>
          <SheetSubmit disabled={!logo || busy === 'skip'} loading={busy === 'create'}>
            {primary}
          </SheetSubmit>
          <Button
            variant='secondary'
            size='lg'
            disabled={busy === 'create'}
            loading={busy === 'skip'}
            className='w-full py-2 sm:w-auto sm:min-w-[9.375rem]'
            onClick={() => onSend(false)}
          >
            skip
          </Button>
        </span>
      </SheetFoot>
    </SheetForm>
  );
}
