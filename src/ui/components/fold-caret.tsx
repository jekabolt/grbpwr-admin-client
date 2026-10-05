import { cn } from 'lib/utility';

/**
 * ═══ ONE DISCLOSURE GLYPH (owner, item 40) ═══════════════════════════════════════════════════════
 *
 * «везде где есть колапсящиеся элементы то там всегда должна быть типо стрелочка вниз вверх везде
 * одинаковая». Every toggle that folds or unfolds something carries this caret and nothing else:
 * pointing DOWN while the thing is folded (there is more below), turned 180° to point UP while it
 * is open (fold it back). The chevron is the one `ui/icons/arrow` draws for a folding `Section`
 * (8×4, 1.33 stroke, round ends), here in a tight 10px box so it sits inside a micro word.
 * T60 (05.10, «кривая стрелочка»): drawn at 7px, the glyph centred in its box, and seated on the
 * baseline — a 7px box on the baseline centres on the CAPS of a micro word (cap ≈ 0.7em); in a flex
 * row the row's `items-center` does it. One size,
 * one stroke, a 150ms turn, no turn under reduced motion. The
 * stroke is `currentColor`, so the caret takes the word of its door (grey door, grey caret; hover
 * darkens both together).
 *
 * NOT for doors that navigate or open a menu (`open in studio ›`, `the flat bench ›`, `use for ▾`):
 * a caret here promises «this folds in place».
 *
 * It brings its own 4px gap from the word before it; callers write `hide<FoldCaret …/>`, no space.
 *
 * Probes read `[data-fold-caret]`: its value is `open` or `folded` (`details` inside a native
 * `<details>`, whose own `open` is the state).
 */
export function FoldCaret({
  open,
  className,
}: {
  /** `'details'`: the caret sits in the `<summary>` of a native `<details className='group'>` and
   *  turns with it (`group-open:`); the state is then the `open` of that `<details>`. */
  open: boolean | 'details';
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      focusable='false'
      viewBox='0 0 10 10'
      width={7}
      height={7}
      data-fold-caret={open === 'details' ? 'details' : open ? 'open' : 'folded'}
      className={cn(
        'ml-1 inline-block shrink-0 align-baseline transition-transform duration-150 ease-out motion-reduce:transition-none',
        open === 'details' ? 'group-open:rotate-180' : open && 'rotate-180',
        className,
      )}
    >
      <path
        d='M1 3 5 7 9 3'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.6'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}
