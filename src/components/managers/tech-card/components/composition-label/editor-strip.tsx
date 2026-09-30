// ПОЛОСА ПРАВКИ ПОД СТОРОНОЙ (R-11). Открывается щелчком по значению на ленте, стоит прямо под
// той стороной, где значение напечатано; открыта всегда одна. Шапка говорит, что правится и откуда
// оно берётся; у переопределённого значения там же — ЕДИНСТВЕННЫЙ его сброс «↺ use derived».
import { isBlocking, type Hole } from '../../care-labels/holes';
import { cn } from 'lib/utility';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { SWAP } from './editable';
import type { LineKey } from './label-lines';

export function EditorStrip({
  line,
  name,
  where,
  source,
  overridden,
  resetTitle,
  onReset,
  holes,
  foot,
  children,
}: {
  line: LineKey;
  /** Что правится: `colour name`. */
  name: string;
  /** Где напечатано: `A face`. */
  where: string;
  /** Откуда значение, пока его не правили. */
  source: string;
  overridden?: boolean;
  /** Во что вернёт сброс — подсказка кнопки. */
  resetTitle?: string;
  onReset?: () => void;
  holes: readonly Hole[];
  /** Подсказка под полями: `Enter saves · Esc cancels`. */
  foot?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(SWAP, 'flex min-w-0 flex-col gap-4 pt-4')}
      data-region-editor={line}
      role='group'
      aria-label={`${name} on the ${where}`}
    >
      <div className='flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-borderColor pb-1'>
        <Text size='micro' tracking='group' component='span' className='font-bold uppercase'>
          {name}
        </Text>
        <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
          {where}
        </Text>
        <span className='ml-auto flex items-baseline gap-4'>
          <Text
            size='micro'
            variant='label'
            component='span'
            className='uppercase tracking-label'
            data-editor-source=''
          >
            {overridden ? 'edited' : source}
          </Text>
          {overridden && onReset ? (
            <button
              type='button'
              data-reset={line}
              onClick={onReset}
              title={resetTitle ? `back to ${resetTitle}` : 'back to the derived value'}
              className='cursor-pointer whitespace-nowrap text-micro uppercase tracking-label text-textColor underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              ↺ use derived
            </button>
          ) : null}
        </span>
      </div>
      {holes.length ? (
        <ul className='flex flex-col gap-1.5'>
          {holes.map((h) => (
            <li
              key={`${h.code}|${h.message}`}
              className='flex items-start gap-2'
              data-hole={h.code}
            >
              <Pill tone={isBlocking(h) ? 'warn' : 'attention'}>
                {isBlocking(h) ? 'blocks' : 'warn'}
              </Pill>
              <Text size='micro' className='min-w-0'>
                {h.message}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}
      {children}
      {foot ? (
        <Text size='micro' variant='label'>
          {foot}
        </Text>
      ) : null}
    </div>
  );
}
