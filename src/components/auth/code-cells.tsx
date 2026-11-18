import { useEffect, useRef, useState } from 'react';
import { Button, Input, Text } from 'ui';

const LEN = 6;

/** Six one-digit cells. A paste (or a phone's code autofill) fills all of them at once. */
export function CodeCells({
  onChange,
  invalid,
  autoFocus = true,
}: {
  onChange: (code: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [cells, setCells] = useState<string[]>(() => Array(LEN).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const commit = (next: string[], focus: number) => {
    setCells(next);
    onChange(next.join(''));
    refs.current[Math.min(LEN - 1, Math.max(0, focus))]?.focus();
  };

  const fill = (from: number, digits: string) => {
    const next = [...cells];
    let i = from;
    for (const d of digits) {
      if (i >= LEN) break;
      next[i++] = d;
    }
    commit(next, i);
  };

  return (
    <div className='flex gap-1.5' role='group' aria-label='code'>
      {cells.map((c, i) => (
        <Input
          key={i}
          ref={(el: HTMLInputElement | null) => {
            refs.current[i] = el;
          }}
          name={`code-${i}`}
          value={c}
          inputMode='numeric'
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          className='h-12 w-10 p-0 text-center text-lg'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const digits = e.target.value.replace(/\D/g, '');
            if (!digits) {
              const next = [...cells];
              next[i] = '';
              commit(next, i);
              return;
            }
            // a typed digit replaces the cell; an autofill drops the whole code here
            fill(i, digits.length > 1 && c ? digits.slice(-1) : digits);
          }}
          onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => {
            const digits = e.clipboardData.getData('text').replace(/\D/g, '');
            if (!digits) return;
            e.preventDefault();
            fill(digits.length >= LEN ? 0 : i, digits);
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Backspace' && !c && i > 0) {
              e.preventDefault();
              const next = [...cells];
              next[i - 1] = '';
              commit(next, i - 1);
            } else if (e.key === 'ArrowLeft') refs.current[i - 1]?.focus();
            else if (e.key === 'ArrowRight') refs.current[i + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}

export const CODE_LEN = LEN;

const WAIT_S = 45;

/** `resend`, then `sent · resend in 0:45` counting down. Starts counting when the code was just sent. */
export function Resend({
  onResend,
  startWaiting = true,
}: {
  onResend: () => Promise<unknown>;
  startWaiting?: boolean;
}) {
  const [until, setUntil] = useState(() => (startWaiting ? Date.now() + WAIT_S * 1000 : 0));
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));

  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [left]);

  if (left > 0)
    return (
      <Text size='micro' variant='label' component='span' className='tabular-nums'>
        {sent && <span className='text-success'>sent · </span>}
        resend in 0:{String(left).padStart(2, '0')}
      </Text>
    );
  return (
    <Button
      variant='underline'
      className='text-labelColor hover:text-textColor'
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onResend();
          setSent(true);
          setUntil(Date.now() + WAIT_S * 1000);
        } finally {
          setBusy(false);
        }
      }}
    >
      resend
    </Button>
  );
}
