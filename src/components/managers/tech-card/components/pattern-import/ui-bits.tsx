// Small shared pieces of the wizard, all built on the admin's own primitives (Text, Input, the
// Input field metric for native selects). Nothing here is new design: these are the metrics of
// ui/components/input.tsx and the panel grammar of assembly-fullscreen.tsx, named once.
import { useState } from 'react';
import { cn } from 'lib/utility';
import { FoldCaret } from 'ui/components/fold-caret';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

// A caret drawn in the field's own label grey, so the select reads as a select without OS chrome.
const CARET: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 5'%3E%3Cpath d='M0 0h8L4 5z' fill='%23666'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 6px center',
  backgroundSize: '8px 5px',
};

/**
 * A native select in the EXACT metric of `Input` (22px, 1px edge, 3/7 padding): a row that mixes
 * inputs and selects stays one height — the owner's rule, "inputs in one row are one size".
 */
export function NativeSelect({
  value,
  onChange,
  options,
  className,
  invalid,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  className?: string;
  invalid?: boolean;
  [k: string]: unknown;
}) {
  return (
    <select
      {...rest}
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'block h-[22px] min-w-0 appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] text-textBaseSize focus:border-textColor focus:outline-none',
        'aria-[invalid=true]:border-error',
        'pr-5',
        className,
      )}
      style={CARET}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A number field in the Input metric; commits on blur or Enter, not per keystroke. */
export function NumberField({
  value,
  onCommit,
  className,
  step = 'any',
  min,
  ...rest
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  className?: string;
  step?: string;
  min?: number;
  [k: string]: unknown;
}) {
  return (
    <Input
      {...rest}
      type='number'
      key={value ?? 'empty'}
      defaultValue={value ?? ''}
      step={step}
      min={min}
      className={cn('h-[22px] tabular-nums', className)}
      onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
        const v = e.currentTarget.value.trim();
        const n = v === '' ? null : Number(v);
        if (n !== value && (n === null || Number.isFinite(n))) onCommit(n);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/** One labelled control: 10px grey label above, control below. */
export function Field({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      {children}
    </label>
  );
}

/** The inspector column / canvas frame: one white block on the grey ground. */
export function Panel({
  title,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col border border-borderColor bg-bgColor',
        className,
      )}
    >
      {title != null && (
        <div className='flex shrink-0 items-baseline gap-2 border-b border-hairline px-2 py-1'>
          <Text
            size='micro'
            variant='uppercase'
            tracking='label'
            component='span'
            className='min-w-0 truncate font-bold'
          >
            {title}
          </Text>
          {aside && <span className='ml-auto flex items-baseline gap-1.5'>{aside}</span>}
        </div>
      )}
      <div className={cn('min-h-0 flex-1 overflow-y-auto p-2', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Canvas + inspector, the shape every geometric step shares (the marker editor's shape). */
export function SplitStage({
  canvas,
  side,
  sideWidth = 360,
  sideShare = 42,
}: {
  canvas: React.ReactNode;
  side: React.ReactNode;
  sideWidth?: number;
  /** The most of the stage the side column may take, %, on a narrow window (1024 px). */
  sideShare?: number;
}) {
  return (
    <div
      className='grid h-full min-h-0 gap-2 [&>*]:min-h-0 [&>*]:min-w-0'
      style={{ gridTemplateColumns: `minmax(0,1fr) min(${sideWidth}px, ${sideShare}%)` }}
    >
      {canvas}
      {side}
    </div>
  );
}

/**
 * The column that holds a row's required answer (confirm, draw, fold?) stays pinned to the right
 * edge of a `DataTable` that scrolls sideways: at 1024 px the footer asks for an answer, and the
 * answer must be on screen. Put it on the `th` and every `td` of that column, with the row's own
 * background (`bg-bgColor`, or the zebra of a selected row) so the scrolled cells pass under it.
 * The left rule is a pseudo-element: in `border-collapse` a sticky cell does not carry its border.
 */
export const STICKY_END =
  'sticky right-0 z-[var(--z-sticky)] before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-hairline';

export const fmtMm = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)} mm`;
export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)} %`;
export const fmtBytes = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

/** A small sample of a line style: how the legend says which dash pattern it means. */
export function DashSample({
  dash,
  width = 64,
  tone = '#111111',
}: {
  dash: number[] | null;
  width?: number;
  tone?: string;
}) {
  return (
    <svg width={width} height={8} aria-hidden className='inline-block align-middle'>
      <line
        x1={0}
        y1={4}
        x2={width}
        y2={4}
        stroke={tone}
        strokeWidth={1.5}
        strokeDasharray={dash && dash.length ? dash.map((d) => d * 1.6).join(' ') : undefined}
      />
    </svg>
  );
}

// ═══ THE ASK CONTRACT (`data-ask`) ════════════════════════════════════════════════════════════════
//
// The wizard footer carries ONE ask line: the step's blocker (else the autopilot's stop reason,
// else the step's offer). That sentence is a link: clicking it scrolls to and focuses the control
// that answers it. The shell does not know the steps' controls; the steps MARK them:
//
//   <Chip {...ask('scale-confirm')} …>it is 100 mm</Chip>       // or data-ask='scale-confirm'
//   <NumberField {...ask('scale-measured')} … />
//   <Fold ask='sheet-grid' label='set the grid by hand'>…</Fold> // folded answer: the fold opens
//
// Rules (PR2–PR5):
// * Put `data-ask="<step>-<what>"` on every control that ANSWERS the current blocker or offer,
//   and only while it answers it (render the attribute conditionally, or let the control be
//   `disabled` — disabled / `aria-disabled` / hidden controls are skipped).
// * DOCUMENT ORDER IS PRIORITY: the first live `[data-ask]` inside the stage wins. Blocker
//   sentences are ordered the way the controls are, so the first unanswered control is right.
// * An answer that lives inside a closed `Fold`: give the Fold `ask` — its toggle carries
//   `data-ask` while folded; the link opens it and then focuses the first `[data-ask]` inside.
// * Nothing marked → the link falls back to the first `[aria-invalid="true"]` control; nothing
//   at all → it does nothing (the sentence still reads as the instruction).
// * The key is free text for probes and debugging; the shell does not match on it.

/** Spread onto a control that answers the footer's ask line: `<Chip {...ask('sizes-confirm')}>`. */
export const ask = (key: string, on = true) => (on ? { 'data-ask': key } : {});

const usable = (el: HTMLElement) =>
  !el.matches(':disabled, [aria-disabled="true"]') && el.getClientRects().length > 0;

/**
 * The ask line's door: scroll to and focus the first live `[data-ask]` under `root`, open a folded
 * one first. Returns whether a control was found. A short ring marks it (a programmatic focus
 * after a mouse click shows no focus-visible ring).
 */
export function focusAsk(root: ParentNode | null, depth = 0): boolean {
  if (!root) return false;
  const pick = (sel: string) =>
    Array.from(root.querySelectorAll<HTMLElement>(sel)).find(usable) ?? null;
  const el = pick('[data-ask]') ?? pick('[aria-invalid="true"]');
  if (!el) return false;
  // a folded answer: open the fold, let React render it, then look again inside
  if (el.dataset.askFold === 'folded' && depth < 2) {
    el.click();
    requestAnimationFrame(() => {
      if (!focusAsk(root, depth + 1)) mark(el);
    });
    return true;
  }
  mark(el);
  return true;
}

function mark(el: HTMLElement) {
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  el.focus({ preventScroll: true });
  const before = el.style.outline;
  const offset = el.style.outlineOffset;
  el.style.outline = '2px solid var(--color-warning)';
  el.style.outlineOffset = '2px';
  window.setTimeout(() => {
    el.style.outline = before;
    el.style.outlineOffset = offset;
  }, 1200);
}

// ═══ FOLD ═════════════════════════════════════════════════════════════════════════════════════════

/**
 * What the operator does not need in order to continue lives behind ONE fold per group: a quiet
 * micro word with the system's `FoldCaret`, the content below it. No border (a fold inside a
 * `Panel` is a group, not a block). Controlled (`open` + `onOpenChange`) or `defaultOpen`.
 * `ask`: the fold holds the answer to the footer's ask line (see THE ASK CONTRACT above) —
 * pass it with `defaultOpen`/`open` true when the step itself knows it asks (e.g. a suggested row).
 */
export function Fold({
  label,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ask: askKey,
  className,
  children,
}: {
  label: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  ask?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const open = openProp ?? own;
  const toggle = () => {
    if (openProp === undefined) setOwn(!open);
    onOpenChange?.(!open);
  };
  return (
    <div className={cn('mt-2 flex flex-col gap-1', className)} data-fold={open ? 'open' : 'folded'}>
      <button
        type='button'
        aria-expanded={open}
        onClick={toggle}
        {...(askKey && !open ? { 'data-ask': askKey, 'data-ask-fold': 'folded' } : {})}
        className='flex items-center self-start text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
      >
        <Text size='micro' tracking='label' component='span' className='uppercase'>
          {label}
        </Text>
        <FoldCaret open={open} />
      </button>
      {open && <div className='min-w-0'>{children}</div>}
    </div>
  );
}

/**
 * Engineering diagnostics (votes, factors, p95, gate values, chains lines): a `Fold` labelled
 * `diagnostics`, rendered ONLY with `?debug=1` in the address. The error report keeps carrying
 * all of it regardless; this is a move out of sight, not a deletion.
 */
export const debugUi = () =>
  typeof window !== 'undefined' &&
  ['1', ''].includes(new URLSearchParams(window.location.search).get('debug') ?? 'x');

export function DebugFold({
  label = 'diagnostics',
  className,
  children,
}: {
  label?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  if (!debugUi()) return null;
  return (
    <Fold label={label} className={className}>
      {children}
    </Fold>
  );
}
