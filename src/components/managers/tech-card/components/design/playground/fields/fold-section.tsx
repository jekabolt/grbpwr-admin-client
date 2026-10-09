import { useState, type JSX, type ReactNode } from 'react';

import { GroupLabel } from 'ui/components/group-label';
import { HeaderNote } from 'ui/components/section-header';

import { Fold } from '../../head/mood-organs';
import { FieldGlyph, InfoTip, type FieldGlyphName } from './glyphs';

/**
 * ═══ ONE SECTION OF A PLAYGROUND FORM (C-02) ═════════════════════════════════════════════════════
 *
 * The owner's references head every section the same way: a glyph, a title, then on the right a
 * REQUIRED mark and/or the section's current value («9:16», «standard», «Off», a swatch and a code),
 * and a chevron that folds it. Here that is the studio's `Fold` (a `GroupLabel` with the `show ▸` /
 * `hide ▾` door), so a folded section reads exactly like every other fold of the band.
 *
 * THE VALUE IN THE HEADER IS THE POINT OF FOLDING. A folded Format still says 2:3, so a person can
 * leave it shut and still know what the run will get. Give `value` whenever the section has one;
 * pass `'—'` for «nothing chosen» rather than leaving the slot blank.
 *
 * `collapsible={false}` draws the same header without the door (a prompt that must stay open).
 * Open state is the caller's when `open` is given, otherwise the section keeps its own, starting at
 * `defaultOpen`.
 */
export type FoldSectionProps = {
  title: string;
  glyph?: FieldGlyphName;
  /** The REQUIRED mark on the right of the header. */
  required?: boolean;
  /** The current value, shown on the right of the header, open or folded. */
  value?: ReactNode;
  /** A footnote on the title (ⓘ with a tooltip). */
  info?: string;
  collapsible?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  /** Probe anchor; lands as `data-fold-section`. */
  anchor?: string;
};

export function FoldSection({
  title,
  glyph,
  required,
  value,
  info,
  collapsible = true,
  open,
  defaultOpen = true,
  onOpenChange,
  children,
  className,
  anchor,
}: FoldSectionProps): JSX.Element {
  const [own, setOwn] = useState(defaultOpen);
  const shown = open ?? own;
  const toggle = () => {
    const next = !shown;
    if (open === undefined) setOwn(next);
    onOpenChange?.(next);
  };

  const label = (
    <span className='inline-flex items-center gap-2'>
      {glyph && <FieldGlyph name={glyph} />}
      <span>{title}</span>
      {info && <InfoTip label={title}>{info}</InfoTip>}
    </span>
  );

  const side =
    required || value != null ? (
      <span className='flex items-center gap-2.5'>
        {required && <HeaderNote tone='ink'>required</HeaderNote>}
        {value != null && (
          <span
            className='inline-flex items-center gap-1.5 text-micro text-labelColor'
            data-fold-value=''
          >
            {value}
          </span>
        )}
      </span>
    ) : undefined;

  // Body air: the header rule, then 12px before the first control, and 4px under the last one.
  // Sections themselves are spaced by the panel (C-03), not here.
  const body = <div className='pb-1 pt-3'>{children}</div>;

  if (!collapsible) {
    return (
      <div className={className} data-fold-section={anchor ?? title}>
        <GroupLabel flush action={side}>
          {label}
        </GroupLabel>
        {body}
      </div>
    );
  }

  return (
    <Fold
      className={className}
      data-fold-section={anchor ?? title}
      label={label}
      action={side}
      open={shown}
      onToggle={toggle}
    >
      {body}
    </Fold>
  );
}
