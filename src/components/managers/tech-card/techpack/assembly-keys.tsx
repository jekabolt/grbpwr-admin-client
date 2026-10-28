// Shared vocabulary of the Assembly table and the Step-by-step cards: one key drawing per
// technique, one printed instruction line and the STOP box, so both sections read the
// same. Colours are classes on the theme tokens (no literal colours in the drawings).
import { CalloutBox } from 'ui';

import { OpIconArt, type OpIcon } from 'components/managers/tech-card/op-icons';

import type { Seg, SvgMarkup } from './derive-assembly';
import { useT } from './i18n';

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
.asm-delta-line { display: inline-flex; align-items: center; gap: 4px; }
.asm-delta-bad { color: var(--color-error); font-weight: 700; }
.asm-letter { display: inline-flex; width: 3.4mm; height: 3.4mm; align-items: center; justify-content: center; flex: none; border-radius: 50%; background: var(--color-textColor); color: var(--color-bgColor); font-size: 10px; font-style: normal; font-weight: 700; line-height: 1; }
.asm-stop-in { display: flex; flex-direction: column; gap: 2px; }
.asm-slot { display: flex; align-items: flex-end; gap: 6px; margin-top: 4px; }
.asm-slot i { display: inline-block; flex: 1 1 auto; min-width: 20mm; height: 0; border-bottom: 1px solid var(--color-textColor); }
.asm-slot i.asm-slot-short { flex: 0 0 22mm; min-width: 22mm; }
`;

/** The one blocking check: what, who unblocks it, where to sign it off. */
export function StopBox({ text, n, className }: { text: string; n: number; className?: string }) {
  const { t } = useT();
  return (
    <CalloutBox tone='error' className={className}>
      <div className='asm-stop-in'>
        <b>{t('assembly.stop')}</b>
        <span>{text}</span>
        <span>{t('assembly.patternMakerHold', { op: n })}</span>
        <span className='asm-slot'>
          {t('assembly.resolvedBy')} <i /> {t('assembly.resolvedDate')}{' '}
          <i className='asm-slot-short' />
        </span>
      </div>
    </CalloutBox>
  );
}
