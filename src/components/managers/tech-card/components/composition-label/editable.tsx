// ЗНАЧЕНИЕ — ЭТО ДВЕРЬ (дизайн §2.2). Строка составника показывает своё значение; щелчок по нему
// превращает его в поле этой строки, Enter / уход фокуса записывает в форму (→ автосейв), Escape
// возвращает как было. Отдельной кнопки «edit» нет нигде. Строка, чьё значение переопределено,
// несёт ЕДИНСТВЕННЫЙ свой контрол — «↺ derived».
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import Text from 'ui/components/text';
import type { LineKey } from './label-lines';

/** Смена «значение → поле»: 150 мс прозрачности; при reduced-motion — сразу (global.css). */
export const SWAP = 'composition-line-in';

/** Строка составника: имя строки · значение · откуда (или «↺ derived»). */
export function LineRow({
  line,
  name,
  source,
  overridden,
  onReset,
  resetLabel,
  children,
  highlight,
}: {
  line: LineKey;
  name: string;
  /** Откуда значение, когда его не правили: brand, colourway, style care, BOM, company… */
  source: string;
  overridden?: boolean;
  onReset?: () => void;
  /** Что вернёт «↺ derived» — для подсказки. */
  resetLabel?: string;
  children: React.ReactNode;
  /** Строка, к которой только что привела дыра. */
  highlight?: boolean;
}) {
  return (
    <div
      data-line={line}
      data-overridden={overridden ? '' : undefined}
      className={cn(
        'grid grid-cols-[88px_minmax(0,1fr)] gap-x-6 gap-y-1 border-b border-hairline py-4 last:border-b-0 sm:grid-cols-[112px_minmax(0,1fr)_auto]',
        highlight && 'bg-bgZebra',
      )}
    >
      <Text size='micro' variant='label' className='pt-1 uppercase tracking-label'>
        {name}
      </Text>
      <div className='min-w-0'>{children}</div>
      <div className='col-start-2 sm:col-start-auto sm:pt-1 sm:text-right'>
        {overridden && onReset ? (
          <button
            type='button'
            data-reset={line}
            onClick={onReset}
            title={resetLabel ? `back to ${resetLabel}` : 'back to the derived value'}
            className={cn(
              SWAP,
              'cursor-pointer whitespace-nowrap text-micro uppercase tracking-label text-textColor underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            )}
          >
            ↺ derived
          </button>
        ) : (
          <Text size='micro' variant='label' className='whitespace-nowrap uppercase tracking-label'>
            {overridden ? 'edited' : source}
          </Text>
        )}
      </div>
    </div>
  );
}

/** Показ значения, который и есть дверь в его правку. */
export function ValueDoor({
  children,
  onOpen,
  disabled,
  title,
  className,
  ...rest
}: {
  children: React.ReactNode;
  onOpen: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  [k: string]: unknown;
}) {
  return (
    <button
      type='button'
      disabled={disabled}
      title={disabled ? title : title ?? 'click to change'}
      onClick={onOpen}
      className={cn(
        SWAP,
        '-mx-1.5 block w-[calc(100%+12px)] cursor-text px-1.5 py-0.5 text-left transition-colors hover:bg-bgZebra focus-visible:outline focus-visible:outline-1 focus-visible:outline-textColor disabled:cursor-default disabled:hover:bg-transparent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Одна строка: Enter / уход фокуса — записать, Escape — отменить. */
export function EditableText({
  value,
  placeholder,
  onCommit,
  disabled,
  display,
  ariaLabel,
  maxLength,
}: {
  value: string;
  placeholder?: string;
  onCommit: (text: string) => void;
  disabled?: boolean;
  /** Как значение выглядит в покое (по умолчанию — само значение). */
  display?: React.ReactNode;
  ariaLabel: string;
  maxLength?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  if (!editing)
    return (
      <ValueDoor
        disabled={disabled}
        onOpen={() => {
          cancelled.current = false;
          setDraft(value);
          setEditing(true);
        }}
        aria-label={`${ariaLabel}: ${value || placeholder || 'empty'} — click to change`}
      >
        <span className='uppercase'>
          {display ?? (value || <span className='text-labelColor'>{placeholder}</span>)}
        </span>
      </ValueDoor>
    );
  return (
    <input
      autoFocus
      aria-label={ariaLabel}
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelled.current = true;
          setEditing(false);
        }
      }}
      onBlur={() => {
        if (!cancelled.current) onCommit(draft);
        setEditing(false);
      }}
      className={cn(
        SWAP,
        'block min-h-[22px] w-full rounded-none border border-textColor bg-bgColor px-[7px] py-[3px] uppercase focus:outline-none',
      )}
    />
  );
}

/** Несколько строк (строка ленты = строка поля): уход фокуса — записать, Escape — отменить. */
export function EditableLines({
  lines,
  placeholder,
  onCommit,
  disabled,
  ariaLabel,
  hint,
}: {
  lines: readonly string[];
  placeholder?: string;
  onCommit: (text: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lines.join('\n'));
  const cancelled = useRef(false);
  if (!editing)
    return (
      <ValueDoor
        disabled={disabled}
        onOpen={() => {
          cancelled.current = false;
          setDraft(lines.join('\n'));
          setEditing(true);
        }}
        aria-label={`${ariaLabel} — click to change`}
      >
        {lines.length ? (
          <span className='flex flex-col uppercase'>
            {lines.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </span>
        ) : (
          <span className='text-labelColor'>{placeholder}</span>
        )}
      </ValueDoor>
    );
  return (
    <div className={cn(SWAP, 'flex flex-col gap-1')}>
      <textarea
        autoFocus
        aria-label={ariaLabel}
        value={draft}
        rows={Math.max(2, draft.split('\n').length)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancelled.current = true;
            setEditing(false);
          }
        }}
        onBlur={() => {
          if (!cancelled.current) onCommit(draft);
          setEditing(false);
        }}
        className='block w-full resize-none rounded-none border border-textColor bg-bgColor px-[7px] py-[3px] uppercase focus:outline-none'
      />
      {hint ? (
        <Text size='micro' variant='label'>
          {hint}
        </Text>
      ) : null}
    </div>
  );
}
