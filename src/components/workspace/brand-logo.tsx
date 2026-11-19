import { readLogo } from 'components/auth/logo';
import { cn } from 'lib/utility';
import { Button, Text } from 'ui';

// The logo square of the brand block (fix mockup `fLogo`): for an editor the square is the door,
// hatched with `logo` while empty, the picture once picked, `remove` under it; anyone else sees a
// bare square. PNG / JPEG of at most 1 MB (the server refuses SVG, W-spec §4).

/** The local pick: untouched, a new picture, or removed. */
export type LogoState =
  | { kind: 'keep' }
  | { kind: 'set'; base64: string; preview: string }
  | { kind: 'remove' };

const SQUARE =
  'relative flex size-30 flex-none items-center justify-center border bg-bgColor p-2.5 md:size-32';
const HATCH =
  'bg-[repeating-linear-gradient(135deg,var(--color-bgColor)_0_6px,var(--color-hairline)_6px_7px)]';

export function BrandLogo({
  src,
  live,
  bad,
  onPick,
  onBad,
}: {
  src: string;
  live: boolean;
  bad: boolean;
  onPick: (next: LogoState) => void;
  onBad: () => void;
}) {
  const pic = src ? <img src={src} alt='logo' className='block size-full object-contain' /> : null;

  if (!live)
    return (
      <div className='flex flex-col items-start gap-2'>
        <span className={cn(SQUARE, 'border-borderColor', !src && HATCH)}>{pic}</span>
      </div>
    );

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const read = await readLogo(file);
    if (!read) return onBad();
    onPick({ kind: 'set', base64: read.base64, preview: read.preview });
  };

  return (
    <div className='flex flex-col items-start gap-2'>
      <label
        className={cn(
          SQUARE,
          'cursor-pointer transition-colors duration-150 ease-out hover:border-textColor has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-textColor',
          bad ? 'border-error' : 'border-borderColor',
          !src && HATCH,
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
        {pic ?? (
          <Text size='micro' variant='label' component='span' className='bg-bgColor px-1'>
            logo
          </Text>
        )}
      </label>
      {src && (
        <Button variant='underline' onClick={() => onPick({ kind: 'remove' })}>
          remove
        </Button>
      )}
    </div>
  );
}
