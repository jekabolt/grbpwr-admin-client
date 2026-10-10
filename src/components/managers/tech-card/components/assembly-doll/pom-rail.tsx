// THE MEASURES RAIL (01-DESIGN-L0 §5.5, §6): every standard POM of the selected size read off the
// pattern laid flat, with its exactness in words and — when the card's size chart has a value for
// the dictionary name it maps to — the spec and Δ within the display tolerance (±1 cm, «default»
// until the card stores one). Hovering a row lights its line on the doll (one shared hover).
//
// Monochrome: the value is ink, an approximate value is said so in words, a missing one is «—»;
// a Δ beyond the tolerance takes the blue `check` pill (DESIGN.md, the Monochrome Rule).

import { DICTIONARY_POM, type ChartComparison, type GarmentKind, type PomValue } from 'lib/pom';
import { cn } from 'lib/utility';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { setHoverPom } from './doll-store';
import { cm, exactnessWords, namedKeys, specWords } from './words';

/** The chart rows that compare against this POM (dictionary name → POM code by garment). */
export function comparisonsOf(
  code: string,
  garment: GarmentKind,
  rows: readonly ChartComparison[],
): ChartComparison[] {
  return rows.filter(
    (c) => DICTIONARY_POM[c.name as keyof typeof DICTIONARY_POM]?.[garment] === code,
  );
}

export function PomRail({
  values,
  garment,
  comparisons,
  hover,
  drawn,
  names,
}: {
  values: readonly PomValue[];
  garment: GarmentKind;
  /** The card's chart against the pattern, this size only. */
  comparisons: readonly ChartComparison[];
  hover: string | null;
  /** POM codes whose line could be laid on the doll on screen. */
  drawn: ReadonlySet<string>;
  /** Piece line key → the card's name (the engine's words name pieces by key). */
  names: ReadonlyMap<string, string>;
}) {
  return (
    <ul
      className='divide-y divide-hairline'
      data-pom-rail=''
      onMouseLeave={() => setHoverPom(null)}
    >
      {values.map((v) => {
        const ex = exactnessWords(v, names);
        const comps = comparisonsOf(v.code, garment, comparisons);
        const off = comps.some((c) => c.within === false);
        const hot = hover === v.code;
        const value = v.valueMm == null ? '—' : cm(v.valueMm);
        const girth = v.halfMm !== undefined;
        return (
          <li
            key={v.code}
            data-pom-row={v.code}
            data-pom-exactness={v.exactness}
            tabIndex={0}
            aria-label={`${v.name}: ${value === '—' ? 'not found' : `${value} cm`}, ${ex.word}`}
            onMouseEnter={() => setHoverPom(v.code)}
            onFocus={() => setHoverPom(v.code)}
            onBlur={() => setHoverPom(null)}
            className={cn(
              'cursor-default px-1 py-1.5 outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor',
              hot && 'bg-bgZebra',
            )}
          >
            <div className='flex items-baseline gap-2'>
              <Text
                component='span'
                className={cn('min-w-0 flex-1 truncate', hot && 'font-bold')}
                title={v.name}
              >
                {v.name.toLowerCase()}
              </Text>
              {girth && v.valueMm != null && (
                <Text component='span' size='micro' variant='label'>
                  half
                </Text>
              )}
              <Text
                component='span'
                className={cn(
                  'tabular-nums',
                  v.exactness === 'exact' ? 'font-bold' : 'text-labelColor',
                )}
              >
                {value}
                {v.valueMm != null && (
                  <Text component='span' size='micro' variant='label'>
                    {' '}
                    cm
                  </Text>
                )}
              </Text>
            </div>
            <div className='flex items-baseline gap-2'>
              <Text
                component='span'
                size='micro'
                variant='label'
                className='min-w-0 flex-1 truncate'
                title={[ex.word, ex.why, ...(v.detail ?? []).map((d) => namedKeys(d, names))]
                  .filter(Boolean)
                  .join(' · ')}
              >
                <span className={cn(v.exactness === 'exact' && 'text-textColor')}>{ex.word}</span>
                {ex.why ? ` · ${ex.why}` : ''}
                {v.valueMm != null && !drawn.has(v.code) ? ' · line not on this doll' : ''}
              </Text>
              {off && (
                <Pill
                  tone='attention'
                  title='the pattern is off its spec by more than the tolerance'
                >
                  check
                </Pill>
              )}
            </div>
            {comps.map((c) => (
              <Text
                key={`${c.name}`}
                component='p'
                size='micro'
                variant='label'
                className='tabular-nums'
                data-pom-spec={c.within === false ? 'off' : 'within'}
              >
                {c.name} · {specWords(c)}
              </Text>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
