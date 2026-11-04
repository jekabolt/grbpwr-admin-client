// How a strip reads on a step picture: grey over its host, its name inside, the host's name above and
// the length the seam gives it on a ticked line under the host. A strip already inside a bigger unit
// stays grey with no words: its numbers belong to the step that sews it.
import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

const FILL = 'var(--color-borderColor)';
const INK = 'var(--color-textColor)';
const GREY = 'var(--color-labelColor)';
const HALO = 'var(--color-bgColor)';

const LINE_GAP_PX = 7;
const TICK_PX = 3;
const CHAR_WIDTH = 0.62;

type DrawnPiece = { key: string; ring: readonly Pt2[]; drawn: readonly Pt2[]; input: number };

export type StripWords = {
  allSizes: string;
  /** The sheet's mark for the owner's own words; the editor shows them as they are. */
  name?: (text: string) => string;
};

export const STRIP_WORDS: StripWords = { allSizes: 'all sizes' };

/** `M · 790 → 672`, `M · 672`, `all sizes · 700`. Whole mm: this is a picture, not the table. */
export function stripLengthText(
  mark: NonNullable<PieceGeom['cutStrip']>,
  words: StripWords = STRIP_WORDS,
): string {
  const sewn = Math.round(mark.sewnMm);
  if (mark.mode === 'one_length') return `${words.allSizes} · ${sewn}`;
  const size = mark.sizeName ? `${mark.sizeName} · ` : '';
  if (mark.mode === 'from_seam' && mark.seamMm !== undefined)
    return `${size}${Math.round(mark.seamMm)} → ${sewn}`;
  return `${size}${sewn}`;
}

/** The strips that are this step's own inputs, as opposed to already sewn into a unit. */
export function ownStripKeys(
  input: ReadonlyMap<string, number>,
  geoms: ReadonlyMap<string, PieceGeom>,
): ReadonlySet<string> {
  const count = new Map<number, number>();
  for (const index of input.values()) count.set(index, (count.get(index) ?? 0) + 1);
  const own = new Set<string>();
  for (const [key, index] of input)
    if (geoms.get(key)?.cutStrip && count.get(index) === 1) own.add(key);
  return own;
}

/** The px a labelled strip needs round the fitted picture: host name above, dimension below. */
export const stripPadPx = (font: number) => font * 2 + LINE_GAP_PX + TICK_PX + 4;

function axisOf(ring: readonly Pt2[]) {
  let best = 0;
  let along: Pt2 = [1, 0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > best) {
      best = length;
      along = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    }
  }
  // Reads left to right, or bottom to top on a standing strip.
  if (along[0] < -1e-6 || (Math.abs(along[0]) <= 1e-6 && along[1] > 0))
    along = [-along[0], -along[1]];
  return along;
}

const spanOf = (ring: readonly Pt2[], axis: Pt2) => {
  const values = ring.map((point) => point[0] * axis[0] + point[1] * axis[1]);
  return [Math.min(...values), Math.max(...values)] as const;
};

const pathOf = (points: readonly Pt2[]) =>
  `${points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')} Z`;

export function StripOverlay({
  pieces,
  geoms,
  hosts,
  own,
  font,
  hair,
  height,
  words = STRIP_WORDS,
  plain = false,
  nameRoom = 0,
}: {
  pieces: readonly DrawnPiece[];
  geoms: ReadonlyMap<string, PieceGeom>;
  hosts?: ReadonlyMap<string, string>;
  own: ReadonlySet<string>;
  font: number;
  hair: number;
  height: number;
  words?: StripWords;
  /** A row tile: grey only, nothing to read at that size. */
  plain?: boolean;
  /** Px kept under the host for a piece name the picture still writes there. */
  nameRoom?: number;
}) {
  const strips = pieces.filter((piece) => geoms.get(piece.key)?.cutStrip);
  if (strips.length === 0) return null;
  const byKey = new Map(pieces.map((piece) => [piece.key, piece]));
  const anchor = {
    fontSize: font,
    pointerEvents: 'none' as const,
    dominantBaseline: 'central' as const,
  };
  return (
    <g pointerEvents='none' data-cut-strips=''>
      {strips.map((piece) => {
        const mark = geoms.get(piece.key)!.cutStrip!;
        const fill = (
          <path
            d={pathOf(piece.drawn)}
            fill={FILL}
            stroke={INK}
            strokeWidth={hair}
            strokeLinejoin='round'
            data-cut-strip={piece.key}
          />
        );
        if (plain || !own.has(piece.key)) return <g key={piece.key}>{fill}</g>;
        const along = axisOf(piece.ring);
        // Under, in screen terms: the normal that points down, or right on a standing strip.
        const n: Pt2 = Math.abs(along[0]) >= 0.5 ? [-along[1], along[0]] : [along[1], -along[0]];
        const below: Pt2 =
          n[1] < -1e-6 || (Math.abs(n[1]) <= 1e-6 && n[0] < 0) ? [-n[0], -n[1]] : n;
        const degrees = (Math.atan2(along[1], along[0]) * 180) / Math.PI;
        const at = (t: number, s: number): Pt2 => [
          along[0] * t + below[0] * s,
          along[1] * t + below[1] * s,
        ];
        const rotate = (point: Pt2) =>
          Math.abs(degrees) < 0.5
            ? undefined
            : `rotate(${degrees.toFixed(2)} ${point[0].toFixed(2)} ${point[1].toFixed(2)})`;
        const [t0, t1] = spanOf(piece.ring, along);
        const [s0, s1] = spanOf(piece.ring, below);
        const hostKey = hosts?.get(piece.key);
        const host = hostKey ? byKey.get(hostKey) : undefined;
        const frame = host?.ring ?? piece.ring;
        const [h0, h1] = spanOf(frame, along);
        const [v0, v1] = spanOf(frame, below);
        const hostName = host ? (geoms.get(host.key)?.name ?? '').trim() : '';
        const hostS = v0 - font / 2 - 3;
        const hostAt = at(h0, hostS);
        const wide = (text: string) => text.length * font * CHAR_WIDTH;
        const inset = Math.min(8, (t1 - t0) / 8);
        // A strip thinner than the type, or shorter than its name, cannot hold it: the seam's stroke
        // would run through the letters. The name then shares the host's line, or stands over it.
        const fitsInside = s1 - s0 >= font + 2 && t1 - t0 >= wide(mark.label) + inset;
        const sideBySide = !!hostName && wide(hostName) + wide(mark.label) + font <= h1 - h0;
        const labelAt = fitsInside
          ? at(t0 + inset, (s0 + s1) / 2)
          : sideBySide
            ? at(h1, hostS)
            : at(h0, hostName ? hostS - font - 2 : hostS);
        const gap = LINE_GAP_PX + nameRoom;
        const fitsBelow = at(0, v1 + gap + TICK_PX + font)[1] <= height;
        const lineS = fitsBelow ? v1 + gap : v0 - LINE_GAP_PX;
        const textS = fitsBelow ? lineS + TICK_PX + font / 2 + 2 : lineS - TICK_PX - font / 2 - 2;
        const lineA = at(h0, lineS);
        const lineB = at(h1, lineS);
        const tick = (p: Pt2) =>
          `M${(p[0] - below[0] * TICK_PX).toFixed(2)} ${(p[1] - below[1] * TICK_PX).toFixed(2)}L${(
            p[0] +
            below[0] * TICK_PX
          ).toFixed(2)} ${(p[1] + below[1] * TICK_PX).toFixed(2)}`;
        const textAt = at((h0 + h1) / 2, textS);
        return (
          <g key={piece.key}>
            {fill}
            <text
              {...anchor}
              x={labelAt[0]}
              y={labelAt[1]}
              transform={rotate(labelAt)}
              textAnchor={!fitsInside && sideBySide ? 'end' : 'start'}
              fill={INK}
              stroke={fitsInside ? FILL : HALO}
              strokeWidth={3}
              paintOrder='stroke'
              data-cut-strip-name=''
            >
              {words.name?.(mark.label) ?? mark.label}
            </text>
            {hostName && (
              <text
                {...anchor}
                x={hostAt[0]}
                y={hostAt[1]}
                transform={rotate(hostAt)}
                fill={INK}
                stroke={HALO}
                strokeWidth={3}
                paintOrder='stroke'
                data-cut-strip-host=''
              >
                {words.name?.(hostName) ?? hostName}
              </text>
            )}
            <path
              d={`M${lineA[0].toFixed(2)} ${lineA[1].toFixed(2)}L${lineB[0].toFixed(2)} ${lineB[1].toFixed(2)}${tick(lineA)}${tick(lineB)}`}
              fill='none'
              stroke={GREY}
              strokeWidth={hair}
              data-cut-strip-line=''
            />
            <text
              {...anchor}
              x={textAt[0]}
              y={textAt[1]}
              transform={rotate(textAt)}
              textAnchor='middle'
              fill={GREY}
              stroke={HALO}
              strokeWidth={3}
              paintOrder='stroke'
              data-cut-strip-length=''
            >
              {stripLengthText(mark, words)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
