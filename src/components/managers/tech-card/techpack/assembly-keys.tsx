// Shared vocabulary of the Assembly table and the Step-by-step cards: one key drawing per
// technique, one printed instruction line, the STOP box and the legend, so both sections read the
// same. Colours are classes on the theme tokens (no literal colours in the drawings).
import type { ReactNode } from 'react';
import { CalloutBox } from 'ui';

import type { Seg, SvgMarkup, Tech } from './derive-assembly';

const IRON = 'M8 22 Q11 13 21 12 H34 Q37 12 37 15 V22 Z';
const IRON_HANDLE = 'M16 12 Q17 6 22 6 H31 Q34 6 34 9 V12';

/** The stroke of every key line: ink, no fill, round joins. */
const S = {
  className: 'tpa-s tpa-fn',
  strokeWidth: 1.4,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
};

export function KeyArt({ tech, w, h }: { tech: Tech; w: number; h: number }) {
  const mk = `url(#tpk-ar-${tech})`;
  const hatch = `url(#tpk-h-${tech})`;
  let body: ReactNode;
  switch (tech) {
    case 'press':
      body = (
        <>
          <rect x='3' y='26' width='42' height='5' className='tpa-s tpa-fw' strokeWidth='1.2' />
          <path d={IRON} {...S} transform='translate(0 2)' />
          <path d={IRON_HANDLE} {...S} transform='translate(0 2)' />
          <path d='M12 37 H36' {...S} strokeWidth='1.1' markerStart={mk} markerEnd={mk} />
        </>
      );
      break;
    case 'pressSide':
      body = (
        <>
          <path d='M2 32 H24 M24 32 H46' {...S} strokeWidth='2' />
          <path d='M24 32 V27' {...S} strokeWidth='1' strokeDasharray='1.5 1.5' />
          <path d='M24 32 Q24 27 29 27 H40' {...S} strokeWidth='1.6' />
          <path d='M24 32 Q25 29.5 29 29.5 H38' {...S} strokeWidth='1.2' />
          <path d='M18 22 Q20 14 31 17' {...S} strokeWidth='1.1' markerEnd={mk} />
          <g transform='translate(25 -1) scale(.55)'>
            <path d={IRON} {...S} strokeWidth='2.2' />
            <path d={IRON_HANDLE} {...S} strokeWidth='2.2' />
          </g>
        </>
      );
      break;
    case 'pressFinal':
      body = (
        <>
          <rect x='3' y='30' width='42' height='5' className='tpa-s tpa-fh' strokeWidth='1.2' />
          <path d={IRON} {...S} transform='translate(0 6)' />
          <path d={IRON_HANDLE} {...S} transform='translate(0 6)' />
          <path
            d='M14 9 q-2 -2 0 -4 t0 -4 M22 9 q-2 -2 0 -4 t0 -4 M30 9 q-2 -2 0 -4 t0 -4'
            {...S}
            strokeWidth='1'
          />
        </>
      );
      break;
    case 'topstitch':
      body = (
        <>
          <rect x='4' y='3' width='36' height='31' className='tpa-s tpa-fw' strokeWidth='1' />
          <path d='M40 3 V34' {...S} strokeWidth='2.4' />
          <path d='M34 3 V34' {...S} strokeWidth='1.3' strokeDasharray='3 2' strokeLinecap='butt' />
          <path d='M34 35 V41 M40 35 V41' {...S} strokeWidth='.8' />
          <path d='M34 39 H40' {...S} strokeWidth='.8' markerStart={mk} markerEnd={mk} />
        </>
      );
      break;
    case 'buttonhole':
      body = (
        <>
          <rect x='15' y='2' width='18' height='38' className='tpa-s tpa-fw' strokeWidth='1' />
          {[5, 16, 27].map((y) => (
            <g key={y}>
              <path d={`M22 ${y} V${y + 8} M26 ${y} V${y + 8}`} {...S} strokeWidth='1' />
              <path
                d={`M21 ${y} H27 M21 ${y + 8} H27`}
                {...S}
                strokeWidth='2'
                strokeLinecap='butt'
              />
              <path d={`M24 ${y + 1.5} V${y + 6.5}`} {...S} strokeWidth='.7' />
            </g>
          ))}
        </>
      );
      break;
    case 'button':
      body = (
        <>
          <circle cx='24' cy='21' r='15' className='tpa-s tpa-fw' strokeWidth='1.4' />
          <circle cx='24' cy='21' r='11' className='tpa-sl tpa-fn' strokeWidth='.7' />
          {[
            [-4, -4],
            [4, -4],
            [-4, 4],
            [4, 4],
          ].map(([dx, dy]) => (
            <circle
              key={`${dx}${dy}`}
              cx={24 + dx}
              cy={21 + dy}
              r='1.8'
              className='tpa-s tpa-fw'
              strokeWidth='.9'
            />
          ))}
          <path d='M20 17 L28 25 M28 17 L20 25' {...S} strokeWidth='1.8' />
        </>
      );
      break;
    case 'bind':
      body = (
        <>
          <path d='M2 21 H33' {...S} strokeWidth='2.2' />
          <path
            d='M12 14 H34 Q41 14 41 21 Q41 28 34 28 H12'
            className='tpa-s tpa-fh'
            strokeWidth='1.3'
          />
          <path d='M2 21 H34' {...S} strokeWidth='2.2' />
          <path
            d='M18 9 V33'
            {...S}
            strokeWidth='1.2'
            strokeDasharray='2.5 1.8'
            strokeLinecap='butt'
          />
        </>
      );
      break;
    case 'hand':
      body = (
        <>
          <rect x='3' y='31' width='42' height='6' className='tpa-s tpa-fw' strokeWidth='1' />
          <path d='M5 31 H43' {...S} strokeWidth='1.4' strokeDasharray='3 3' strokeLinecap='butt' />
          <path d='M12 27 L39 5' {...S} strokeWidth='1.6' />
          <ellipse
            cx='37'
            cy='6.8'
            rx='1.6'
            ry='.8'
            transform='rotate(-39 37 6.8)'
            className='tpa-s tpa-fw'
            strokeWidth='.8'
          />
          <path d='M37 7 Q46 14 40 22 T30 30' {...S} className='tpa-sl tpa-fn' strokeWidth='.9' />
        </>
      );
      break;
    case 'overlock':
      body = (
        <>
          <rect x='3' y='12' width='34' height='18' className='tpa-s tpa-fw' strokeWidth='1' />
          <path d='M30 12 L37 21 L30 30 M33 12 L40 21 L33 30' {...S} strokeWidth='1' />
          <path d='M37 12 V30' {...S} strokeWidth='2' />
        </>
      );
      break;
    case 'turn':
      body = (
        <>
          <rect
            x='2'
            y='14'
            width='16'
            height='22'
            fill={hatch}
            className='tpa-s'
            strokeWidth='1.2'
          />
          <rect x='30' y='14' width='16' height='22' className='tpa-s tpa-fw' strokeWidth='1.2' />
          <path d='M12 11 Q24 0 36 11' {...S} strokeWidth='1.3' markerEnd={mk} />
        </>
      );
      break;
    default:
      body = (
        <>
          <rect x='3' y='12' width='42' height='8' className='tpa-s tpa-fw' strokeWidth='1' />
          <rect x='3' y='20' width='42' height='8' fill={hatch} className='tpa-s' strokeWidth='1' />
          <path d='M3 20 H45' {...S} strokeWidth='1.4' strokeDasharray='3 2' />
        </>
      );
  }
  return (
    <svg
      className='asm-key'
      aria-hidden
      width={w}
      height={h}
      viewBox='0 0 48 42'
      preserveAspectRatio='xMidYMid meet'
    >
      <defs>
        <marker
          id={`tpk-ar-${tech}`}
          viewBox='0 0 8 8'
          refX='7'
          refY='4'
          markerWidth='5'
          markerHeight='5'
          orient='auto-start-reverse'
        >
          <path d='M0 0 L8 4 L0 8 Z' className='tpa-fk' />
        </marker>
        <pattern
          id={`tpk-h-${tech}`}
          width='3'
          height='3'
          patternUnits='userSpaceOnUse'
          patternTransform='rotate(45)'
        >
          <line x1='0' y1='0' x2='0' y2='3' className='tpa-sl' strokeWidth='.8' />
        </pattern>
      </defs>
      {body}
    </svg>
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
.tpa-bad { color: var(--color-error); font-weight: 700; }
.asm-delta { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 2px; white-space: nowrap; }
.asm-delta-line { display: inline-flex; align-items: center; gap: 4px; }
.asm-delta-bad { color: var(--color-error); font-weight: 700; }
.asm-letter { display: inline-flex; width: 3.4mm; height: 3.4mm; align-items: center; justify-content: center; flex: none; background: var(--color-textColor); color: var(--color-bgColor); font-size: 10px; font-style: normal; font-weight: 700; line-height: 1; }
.asm-stop-in { display: flex; flex-direction: column; gap: 2px; }
.asm-slot { display: flex; align-items: flex-end; gap: 6px; margin-top: 4px; }
.asm-slot i { display: inline-block; flex: 1 1 auto; min-width: 20mm; height: 0; border-bottom: 1px solid var(--color-textColor); }
.asm-slot i.asm-slot-short { flex: 0 0 22mm; min-width: 22mm; }
.asm-legend { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 4px 14px; margin-top: 6px; padding-top: 5px; border-top: 1px solid var(--color-hairline); color: var(--color-labelColor); font-size: 11px; line-height: 1.2; }
.asm-legend > span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.asm-sw { display: inline-block; width: 4mm; height: 3mm; border: 1px solid var(--color-textColor); background: var(--color-bgColor); }
.asm-sw.asm-sw-h { background: var(--color-hairline); }
.asm-sw.asm-sw-d { border-style: dashed; background: var(--color-pageBg); }
`;

/** The one blocking check: what, who unblocks it, where to sign it off. */
export function StopBox({ text, n, className }: { text: string; n: number; className?: string }) {
  return (
    <CalloutBox tone='error' className={className}>
      <div className='asm-stop-in'>
        <b>STOP</b>
        <span>{text}</span>
        <span>→ pattern maker · hold {n}</span>
        <span className='asm-slot'>
          resolved by <i /> date <i className='asm-slot-short' />
        </span>
      </div>
    </CalloutBox>
  );
}

export function Legend() {
  return (
    <div className='asm-legend'>
      <span>
        <i className='asm-sw asm-sw-h' /> sewn
      </span>
      <span>
        <i className='asm-sw' /> new
      </span>
      <span>
        <i className='asm-sw asm-sw-d' /> hidden
      </span>
      <span>
        <svg width='16' height='12' aria-hidden viewBox='0 0 16 12'>
          <defs>
            <pattern
              id='tpk-lg-h'
              width='4'
              height='4'
              patternUnits='userSpaceOnUse'
              patternTransform='rotate(45)'
            >
              <line x1='0' y1='0' x2='0' y2='4' className='tpa-sl' strokeWidth='1' />
            </pattern>
          </defs>
          <rect x='.5' y='.5' width='15' height='11' fill='url(#tpk-lg-h)' className='tpa-s' />
        </svg>
        wrong side
      </span>
      <span>
        <svg width='26' height='10' aria-hidden viewBox='0 0 26 10'>
          <path d='M1 5h24' className='tpa-s' strokeWidth='4' />
          <path d='M1 5h24' className='tpa-sw' strokeWidth='1.2' strokeDasharray='3 2' />
        </svg>
        sew edge
      </span>
      <span>
        <i className='asm-letter'>a</i> edge pair
      </span>
    </div>
  );
}
