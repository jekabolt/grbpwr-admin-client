// THE MEASURES RAIL (01-DESIGN-L0 §5.5, §6): every standard POM of the selected size read off the
// pattern laid flat, one line each: name · half · value cm, and a red «Δ +1.2» when the card's size
// chart has a spec the pattern misses beyond the tolerance. The exactness, its reason and the
// spec rows live in the row's title. Hovering a row lights its line on the doll (one shared hover).
//
// Monochrome: an exact value is ink, an approximate one grey, a missing one «—».

import { DICTIONARY_POM, type ChartComparison, type GarmentKind, type PomValue } from 'lib/pom';
import { cn } from 'lib/utility';
import { Text } from 'ui';

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
        // The first spec the pattern misses beyond the tolerance: «Δ +1.2» in red on the row.
        const miss = comps.find((c) => c.within === false && c.deltaMm != null);
        const offBy =
          miss?.deltaMm == null
            ? null
            : `${miss.deltaMm > 0 ? '+' : '−'}${cm(Math.abs(miss.deltaMm))}`;
        // Everything else about the measure is said on hover, not on the row.
        const said = [
          v.name,
          [ex.word, ex.why].filter(Boolean).join(' · '),
          ...(v.detail ?? []).map((d) => namedKeys(d, names)),
          v.valueMm != null && !drawn.has(v.code) ? 'line not on this doll' : '',
          ...comps.map((c) => `${c.name} · ${specWords(c)}`),
        ]
          .filter(Boolean)
          .join('\n');
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
            title={said}
            onMouseEnter={() => setHoverPom(v.code)}
            onFocus={() => setHoverPom(v.code)}
            onBlur={() => setHoverPom(null)}
            className={cn(
              'cursor-default px-1 py-1.5 outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor',
              hot && 'bg-pageBg',
            )}
          >
            <div className='flex items-baseline gap-2'>
              <Text component='span' className={cn('min-w-0 flex-1 truncate', hot && 'font-bold')}>
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
              {offBy != null && (
                <Text
                  component='span'
                  size='micro'
                  variant='error'
                  className='tabular-nums'
                  data-pom-spec='off'
                >
                  Δ {offBy}
                </Text>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
