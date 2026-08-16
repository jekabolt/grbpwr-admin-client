import { cn } from 'lib/utility';

/**
 * Полосатая поверхность «здесь пока пусто». Вынесена из компонента, потому что слот медиа рисует
 * её НА САМОЙ КНОПКЕ, а не внутри неё: обёртка вокруг ребёнка с `w-full` считает ширину по кругу и
 * схлопывается там, где размер задан ростом (`w-fit` + высота + пропорции).
 */
export const PLACEHOLDER_SURFACE: React.CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(45deg,#f4f4f4,#f4f4f4 6px,#ececec 6px,#ececec 12px)',
};

/** Рамка и типографика полосатой поверхности — то же, чем пользуется `Placeholder`. */
export function placeholderClass(opts?: { dashed?: boolean; tone?: 'default' | 'error' }) {
  return cn(
    'flex items-center justify-center border text-micro uppercase tracking-label',
    opts?.dashed ? 'border-dashed' : '',
    opts?.tone === 'error'
      ? 'border-error text-error'
      : 'border-borderColor text-textInactiveColor',
  );
}

/**
 * The striped "nothing here yet" surface. Every image slot and every unset tile uses
 * it — an empty white box reads as a bug, a striped one reads as a slot.
 */
export function Placeholder({
  label,
  aspect = 'auto',
  tone = 'default',
  dashed,
  className,
  style,
  children,
}: {
  label?: React.ReactNode;
  aspect?: 'auto' | 'square' | '3/4' | '4/3';
  tone?: 'default' | 'error';
  dashed?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const aspectClass =
    aspect === 'square'
      ? 'aspect-square'
      : aspect === '3/4'
        ? 'aspect-[3/4]'
        : aspect === '4/3'
          ? 'aspect-[4/3]'
          : '';
  return (
    <div
      style={{ ...PLACEHOLDER_SURFACE, ...style }}
      className={cn(placeholderClass({ dashed, tone }), aspectClass, className)}
    >
      {children ?? label}
    </div>
  );
}
