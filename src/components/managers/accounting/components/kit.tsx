import { cn } from 'lib/utility';
import { CSSProperties, ReactNode } from 'react';

// Shared presentational kit for the accounting module — the vocabulary from the design
// configurator (the brutalist-monochrome picker the owner approved), rebuilt on the app's own
// tokens (textColor #000 / bgColor #fff / textInactiveColor #ccc borders / labelColor #666 /
// bgSecondary #ededed / success green / error red, FeatureMono). Every screen composes these so
// the whole section reads identically to the picker. Money still formats through utils/format
// (AmountCell); the client never recomputes a reported figure — the only arithmetic here is on the
// bar/segment WIDTHS a caller passes in (a display proportion of server-sent numbers), the same
// sanctioned exception as the manual-entry balance preview.

type Tone = 'ok' | 'warn' | 'muted' | 'default';

const PILL_TONE: Record<Tone, string> = {
  ok: 'border-success text-success',
  warn: 'border-error text-error',
  muted: 'border-textInactiveColor text-labelColor',
  default: 'border-textColor text-textColor',
};

// Status chip — the picker's <span class="pill">. ok=green, warn=red, muted=grey, default=black.
export function Pill({
  tone = 'default',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap border px-1.5 text-[10px] uppercase leading-[1.4] tracking-wide',
        PILL_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// Bold plain-language takeaway line that opens a block (the picker's .verdict).
export function Verdict({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mb-2.5 font-bold text-textColor', className)}>{children}</p>;
}

// Small uppercase sub-group header inside a variant (.grp).
export function GroupHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mb-1 mt-3 border-b border-textInactiveColor pb-0.5 text-[10px] font-bold uppercase tracking-wide text-labelColor',
        className,
      )}
    >
      {children}
    </div>
  );
}

// Bordered callout. Neutral (.note) or attention/red (.leak). Lead text can be bolded by the caller.
export function Callout({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'attention';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border p-2.5 text-labelColor',
        tone === 'attention' ? 'border-error' : 'border-textInactiveColor',
        className,
      )}
    >
      {children}
    </div>
  );
}

// Muted footnote under a variant (.muted).
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mt-1.5 text-[10px] uppercase tracking-wide text-labelColor', className)}>
      {children}
    </div>
  );
}

// Auto-fit tile grid (.stats) — one bordered outer box, cells add the interior hairlines.
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] border border-textInactiveColor',
        className,
      )}
    >
      {children}
    </div>
  );
}

// One tile (.stat): uppercase label, a bold tabular value (green/red by tone, larger when big),
// an optional uppercase sub-line.
export function StatTile({
  label,
  value,
  sub,
  tone,
  big,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'up' | 'down';
  big?: boolean;
}) {
  return (
    <div className='border-b border-r border-textInactiveColor p-2.5'>
      <div className='text-[10px] uppercase tracking-wide text-labelColor'>{label}</div>
      <div
        className={cn(
          'mt-0.5 font-bold tabular-nums',
          big ? 'text-2xl' : 'text-lg',
          tone === 'up' && 'text-success',
          tone === 'down' && 'text-error',
        )}
      >
        {value}
      </div>
      {sub != null && <div className='mt-0.5 text-[10px] uppercase text-labelColor'>{sub}</div>}
    </div>
  );
}

// Label→value line (.rowline). `total` gives the bold top-ruled total row; `bold` just bolds.
export function RowLine({
  label,
  value,
  total,
  bold,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  total?: boolean;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2.5 py-1',
        total ? 'border-t border-textColor font-bold' : 'border-b border-textInactiveColor',
        bold && 'font-bold',
        className,
      )}
    >
      <span>{label}</span>
      <span className='tabular-nums'>{value}</span>
    </div>
  );
}

// Strong balance-check strip (.chk) — the A=L+E / debits=credits / cash-matches assertion.
export function CheckStrip({
  tone = 'ok',
  label,
  value,
  className,
}: {
  tone?: 'ok' | 'bad';
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-2 flex items-center justify-between gap-2.5 border p-2.5 font-bold',
        tone === 'ok' ? 'border-success text-success' : 'border-error text-error',
        className,
      )}
    >
      <span>{label}</span>
      <span className='tabular-nums'>{value}</span>
    </div>
  );
}

// Checklist row (.check-row) — a filled box when done, a hollow "·" box when pending.
export function CheckRow({ done, children }: { done?: boolean; children: ReactNode }) {
  return (
    <div className='flex items-center gap-2 py-1'>
      <span
        className={cn(
          'inline-flex h-[15px] w-[15px] flex-none items-center justify-center border border-textColor text-[10px] leading-none',
          done && 'bg-textColor text-bgColor',
        )}
      >
        {done ? '✓' : '·'}
      </span>
      <span>{children}</span>
    </div>
  );
}

// Two-column T-account frame (.tacct) with column + line helpers.
export function TAccount({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 border border-textInactiveColor', className)}>
      {children}
    </div>
  );
}
export function TColumn({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className='border-r border-textInactiveColor last:border-r-0'>
      <h4 className='border-b border-textInactiveColor bg-bgSecondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-labelColor'>
        {title}
      </h4>
      {children}
    </div>
  );
}
export function TLine({
  label,
  value,
  total,
  sub,
}: {
  label: ReactNode;
  value?: ReactNode;
  total?: boolean;
  sub?: boolean;
}) {
  if (sub) {
    return (
      <div className='border-b border-textInactiveColor bg-bgSecondary/40 px-2.5 py-1 text-[10px] uppercase tracking-wide text-labelColor'>
        {label}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'flex justify-between gap-2.5 px-2.5 py-1',
        total ? 'border-t border-textColor font-bold' : 'border-b border-textInactiveColor',
      )}
    >
      <span>{label}</span>
      <span className='tabular-nums'>{value}</span>
    </div>
  );
}

// Waterfall (.wf) — a running-total story. Each row: label, a bar positioned by left/width %, value.
export function Waterfall({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col', className)}>{children}</div>;
}
export function WaterfallRow({
  label,
  value,
  left = 0,
  width,
  kind = 'pos',
  keyRow,
  negValue,
}: {
  label: ReactNode;
  value: ReactNode;
  left?: number;
  width: number;
  kind?: 'pos' | 'neg' | 'fin';
  keyRow?: boolean;
  negValue?: boolean;
}) {
  const bar = kind === 'neg' ? 'bg-error/60' : kind === 'fin' ? 'bg-success' : 'bg-textColor';
  return (
    <div className='grid grid-cols-[minmax(120px,1.3fr)_2fr_96px] items-center gap-2.5 py-0.5'>
      <span className={cn(keyRow ? 'font-bold text-textColor' : 'text-labelColor')}>{label}</span>
      <span className='relative block h-[15px] bg-bgSecondary'>
        <span
          className={cn('absolute top-0 h-[15px]', bar)}
          style={{ left: `${clampPct(left)}%`, width: `${clampPct(width)}%` }}
        />
      </span>
      <span className={cn('text-right font-bold tabular-nums', negValue && 'text-error')}>
        {value}
      </span>
    </div>
  );
}

// Stacked bar (.stack) — "where each € goes". Segments carry a shade (grayscale data-viz ramp, plus
// var(--color-success) for the kept-profit slice); a legend renders beneath.
export type StackSegment = { label: string; pct: number; shade: string };
export function StackedBar({ segments }: { segments: StackSegment[] }) {
  return (
    <>
      <div className='flex h-[34px] border border-textColor'>
        {segments.map((s, i) => (
          <div
            key={i}
            className='flex h-full items-center justify-center overflow-hidden whitespace-nowrap text-[10px] text-bgColor'
            style={{ width: `${clampPct(s.pct)}%`, background: s.shade }}
          >
            {s.pct >= 8 ? s.label : ''}
          </div>
        ))}
      </div>
      <div className='mt-2 flex flex-wrap gap-2.5 text-[11px] text-labelColor'>
        {segments.map((s, i) => (
          <span key={i}>
            <i
              className='mr-1 inline-block h-2.5 w-2.5 align-middle'
              style={{ background: s.shade } as CSSProperties}
            />
            {s.label} {s.pct}%
          </span>
        ))}
      </div>
    </>
  );
}

// Ranked bar (.bar-row) — name, a proportional fill, a value. `green` uses the success fill.
export function BarRow({
  name,
  pct,
  value,
  green,
}: {
  name: ReactNode;
  pct: number;
  value: ReactNode;
  green?: boolean;
}) {
  return (
    <div className='grid grid-cols-[130px_1fr_120px] items-center gap-2.5 py-1'>
      <span className='truncate font-bold'>{name}</span>
      <span className='block h-[14px] bg-bgSecondary'>
        <span
          className={cn('block h-[14px]', green ? 'bg-success' : 'bg-textColor')}
          style={{ width: `${clampPct(pct)}%` }}
        />
      </span>
      <span className='text-right font-bold tabular-nums'>{value}</span>
    </div>
  );
}

// Grayscale ramp for stacked-bar cost segments (kept-profit uses the success token instead).
export const STACK_SHADES = ['#333333', '#666666', '#8a8a8a', '#b0b0b0', '#c9c9c9'];
export const STACK_PROFIT = 'var(--color-success)';

export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
