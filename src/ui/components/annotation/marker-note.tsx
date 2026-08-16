// ПИН С ЗАПИСКОЙ — подписной слой MARKER-режима.
//
// Карточная выноска это структурная сущность: у неё есть НОМЕР, на который ссылаются деталь кроя,
// операция и дефект, а текст живёт в форме и печатается таблицей. Поэтому на самой картинке стоит
// нумерованный маркер, а не плашка с текстом: текст на эскизе был бы второй копией таблицы, и две
// копии однажды разошлись бы.
//
// Второй режим подписи — ПЛАШКА (снимок шага сборки) — живёт в surface.tsx: там швея читает
// инструкцию с бумаги у машинки, и текст обязан стоять на снимке рядом со стрелкой.
//
// Файл вынесен из annotated-image.tsx как есть: тем же стикером пользуется карусель примерки,
// у которой свой зум и свой драг, и ей нужна ровно эта грамматика без общей поверхности.

'use client';

import * as Popover from '@radix-ui/react-popover';
import { cn } from 'lib/utility';
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import Text from '../text';

/** Геометрия указания, которую несёт маркер. Отрисовкой владеет поверхность, не этот файл. */
export type AnnotatedCallout = {
  /** Stable identity (use the RHF field-array `id`). */
  key: string;
  /** Number shown on the pin + note. */
  number: number;
  /** Normalised marker position, 0..1. */
  xNorm: number;
  yNorm: number;
  /** Whether the note already has text (drives the hollow "needs a note" pin). */
  hasText: boolean;
  /** Вид указания; пусто/`pin` — просто точка. */
  kind?: string;
  /** Якоря фигуры в долях кадра. */
  points?: { x: number; y: number }[];
  /** Цвет из закрытого списка; пусто = чернильный. */
  color?: string;
  /** Пунктирное начертание штриха фигуры. */
  dashed?: boolean;
  /** Штриховка области (только у зоны). */
  filled?: boolean;
};

const NOTE_GAP = 18; // px between a pin and its inline note (screen-constant)

// ---------------------------------------------------------------------------
// Pin — the numbered marker. forwardRef + prop-spread so it can be a Popover.Anchor.
// ---------------------------------------------------------------------------

// Reference `.pin`: a 16px ink circle carrying a 9px white number. `md` is one step up for the
// large annotate surfaces (a 16px drag target is fiddly on a full-bleed sketch).
export const pinSizes = {
  sm: 'size-4 text-nano',
  md: 'size-5 text-nano',
} as const;

/** Размер нумерованного маркера. `md` — для крупных поверхностей, `sm` — для плиток мудборда. */
export type PinSize = keyof typeof pinSizes;

type CalloutPinProps = {
  number: number;
  hasText: boolean;
  active?: boolean;
  size?: keyof typeof pinSizes;
  draggable?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export const CalloutPin = forwardRef<HTMLButtonElement, CalloutPinProps>(function CalloutPin(
  { number, hasText, active, size = 'md', draggable, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type='button'
      className={cn(
        // 1px everywhere (the system's only 2px rules are the section header, the active tab and a
        // selected tile). The ring is white on a filled pin so it still reads on a dark photo.
        'flex items-center justify-center rounded-full border leading-none tabular-nums transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
        pinSizes[size],
        hasText
          ? 'border-bgColor bg-textColor text-bgColor'
          : 'border-textColor bg-bgColor text-textColor',
        active && 'outline outline-1 outline-offset-2 outline-textColor',
        draggable ? 'cursor-move' : 'cursor-pointer',
        className,
      )}
      {...props}
    >
      {number}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Note shell — the popover panel grammar (white, 1px INK border, --shadow-popover, 240px; head
// ruled below in 10px bold uppercase; body px-2 py-1.5). Identical to `ui/components/popover`'s
// shell, hand-rolled here because the SAME card is also rendered INLINE in show-all mode, where a
// portalled Radix popover is not available. Body (`children`) is caller-supplied so each surface
// keeps its own RHF-bound fields; this only owns the frame, the number, and the remove control.
// ---------------------------------------------------------------------------

function StickyNote({
  number,
  title,
  editable,
  onRemove,
  className,
  children,
}: {
  number: number;
  title?: string;
  editable?: boolean;
  onRemove?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      // The note is an interactive child of the image surface (inline it lives inside the
      // transformed stage; as a hover Popover it is portalled but STILL bubbles through the React
      // tree). Swallow its pointer gestures so a press on the note body or the ✕ remove control can
      // never reach the Stage's background add-callout / pan handler — the root of the phantom
      // callout that used to appear when closing a note.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      className={cn(
        // text-textColor is explicit, not inherited: inside the media viewer the ambient ink is
        // white (dark lightbox), which on this white note would be invisible.
        'w-60 max-w-[min(15rem,72vw)] border border-textColor bg-bgColor text-left text-textColor',
        'shadow-[var(--shadow-popover)]',
        className,
      )}
    >
      <div className='flex items-center gap-1.5 border-b border-borderColor px-2 py-1'>
        <span className='flex size-4 shrink-0 items-center justify-center bg-textColor text-nano leading-none tabular-nums text-bgColor'>
          {number}
        </span>
        <Text
          size='micro'
          variant='uppercase'
          tracking='group'
          component='span'
          className='min-w-0 truncate font-bold'
        >
          {title || 'note'}
        </Text>
      </div>
      <div className='px-2 py-1.5'>
        {children}
        {editable && onRemove && (
          <button
            type='button'
            onClick={onRemove}
            aria-label={`remove callout ${number}`}
            className='mt-1.5 cursor-pointer text-micro uppercase tracking-label text-labelColor hover:text-error focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
          >
            ✕ remove pin
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ImageCallout — one pin plus its note. Compact mode shows the note in a portalled Popover on
// hover/focus (never clipped); show-all mode renders it inline so it tracks pan/zoom. Exported
// so a surface with its OWN zoom/pan (the fitting carousel) can reuse the exact pin + note
// grammar without adopting AnnotatedImage's frame — the caller owns drag state and passes
// `scale` + `showAll`.
// ---------------------------------------------------------------------------

export type ImageCalloutProps = {
  data: AnnotatedCallout;
  title?: string;
  /** Current stage scale, so the pin + note stay screen-constant under zoom. */
  scale: number;
  /** Show the note inline (view/zoom mode) instead of a hover Popover. */
  showAll: boolean;
  editable: boolean;
  pinSize?: keyof typeof pinSizes;
  /** Override the note width (e.g. a narrower card for the small fitting frames). */
  noteClassName?: string;
  dragging?: boolean;
  dragPos?: { x: number; y: number } | null;
  onPinPointerDown?: (e: ReactPointerEvent) => void;
  onRemove?: () => void;
  renderNote: (opts: { close: () => void }) => ReactNode;
  /** Указатель вошёл в пин / ушёл с него — Stage гасит по этому чужие фигуры. */
  onHoverChange?: (hovered: boolean) => void;
};

export function ImageCallout({
  data,
  title,
  scale,
  showAll,
  editable,
  pinSize = 'md',
  noteClassName,
  dragging = false,
  dragPos = null,
  onPinPointerDown,
  onRemove,
  renderNote,
  onHoverChange,
}: ImageCalloutProps) {
  const [open, setOpen] = useState(false);
  const pinnedRef = useRef(false); // clicked-open: survives pointer-leave
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const x = dragging && dragPos ? dragPos.x : data.xNorm;
  const y = dragging && dragPos ? dragPos.y : data.yNorm;
  const inv = 1 / (scale || 1);

  const clearClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const openNow = useCallback(() => {
    clearClose();
    setOpen(true);
  }, [clearClose]);
  const closeSoon = useCallback(() => {
    clearClose();
    closeTimer.current = setTimeout(() => {
      if (!pinnedRef.current) setOpen(false);
    }, 140);
  }, [clearClose]);
  useEffect(() => () => clearClose(), [clearClose]);

  const close = useCallback(() => {
    pinnedRef.current = false;
    setOpen(false);
  }, []);

  // Inline note (show-all): opens toward image centre so it stays on-frame; a 1px tail links
  // it back to the pin. Everything lives inside the inverse-scaled box, so px are screen px.
  const onRight = x <= 0.5;
  const inlineNoteStyle: React.CSSProperties = onRight
    ? { left: 0, top: 0, transform: `translate(${NOTE_GAP}px, -50%)` }
    : { left: 0, top: 0, transform: `translate(calc(-100% - ${NOTE_GAP}px), -50%)` };
  const tailStyle: React.CSSProperties = onRight
    ? { left: 0, top: 0, width: NOTE_GAP, transform: 'translateY(-0.5px)' }
    : { left: -NOTE_GAP, top: 0, width: NOTE_GAP, transform: 'translateY(-0.5px)' };

  return (
    <div
      className='pointer-events-none absolute'
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, zIndex: open ? 3 : 2 }}
    >
      <div style={{ transform: `scale(${inv})`, transformOrigin: '0 0' }}>
        {/* show-all tail + inline note */}
        {showAll && (
          <>
            <span
              aria-hidden
              className='pointer-events-none absolute block h-px bg-textColor'
              style={tailStyle}
            />
            <div className='pointer-events-auto absolute' style={inlineNoteStyle}>
              <StickyNote
                number={data.number}
                title={title}
                editable={editable}
                onRemove={onRemove}
                className={noteClassName}
              >
                {renderNote({ close })}
              </StickyNote>
            </div>
          </>
        )}

        {/* pin, centred on the anchor */}
        <Popover.Root open={!showAll && open} onOpenChange={(o) => (o ? openNow() : close())}>
          <Popover.Anchor asChild>
            {/* НАВЕДЕНИЕ ЖИВЁТ НА ОБЁРТКЕ, А НЕ НА КНОПКЕ. Эскиз выпущенной карточки лежит внутри
                общего `<fieldset disabled>`, а задизейбленность НАСЛЕДУЕТСЯ: нативный `<button>`
                под таким предком не получает ни клика, ни `pointerenter`. На кнопке висело сразу
                два ЧИТАТЕЛЬСКИХ жеста — всплытие записки и изоляция пересекающихся фигур, — и оба
                умирали ровно там, где карточку только и остаётся что читать. Правка (перетаскивание
                пина, клик-закрепление) остаётся на кнопке: её глушить как раз правильно. */}
            <div
              className='pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2'
              onPointerEnter={() => {
                onHoverChange?.(true);
                if (!showAll) openNow();
              }}
              onPointerLeave={() => {
                onHoverChange?.(false);
                if (!showAll) closeSoon();
              }}
            >
              <CalloutPin
                ref={pinRef}
                number={data.number}
                hasText={data.hasText}
                active={showAll || open}
                size={pinSize}
                draggable={editable}
                aria-label={`callout ${data.number}${data.hasText ? '' : ' (no note yet)'}`}
                aria-expanded={showAll ? undefined : open}
                onPointerDown={editable ? onPinPointerDown : undefined}
                onFocus={showAll ? undefined : openNow}
                onBlur={showAll ? undefined : closeSoon}
                onClick={(e) => {
                  e.stopPropagation();
                  if (showAll) return;
                  // Click / Enter / Space pins the note open and moves focus into it to edit.
                  // (Hover- and focus-open only "peek": autofocus is suppressed below so tabbing
                  // past a pin never yanks the caret into a note.)
                  pinnedRef.current = true;
                  setOpen(true);
                  requestAnimationFrame(() => contentRef.current?.focus());
                }}
              />
            </div>
          </Popover.Anchor>
          {!showAll && (
            <Popover.Portal>
              <Popover.Content
                ref={contentRef}
                side='top'
                align='center'
                sideOffset={6}
                collisionPadding={10}
                // `group` + `relative` so the tail below can read Radix's resolved `data-side`
                // and hang off the correct edge of the panel.
                className='group relative z-[var(--z-popover)] focus:outline-none'
                // Never auto-focus on open — opening is driven by hover/focus "peek"; the pin's
                // onClick focuses the content explicitly when the user actually wants to edit.
                onOpenAutoFocus={(e) => e.preventDefault()}
                onPointerEnter={clearClose}
                onPointerLeave={closeSoon}
                onEscapeKeyDown={() => {
                  close();
                  pinRef.current?.focus();
                }}
              >
                <StickyNote
                  number={data.number}
                  title={title}
                  editable={editable}
                  onRemove={onRemove}
                  className={noteClassName}
                >
                  {renderNote({ close })}
                </StickyNote>
                {/* The reference's tail: an 8px square rotated 45°, inheriting the panel's ink
                    border on the two outward sides so it reads as the panel pointing rather than
                    as a separate diamond. Painted after the panel, so its white fill hides the
                    border segment it sits on. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-1/2 size-2 -translate-x-1/2 rotate-45 border-textColor bg-bgColor',
                    'group-data-[side=top]:-bottom-[5px] group-data-[side=top]:border-b group-data-[side=top]:border-r',
                    'group-data-[side=bottom]:-top-[5px] group-data-[side=bottom]:border-l group-data-[side=bottom]:border-t',
                    'group-data-[side=left]:hidden group-data-[side=right]:hidden',
                  )}
                />
              </Popover.Content>
            </Popover.Portal>
          )}
        </Popover.Root>
      </div>
    </div>
  );
}

