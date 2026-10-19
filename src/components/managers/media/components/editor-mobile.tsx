import * as DialogPrimitives from '@radix-ui/react-dialog';
import { ASPECT_RATIOS } from 'constants/constants';
import { cn } from 'lib/utility';
import { ReactNode, useEffect, useState } from 'react';
import { Button, RatioGlyph } from 'ui';
import './cropper.css';

/**
 * МОБИЛЬНАЯ ОБОЛОЧКА КРОПА И ЭКСПАНДА (MEDIA-MOBILE, кадры 3 и 3').
 *
 * Ниже `lg` оба редактора — не модалка в модалке, а целый экран: шапка «cancel · заголовок ·
 * save copy», сцена на всю середину, компактная панель снизу. Всё, что здесь лежит, нужно ровно
 * двум экранам — кроппер и экспандер берут одно и то же, чтобы ряд пропорций и шапка у них не
 * разошлись. На `lg` и выше ничего из этого не рендерится.
 */

const MOBILE_QUERY = '(max-width: 1023px)';

/** Ниже `lg` (1024px) — мобильная раскладка редакторов. */
export function useIsMobileEditor(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

export type RatioOption = { key: string; label: string; value?: number };

/** Порядок макета: `free` первым, потом квадрат, портреты, пейзажи. */
const CHIP_ORDER = ['1:1', '4:5', '3:4', '9:16', '5:4', '4:3', '16:9', '2:1'];

export const RATIO_CHIPS: RatioOption[] = CHIP_ORDER.flatMap((label) => {
  const r = ASPECT_RATIOS.find((x) => x.label === label);
  return r ? [{ key: r.label, label: r.label, value: r.value }] : [];
});

export const FREE_CHIP: RatioOption = { key: 'free', label: 'free' };

/** Полноэкранный тёмный слой поверх всего, без рамки модалки. */
export function EditorScreen({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal container={document.body}>
        <DialogPrimitives.Content
          className='fixed inset-0 z-[var(--z-modal)] flex flex-col overflow-hidden bg-textColor pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-bgColor'
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitives.Title className='sr-only'>{title}</DialogPrimitives.Title>
          <DialogPrimitives.Description className='sr-only'>{title}</DialogPrimitives.Description>
          {children}
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}

export function EditorTopBar({
  title,
  onCancel,
  onSave,
  saveDisabled,
  busy,
  saveLabel = 'save copy',
}: {
  title: string;
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  busy?: boolean;
  saveLabel?: string;
}) {
  return (
    <div className='flex shrink-0 items-center justify-between gap-2 border-b border-bgColor/20 px-2'>
      <Button
        type='button'
        variant='underlineReverse'
        className='min-h-11 cursor-pointer px-2 text-control'
        onClick={onCancel}
        disabled={busy}
      >
        cancel
      </Button>
      <span className='text-micro font-bold uppercase tracking-section'>{title}</span>
      <Button
        type='button'
        variant={null}
        className='min-h-9 cursor-pointer border border-bgColor bg-bgColor px-3 text-control text-textColor disabled:opacity-40'
        onClick={onSave}
        disabled={saveDisabled || busy}
        loading={busy}
      >
        {saveLabel}
      </Button>
    </div>
  );
}

/** Ряд пропорций: глиф формы + подпись, выбранный залит; правый край растворяется. */
export function RatioChips({
  options,
  selected,
  onSelect,
  disabled,
}: {
  options: RatioOption[];
  selected: string | undefined;
  onSelect: (option: RatioOption) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role='radiogroup'
      aria-label='ratio'
      className='editor-chips flex gap-1.5 overflow-x-auto px-2.5'
    >
      {options.map((o) => {
        const on = o.key === selected;
        return (
          <Button
            key={o.key}
            type='button'
            role='radio'
            variant={null}
            aria-checked={on}
            disabled={disabled}
            onClick={() => onSelect(o)}
            className={cn(
              'flex h-13 min-w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 border px-2 text-micro uppercase tracking-label',
              on ? 'border-bgColor bg-bgColor text-textColor' : 'border-bgColor/30 text-bgColor/70',
            )}
          >
            <span className='flex h-5 items-center'>
              {o.value ? (
                <RatioGlyph width={o.value * 100} height={100} size={18} />
              ) : (
                <span
                  aria-hidden
                  className='inline-block h-3.5 w-4 border border-dashed border-current'
                />
              )}
            </span>
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}

/** Кнопка второй строки панели: 44px высотой, тонкая рамка. */
export const editorToolClass =
  'flex h-11 cursor-pointer items-center border border-bgColor/30 px-3 text-control text-bgColor disabled:opacity-40';
