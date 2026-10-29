// Shared vocabulary of the Assembly table and the Step-by-step cards: one key drawing and one
// printed instruction line per technique. Colours are classes on the theme tokens.
import { OpIconArt, type OpIcon } from 'components/managers/tech-card/op-icons';

import type { Seg, SvgMarkup } from './derive-assembly';

/** The turn-out key printed under a join that is bagged out. */
export const TURN_KEY: OpIcon = { key: 'turn_out' };

/** One key drawing from the shared op-icon registry, in ink (grey + dashed when unresolved). */
export function KeyArt({
  icon,
  w,
  h,
  className,
}: {
  icon: OpIcon;
  w: number;
  h: number;
  className?: string;
}) {
  return (
    <span
      className={['asm-key', icon.missing && 'asm-key-missing', className]
        .filter(Boolean)
        .join(' ')}
    >
      <OpIconArt icon={icon} w={w} h={h} />
    </span>
  );
}

/** A derived drawing (markup built by derive-assembly from the card's own numbers). */
export function Svg({ m, w, h, label }: { m: SvgMarkup; w: number; h: number; label?: string }) {
  return (
    <svg
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      width={w}
      height={h}
      viewBox={m.viewBox}
      preserveAspectRatio='xMidYMid meet'
      dangerouslySetInnerHTML={{ __html: m.body }}
    />
  );
}

/** The instruction line as printed: segments joined by « · », missing data in red. */
export function Line({ segs, className }: { segs: readonly Seg[]; className?: string }) {
  if (!segs.length) return null;
  return (
    <div className={className}>
      {segs.map((g, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {g.bad ? <b className='tpa-bad'>{g.t}</b> : g.t}
        </span>
      ))}
    </div>
  );
}

export const KEYS_CSS = String.raw`
.tpa-s { stroke: var(--color-textColor); }
.tpa-sl { stroke: var(--color-labelColor); }
.tpa-sw { stroke: var(--color-bgColor); }
.tpa-sn { stroke: none; }
.tpa-fn { fill: none; }
.tpa-fk { fill: var(--color-textColor); }
.tpa-fw { fill: var(--color-bgColor); }
.tpa-fh { fill: var(--color-hairline); }
.tpa-fp { fill: var(--color-pageBg); }
.tpa-asm-code { fill: var(--color-textColor); font-family: FeatureMono, monospace; font-weight: 700; paint-order: stroke; stroke: var(--color-bgColor); stroke-width: 2px; stroke-linejoin: round; }
.tpa-asm-unit { fill: var(--color-labelColor); font-family: FeatureMono, monospace; paint-order: stroke; stroke: var(--color-bgColor); stroke-width: 2px; stroke-linejoin: round; }
.tpa-asm-missing { fill: var(--color-error); font-family: FeatureMono, monospace; font-weight: 700; paint-order: stroke; stroke: var(--color-bgColor); stroke-width: 2px; stroke-linejoin: round; }
.tpa-bad { color: var(--color-error); font-weight: 700; }
.asm-key { display: inline-flex; flex: none; color: var(--color-textColor); line-height: 0; }
.asm-key-missing { color: var(--color-labelColor); }
.asm-key-missing svg * { stroke-dasharray: 2 2; }
.asm-joinpic { position: relative; width: fit-content; }
.asm-badge { position: absolute; left: 0; top: 0; padding: 1px; background: var(--color-bgColor); }
.asm-delta { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 2px; white-space: nowrap; }
.asm-delta-metric { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.asm-delta-line { display: inline-flex; align-items: center; gap: 4px; }
.asm-delta-bad { color: var(--color-error); font-weight: 700; }
`;
