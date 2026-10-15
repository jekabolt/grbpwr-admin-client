// Small shared pieces of the wizard, all built on the admin's own primitives (Text, Input, the
// Input field metric for native selects). Nothing here is new design: these are the metrics of
// ui/components/input.tsx and the panel grammar of assembly-fullscreen.tsx, named once.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
//   at all → the coach bubble sits over the primary with the sentence alone.
// * The key is free text for probes and debugging; the shell does not match on it.
//
// COACH MODE (owner: "click next, next, next — and where a human is needed, show the zone and how").
// The footer primary is never disabled by a blocker: clicking it while something blocks (or the
// ask line, at any time) focuses the answering control as above, then HIGHLIGHTS ITS ZONE and puts
// a small bubble next to it: what is asked (the footer sentence) + how to answer it. Two more
// attributes, both optional, both read off the DOM at click time:
//
//   <section data-ask-zone>                       // the card / region the decision lives in:
//     …                                           // the nearest ancestor of the [data-ask]
//     <Chip {...ask('pieces-gap', 'click both ends of the gap on the sheet')}>close the gap</Chip>
//   </section>                                    // control is outlined + tinted blue
//
// * `data-ask-zone` (no value): put it on the panel / card / table region that holds the
//   decision — wide enough that the operator sees WHERE (the row + its controls, the sheet + its
//   tool strip), not the whole stage. Missing → the control itself is the zone.
// * `data-ask-hint="<how, imperative, lower case, no full stop>"`: HOW to answer, on the
//   `[data-ask]` control (the second argument of `ask()` sets it), or on the zone for a hint shared
//   by every control in it. Missing → the bubble shows the footer sentence alone.
// * The highlight stays until the operator acts inside the zone (pointer, key, input), presses ✕,
//   or the blocker changes; nothing else on screen is dimmed.

/**
 * Spread onto a control that answers the footer's ask line: `<Chip {...ask('sizes-confirm')}>`.
 * `hint`: how to answer (the coach bubble's second line) — `data-ask-hint`.
 */
export const ask = (key: string, on: boolean | string = true, hint?: string) => {
  const h = typeof on === 'string' ? on : hint;
  if (on === false) return {};
  return h ? { 'data-ask': key, 'data-ask-hint': h } : { 'data-ask': key };
};

const usable = (el: HTMLElement) =>
  !el.matches(':disabled, [aria-disabled="true"]') && el.getClientRects().length > 0;

/** The first live answer control under `root` (no focus, no fold opened). */
export function firstAsk(root: ParentNode | null): HTMLElement | null {
  if (!root) return null;
  const pick = (sel: string) =>
    Array.from(root.querySelectorAll<HTMLElement>(sel)).find(usable) ?? null;
  return pick('[data-ask]') ?? pick('[aria-invalid="true"]');
}

/**
 * The ask line's door: scroll to and focus the first live `[data-ask]` under `root`, open a folded
 * one first. Returns whether a control was found. A short ring marks it (a programmatic focus
 * after a mouse click shows no focus-visible ring). `onFound` gets the control finally focused
 * (inside the opened fold, or the fold's toggle when the fold holds none) — the coach's anchor.
 */
export function focusAsk(
  root: ParentNode | null,
  onFound?: (el: HTMLElement) => void,
  depth = 0,
): boolean {
  const el = firstAsk(root);
  if (!el) return false;
  // a folded answer: open the fold, let React render it, then look again inside
  if (el.dataset.askFold === 'folded' && depth < 2) {
    el.click();
    requestAnimationFrame(() => {
      if (!focusAsk(root, onFound, depth + 1)) {
        mark(el);
        onFound?.(el);
      }
    });
    return true;
  }
  mark(el);
  onFound?.(el);
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

// ═══ ASK COACH ════════════════════════════════════════════════════════════════════════════════════

/** The zone a control's decision lives in (`data-ask-zone`), else the control itself. */
export const askZoneOf = (el: HTMLElement): HTMLElement =>
  el.closest<HTMLElement>('[data-ask-zone]') ?? el;

/** How to answer: the control's `data-ask-hint`, else its zone's (only up to the zone). */
export function askHintOf(el: HTMLElement): string | null {
  const zone = askZoneOf(el);
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const h = n.getAttribute('data-ask-hint');
    if (h) return h;
    if (n === zone) break;
  }
  return null;
}

export type CoachTarget = {
  /** The control that answers (anchor of the bubble when the zone is too big to sit beside). */
  el: HTMLElement;
  /** What is asked: the footer sentence. */
  text: string;
  /** Bumped on every coach click: the zone pulses again. */
  n: number;
  /** No control was found: the bubble sits over this element (the primary), nothing is lit. */
  bare?: boolean;
};

// one pulse of the tint, then the calm state; the outline sits inside the zone so a scroller's
// overflow does not clip it
const COACH_CSS = `
[data-ask-coached]{outline:2px solid #2323ff!important;outline-offset:-2px!important;box-shadow:inset 0 0 0 100vmax rgb(35 35 255 / .06)!important;animation:ask-coach-pulse 900ms ease-out 1}
@keyframes ask-coach-pulse{0%{box-shadow:inset 0 0 0 100vmax rgb(35 35 255 / .2)}100%{box-shadow:inset 0 0 0 100vmax rgb(35 35 255 / .06)}}
@media (prefers-reduced-motion: reduce){[data-ask-coached]{animation:none}}
`;

const BUBBLE_W = 260;
const GAP = 8;

type Box = { left: number; top: number; right: number; bottom: number };

/**
 * Beside the zone (below, above, left, right — the first that fits inside `area`), else under /
 * over the control. `area` = the stage: the bubble never covers the footer's primary.
 */
function place(zone: Box, ctl: Box, h: number, area: Box) {
  const clampX = (x: number) => Math.min(Math.max(area.left, x), area.right - BUBBLE_W);
  const clampY = (y: number) => Math.min(Math.max(area.top, y), area.bottom - h);
  if (zone.bottom + GAP + h <= area.bottom)
    return { left: clampX(zone.left), top: zone.bottom + GAP };
  if (zone.top - GAP - h >= area.top) return { left: clampX(zone.left), top: zone.top - GAP - h };
  if (zone.left - GAP - BUBBLE_W >= area.left)
    return { left: zone.left - GAP - BUBBLE_W, top: clampY(ctl.top) };
  if (zone.right + GAP + BUBBLE_W <= area.right)
    return { left: zone.right + GAP, top: clampY(ctl.top) };
  return ctl.bottom + GAP + h <= area.bottom
    ? { left: clampX(ctl.left), top: ctl.bottom + GAP }
    : { left: clampX(ctl.left), top: clampY(ctl.top - GAP - h) };
}

/**
 * Coach mode's picture: the zone outlined + tinted (one pulse), a fixed bubble beside it with
 * what is asked and how. Fixed-position inside the dialog: no overflow container clips it. It
 * goes away on ✕, on any act inside the zone, or when the zone leaves the page; the shell drops
 * it when the blocker changes.
 */
export function AskCoach({
  target,
  onClose,
  area,
}: {
  target: CoachTarget;
  onClose: () => void;
  /** Where the bubble may sit (the stage); the viewport when absent or for a bare bubble. */
  area?: HTMLElement | null;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const zone = target.bare ? null : askZoneOf(target.el);
  const hint = target.bare ? null : askHintOf(target.el);
  // the zone: lit, pulsing once per coach click, unlit on any act inside it
  useEffect(() => {
    if (!zone) return;
    zone.removeAttribute('data-ask-coached');
    void zone.offsetWidth; // restart the pulse
    zone.setAttribute('data-ask-coached', '');
    const acted = () => close.current();
    const evs = ['pointerdown', 'keydown', 'input', 'change'] as const;
    // a tick later: the click that opened a fold for us must not count as the operator's act
    const t = window.setTimeout(() => evs.forEach((e) => zone.addEventListener(e, acted, true)), 0);
    return () => {
      window.clearTimeout(t);
      evs.forEach((e) => zone.removeEventListener(e, acted, true));
      zone.removeAttribute('data-ask-coached');
    };
  }, [zone, target.n]);
  // the bubble follows the zone through scrolls and resizes
  useLayoutEffect(() => {
    let raf = 0;
    const tick = () => {
      const b = box.current;
      const anchor = zone ?? target.el;
      if (!anchor.isConnected) return close.current();
      if (b) {
        const view = {
          left: GAP,
          top: GAP,
          right: window.innerWidth - GAP,
          bottom: window.innerHeight - GAP,
        };
        const a = !target.bare && area ? area.getBoundingClientRect() : null;
        const p = place(
          anchor.getBoundingClientRect(),
          target.el.getBoundingClientRect(),
          b.offsetHeight,
          a
            ? {
                left: Math.max(view.left, a.left),
                top: Math.max(view.top, a.top),
                right: Math.min(view.right, a.right),
                bottom: Math.min(view.bottom, a.bottom),
              }
            : view,
        );
        b.style.left = `${Math.round(p.left)}px`;
        b.style.top = `${Math.round(p.top)}px`;
        b.style.visibility = 'visible';
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [zone, target.el, target.bare, area]);
  return (
    <>
      <style>{COACH_CSS}</style>
      <div
        ref={box}
        role='status'
        aria-live='polite'
        data-testid='pattern-import-coach'
        className='fixed z-[var(--z-popover)] flex flex-col gap-1 border border-textColor bg-bgColor px-2 py-1.5 shadow-[var(--shadow-popover)]'
        style={{ width: BUBBLE_W, left: 0, top: 0, visibility: 'hidden' }}
      >
        <span className='flex items-start gap-2'>
          <Text size='micro' component='p' className='min-w-0 flex-1 text-warning'>
            ! {target.text}
          </Text>
          <button
            type='button'
            aria-label='close the hint'
            className='-mr-0.5 shrink-0 leading-none text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            onClick={onClose}
          >
            <Text size='micro' component='span'>
              ✕
            </Text>
          </button>
        </span>
        {hint && hint !== target.text && (
          <Text size='micro' component='p' data-testid='pattern-import-coach-hint'>
            {hint}
          </Text>
        )}
      </div>
    </>
  );
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
