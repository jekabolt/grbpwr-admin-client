import { MinusIcon, PlusIcon } from '@radix-ui/react-icons';
import { cn } from 'lib/utility';
import type { ReactNode } from 'react';
import { Button, Chip } from 'ui';
import {
  AdjustRange,
  adjustIsZero,
  type AdjustParams,
  type AnnotateColor,
} from './media-viewer-zoom';

/*
 * ═══ ПАНЕЛИ РЕЖИМОВ ПРОСМОТРЩИКА (viewer-unify V1) ════════════════════════════════════════════
 *
 * Мокап владельца (https://claude.ai/artifact/1PhkQ7Z6DSxXdapBBur5z3): режим открывает панель ПОД
 * снимком на телефоне и СПРАВА от него на десктопе — и никогда поверх. Раньше коррекция и перо
 * жили в плавающем тулбаре над нижним краем кадра и закрывали ровно ту часть снимка, которую
 * правили. Здесь только органы панелей; какой режим открыт и что делает `save`, решает
 * `MediaViewer`.
 *
 * Тон один на оба макета — тёмный, как сцена: десктопная панель стоит там же, где «details», а та
 * тёмная по той же причине (белая колонка у снимка светила бы в глаза).
 */

/** Phone band under the stage vs. the desktop column beside it: the same organs, two layouts. */
export type ViewerLayout = 'phone' | 'desk';

/** `Chip` on the dark stage: a hair outline, the picked one in full white. */
const STAGE_CHIP = 'min-h-8 bg-transparent px-2.5 py-1.5 tracking-label';
const stageChip = (selected: boolean) =>
  cn(
    STAGE_CHIP,
    selected
      ? 'border-bgColor text-bgColor'
      : 'border-bgColor/20 text-bgColor/60 hover:border-bgColor/40 hover:text-bgColor',
  );

/** An underlined word on the dark stage: cancel, reset, undo, clear. */
export function ViewerWord({
  children,
  className,
  disabled,
  onClick,
  probe,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  probe?: string;
}) {
  return (
    <Button
      variant='underlineReverse'
      size='xs'
      disabled={disabled}
      onClick={onClick}
      data-probe={probe}
      className={cn('min-h-8 underline-offset-4 disabled:no-underline', className)}
    >
      {children}
    </Button>
  );
}

/** The one filled control of a mode: `save`. */
export function ViewerSave({
  onClick,
  disabled,
  saving,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  saving?: boolean;
  className?: string;
}) {
  return (
    <Button
      size='sm'
      disabled={disabled || saving}
      onClick={onClick}
      data-probe='viewer-save'
      className={cn('min-h-8 bg-bgColor text-textColor disabled:opacity-40', className)}
    >
      {saving ? 'saving…' : 'save'}
    </Button>
  );
}

/** Phone top row while a mode is open: `cancel · <mode> · save`. */
export function ModeHeader({
  title,
  onCancel,
  onSave,
  saveDisabled,
  saving,
}: {
  title: string;
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  saving?: boolean;
}) {
  return (
    <div className='relative z-10 flex min-h-12 shrink-0 items-center gap-2 px-3 lg:hidden'>
      <span className='flex flex-1 justify-start'>
        <ViewerWord className='min-h-11 text-textBaseSize' onClick={onCancel}>
          cancel
        </ViewerWord>
      </span>
      <span className='text-textBaseSize uppercase'>{title}</span>
      <span className='flex flex-1 justify-end'>
        <ViewerSave
          className='min-h-9 text-textBaseSize'
          disabled={saveDisabled}
          saving={saving}
          onClick={onSave}
        />
      </span>
    </div>
  );
}

/**
 * Where a mode's organs live. Phone: a band under the stage with a hair rule on top — the stage
 * shrinks to make room. Desk: a column to the right of the stage, like `details`, with
 * `cancel · save` at its foot (the phone has them in the top row instead).
 */
export function ModeDock({
  layout,
  title,
  headerAction,
  children,
  onCancel,
  onSave,
  saveDisabled,
  saving,
}: {
  layout: ViewerLayout;
  title: string;
  /** Desk: a word on the right of the column's title (adjust's `reset`). */
  headerAction?: ReactNode;
  children: ReactNode;
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  saving?: boolean;
}) {
  if (layout === 'phone') {
    return (
      <div
        data-probe='viewer-mode-panel'
        className='flex shrink-0 flex-col gap-3 border-t border-bgColor/20 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3'
      >
        {children}
      </div>
    );
  }
  return (
    <aside
      data-probe='viewer-mode-panel'
      className='flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l border-bgColor/20 p-3'
    >
      <div className='flex min-h-8 items-center justify-between gap-2 text-micro uppercase tracking-label'>
        <span>{title}</span>
        {headerAction}
      </div>
      {children}
      <span className='flex-1' />
      <div className='flex items-center justify-between gap-2'>
        <ViewerWord onClick={onCancel}>cancel</ViewerWord>
        <ViewerSave disabled={saveDisabled} saving={saving} onClick={onSave} />
      </div>
    </aside>
  );
}

/* ── ADJUST ─────────────────────────────────────────────────────────────────────────────────── */

export type AdjustKnob = keyof AdjustParams;

const KNOBS: { key: AdjustKnob; chip: string; name: string; min: number; max: number }[] = [
  { key: 'brightness', chip: 'brightness', name: 'brightness', min: -100, max: 100 },
  { key: 'contrast', chip: 'contrast', name: 'contrast', min: -100, max: 100 },
  { key: 'black', chip: 'black pt', name: 'black point', min: 0, max: 50 },
];

function shownValue(key: AdjustKnob, v: number): string {
  if (key === 'black') return `${v}%`;
  return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0';
}

/**
 * Phone (frame 2): three chips pick the knob, ONE big slider drives it, `reset` under it.
 * Desk (frame 6): all three sliders stacked, `reset` in the column's title row.
 */
export function AdjustTools({
  layout,
  values,
  onChange,
  onReset,
  status,
  knob,
  onKnobChange,
}: {
  layout: ViewerLayout;
  values: AdjustParams;
  onChange: (next: AdjustParams) => void;
  onReset: () => void;
  status: 'idle' | 'loading' | 'ready' | 'failed';
  /** Phone: which of the three knobs the one big slider drives. */
  knob: AdjustKnob;
  onKnobChange: (k: AdjustKnob) => void;
}) {
  // Пока подложка не привезена, ручки заперты — и сказано почему: ползунок, который двигается и
  // ничего не делает, хуже отсутствующего.
  const live = status === 'ready';
  const note = live ? null : (
    <span className='text-micro text-bgColor/60'>
      {status === 'failed' ? 'pixels unreadable' : 'reading pixels…'}
    </span>
  );
  const set = (key: AdjustKnob, v: number) => onChange({ ...values, [key]: v });

  if (layout === 'phone') {
    const active = KNOBS.find((k) => k.key === knob) ?? KNOBS[0]!;
    return (
      <>
        <div role='radiogroup' aria-label='Adjustment' className='flex flex-wrap gap-1.5'>
          {KNOBS.map((k) => (
            <Chip
              key={k.key}
              role='radio'
              aria-checked={k.key === knob}
              className={stageChip(k.key === knob)}
              onClick={() => onKnobChange(k.key)}
            >
              {k.chip}
            </Chip>
          ))}
        </div>
        <div className='flex items-center gap-3'>
          <AdjustRange
            big
            name={active.name}
            probe={active.key}
            min={active.min}
            max={active.max}
            value={values[active.key]}
            valueText={shownValue(active.key, values[active.key])}
            disabled={!live}
            onChange={(v) => set(active.key, v)}
          />
          <span className='w-10 shrink-0 text-right text-textBaseSize tabular-nums'>
            {shownValue(active.key, values[active.key])}
          </span>
        </div>
        <div className='flex min-h-8 items-center justify-between gap-2'>
          {note ?? <span />}
          <ViewerWord probe='adjust-reset' disabled={adjustIsZero(values)} onClick={onReset}>
            reset
          </ViewerWord>
        </div>
      </>
    );
  }

  return (
    <>
      {KNOBS.map((k) => (
        <label key={k.key} className='flex flex-col gap-1'>
          <span className='flex justify-between text-micro uppercase tracking-label'>
            <span className='text-bgColor/70'>{k.name}</span>
            <span className='tabular-nums'>{shownValue(k.key, values[k.key])}</span>
          </span>
          <AdjustRange
            name={k.name}
            probe={k.key}
            min={k.min}
            max={k.max}
            value={values[k.key]}
            valueText={shownValue(k.key, values[k.key])}
            disabled={!live}
            onChange={(v) => set(k.key, v)}
          />
        </label>
      ))}
      {note}
    </>
  );
}

/* ── DRAW ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * Frame 4: colour swatches, `thin | thick`, then `undo · clear`. The swatches are squares — the
 * system has no radius, and a swatch is a sample of ink, not a pill.
 */
export function DrawTools({
  layout,
  colors,
  color,
  onColorChange,
  widths,
  width,
  onWidthChange,
  hasStrokes,
  onUndo,
  onClear,
}: {
  layout: ViewerLayout;
  colors: AnnotateColor[];
  color: string;
  onColorChange: (c: string) => void;
  widths: readonly { name: string; value: number }[];
  width: number;
  onWidthChange: (w: number) => void;
  hasStrokes: boolean;
  onUndo: () => void;
  onClear: () => void;
}) {
  const swatches = (
    <div role='radiogroup' aria-label='Pen color' className='flex items-center gap-3.5'>
      {colors.map((c) => (
        <Button
          key={c.value}
          role='radio'
          aria-checked={color === c.value}
          aria-label={`${c.name} pen`}
          title={c.name}
          onClick={() => onColorChange(c.value)}
          style={{ backgroundColor: c.value }}
          className={cn(
            'size-6 shrink-0 border border-bgColor/40',
            color === c.value && 'outline outline-2 outline-offset-2 outline-bgColor',
          )}
        >
          <span className='sr-only'>{c.name}</span>
        </Button>
      ))}
    </div>
  );
  const weights = (
    <div role='radiogroup' aria-label='Pen weight' className='flex items-center gap-1.5'>
      {widths.map((w) => (
        <Chip
          key={w.value}
          role='radio'
          aria-checked={width === w.value}
          className={stageChip(width === w.value)}
          onClick={() => onWidthChange(w.value)}
        >
          {w.name}
        </Chip>
      ))}
    </div>
  );
  const edits = (
    <div className='flex min-h-8 items-center justify-between gap-2'>
      <ViewerWord disabled={!hasStrokes} onClick={onUndo}>
        undo
      </ViewerWord>
      <ViewerWord disabled={!hasStrokes} onClick={onClear}>
        clear
      </ViewerWord>
    </div>
  );

  if (layout === 'phone') {
    return (
      <>
        <div className='flex items-center gap-3'>
          {swatches}
          <span className='flex-1' />
          {weights}
        </div>
        {edits}
      </>
    );
  }
  return (
    <>
      {swatches}
      {weights}
      {edits}
    </>
  );
}

/* ── DESK ZOOM ──────────────────────────────────────────────────────────────────────────────── */

/** Desktop zoom in the top bar, beside the counter: never a box floating over the picture. */
export function ZoomControls({
  scale,
  canZoomIn,
  canZoomOut,
  isZoomed,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  scale: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  isZoomed: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  const square =
    'flex size-7 items-center justify-center border border-bgColor/20 text-bgColor hover:border-bgColor disabled:opacity-30';
  return (
    <span className='flex items-center gap-1'>
      <Button
        aria-label='Zoom out'
        title='zoom out'
        className={square}
        disabled={!canZoomOut}
        onClick={onZoomOut}
      >
        <MinusIcon className='size-3.5' />
      </Button>
      <Button
        aria-label='Reset zoom'
        title='reset zoom'
        size='xs'
        onClick={onReset}
        disabled={!isZoomed}
        className='min-w-12 text-center tabular-nums text-bgColor disabled:cursor-default disabled:opacity-100'
      >
        {Math.round(scale * 100)}%
      </Button>
      <Button
        aria-label='Zoom in'
        title='zoom in'
        className={square}
        disabled={!canZoomIn}
        onClick={onZoomIn}
      >
        <PlusIcon className='size-3.5' />
      </Button>
    </span>
  );
}
