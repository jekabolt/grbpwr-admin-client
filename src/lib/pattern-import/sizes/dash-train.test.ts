import { describe, expect, it } from 'vitest';

import type { Chain, PtMm } from '../types';
import { adoptDashTrains, rankRhythms, rhythmOfMotif, type Rhythm } from './dash-train';

// Dashes of a size line that the linker left apart (< 8 mm) take the rank of the line they
// continue only on the evidence of that size's own rhythm — never by geometry alone (that was
// tried, and the dash ahead of a line's end is often another size's line).

function line(id: number, a: PtMm, b: PtMm): Chain {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len));
  const pts = Array.from({ length: n + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / n,
    y: a.y + ((b.y - a.y) * i) / n,
  }));
  return { id, pts, closed: false, ranges: [], motif: null, style: 0, lengthMm: len };
}

/** A host along +x ending at x = 40, then dashes `len` long, the first `first` mm past the end. */
function scene(len: number, first: number, gap: number, count: number, y = 0) {
  const chains: Chain[] = [line(0, { x: 0, y: 0 }, { x: 40, y: 0 })];
  let x = 40 + first;
  for (let k = 0; k < count; k++) {
    chains.push(line(1 + k, { x, y }, { x: x + len, y }));
    x += len + gap;
  }
  return chains;
}

const LEAH18: Rhythm = { draws: [6], gaps: [3.75, 1.75, 1.25] };
const adopt = (
  chains: Chain[],
  rhythms: Map<number, Rhythm>,
  ranks: [number, number][] = [[0, 0]],
) =>
  adoptDashTrains({
    chains,
    rankOf: new Map(ranks),
    rhythms,
    candidate: (i) => !ranks.some(([c]) => c === i),
  });

describe('adoptDashTrains', () => {
  it('takes a train of the size’s own dashes and runs the host over it', () => {
    const chains = scene(6.2, 1.3, 3.6, 4);
    const got = adopt(chains, new Map([[0, LEAH18]]));
    expect([...got.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect([...got.values()].every((h) => h === 0)).toBe(true);
    expect(chains[0].pts[chains[0].pts.length - 1].x).toBeCloseTo(40 + 1.3 + 4 * 6.2 + 3 * 3.6, 1);
    expect(chains[0].lengthMm).toBeCloseTo(40 + 1.3 + 4 * 6.2 + 3 * 3.6, 1);
  });

  it('refuses dashes that are another size’s pen', () => {
    const chains = scene(2.2, 0.5, 3.6, 4);
    expect(adopt(chains, new Map([[0, LEAH18]])).size).toBe(0);
  });

  it('refuses a dash that is off the line of the end', () => {
    const chains = scene(6.2, 1.3, 3.6, 3, 1.2);
    expect(adopt(chains, new Map([[0, LEAH18]])).size).toBe(0);
  });

  it('refuses a gap longer than the pen has', () => {
    const chains = scene(6.2, 9, 3.6, 3);
    expect(adopt(chains, new Map([[0, LEAH18]])).size).toBe(0);
  });

  it('refuses one dash alone, takes it when it closes a hole between two lines of the rank', () => {
    const alone = scene(6.2, 1.3, 3.6, 1);
    expect(adopt(alone, new Map([[0, LEAH18]])).size).toBe(0);
    const closing = scene(6.2, 1.3, 3.6, 1);
    // another line of the same rank starts 3 mm past the dash's far end
    closing.push(line(2, { x: 40 + 1.3 + 6.2 + 3, y: 0 }, { x: 90, y: 0 }));
    const got = adopt(closing, new Map([[0, LEAH18]]), [
      [0, 0],
      [2, 0],
    ]);
    expect([...got.keys()]).toEqual([1]);
  });

  it('refuses one dash whose "hole" is a line coming onto the host’s side (a corner, Memoir A)', () => {
    const corner = scene(6.2, 1.3, 3.6, 1);
    // the rank's other line comes down onto the host's line and ends 5 mm above the dash's end
    const x = 40 + 1.3 + 6.2;
    corner.push(line(2, { x, y: 60 }, { x, y: 5 }));
    const got = adopt(corner, new Map([[0, LEAH18]]), [
      [0, 0],
      [2, 0],
    ]);
    expect(got.size).toBe(0);
  });

  it('takes one dash that reaches the rank’s other line itself, a T-join (Leah)', () => {
    const tee = scene(6.2, 1.3, 3.6, 1);
    // the rank's other line comes from above and doubles back: its end is beside, its body
    // passes 0.7 mm from the dash
    const x = 40 + 1.3 + 3;
    tee.push(line(2, { x, y: 0.7 }, { x, y: 60 }));
    const got = adopt(tee, new Map([[0, LEAH18]]), [
      [0, 0],
      [2, 0],
    ]);
    expect([...got.keys()]).toEqual([1]);
  });

  it('tells two sizes with the same dash by the gap (Cassandra 10 and 30)', () => {
    const ten: Rhythm = { draws: [6], gaps: [7.75] };
    const thirty: Rhythm = { draws: [6], gaps: [6.75] };
    const rh = new Map([
      [0, ten],
      [1, thirty],
    ]);
    // 7.8 mm past the end, then at the pitch of ten
    const a = scene(6.1, 7.8, 7.8, 3);
    expect([...adopt(a, rh).values()]).toEqual([0, 0, 0]);
    // the same line, but the host is size 30's: 7.8 is not its gap
    const b = scene(6.1, 7.8, 7.8, 3);
    expect(adopt(b, rh, [[0, 1]]).size).toBe(0);
    // and 6.8 mm past the end is size 30's
    const c = scene(6.1, 6.8, 6.8, 3);
    expect(adopt(c, rh, [[0, 1]]).size).toBe(3);
    expect(adopt(scene(6.1, 6.8, 6.8, 3), rh).size).toBe(0);
  });

  it('does not run a train up to the line of another size', () => {
    const chains = scene(6.2, 1.3, 3.6, 3);
    // size 1's line starts 1.5 mm past the third dash's far end
    chains.push(
      line(10, { x: 40 + 1.3 + 6.2 + 3.6 + 6.2 + 3.6 + 6.2 + 1.5, y: 0 }, { x: 90, y: 0 }),
    );
    const got = adopt(
      chains,
      new Map([
        [0, LEAH18],
        [1, { draws: [3], gaps: [2] }],
      ]),
      [
        [0, 0],
        [4, 1],
      ],
    );
    // dashes 1 and 2 are free, the third would end by size 1's line: the train stops before it
    expect([...got.keys()].sort()).toEqual([1, 2]);
  });

  it('leaves an end that already lands on a line', () => {
    const chains = scene(6.2, 1.3, 3.6, 3);
    // a wall crossing the host's end
    chains.push(line(20, { x: 40.5, y: -10 }, { x: 40.5, y: 10 }));
    expect(adopt(chains, new Map([[0, LEAH18]])).size).toBe(0);
  });

  it('is not stopped by a neighbouring size running beside the end (Leah, nested)', () => {
    const chains = scene(6.2, 1.3, 3.6, 4);
    // size 1's line, parallel, 2 mm across, along the host and on past the train
    chains.push(line(30, { x: 0, y: 2 }, { x: 120, y: 2 }));
    const got = adopt(
      chains,
      new Map([
        [0, LEAH18],
        [1, { draws: [3], gaps: [2] }],
      ]),
      [
        [0, 0],
        [5, 1],
      ],
    );
    expect([...got.keys()].sort()).toEqual([1, 2, 3, 4]);
  });

  it('is not stopped by a line that passes the end obliquely without running into it', () => {
    const chains = scene(6.2, 1.3, 3.6, 4);
    // 2.5 mm beside the end at ~40°, never crossing the way ahead
    chains.push(line(31, { x: 20, y: -19.3 }, { x: 40.5, y: -2.5 }));
    expect(adopt(chains, new Map([[0, LEAH18]])).size).toBe(4);
  });

  it('still stops at a beside neighbour whose end sits at the dash (the Reims joint)', () => {
    const chains = scene(6.2, 1.3, 3.6, 3);
    // size 1's line runs beside the host and ENDS 2.2 mm from the start of the second dash
    chains.push(line(32, { x: 0, y: 2 }, { x: 40 + 1.3 + 6.2 + 3.6 + 0.9, y: 2 }));
    const got = adopt(
      chains,
      new Map([
        [0, LEAH18],
        [1, { draws: [3], gaps: [2] }],
      ]),
      [
        [0, 0],
        [4, 1],
      ],
    );
    expect(got.size).toBe(0);
  });

  it('takes a proven train past a beside neighbour that ends at its third dash (Leah 18)', () => {
    const chains = scene(6.2, 1.3, 3.6, 5);
    // size 1 runs beside, 2.2 mm across, and ENDS at the third dash (its line breaks there too)
    const third = 40 + 1.3 + 2 * (6.2 + 3.6);
    chains.push(line(40, { x: 0, y: 2.2 }, { x: third + 1, y: 2.2 }));
    const rh = new Map([
      [0, LEAH18],
      [1, { draws: [3], gaps: [2] }],
    ]);
    const got = adopt(chains, rh, [
      [0, 0],
      [6, 1],
    ]);
    expect([...got.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
    // a train that ENDS at the neighbour's end runs up to a joint: it stops before that dash
    const short = scene(6.2, 1.3, 3.6, 3);
    short.push(line(40, { x: 0, y: 2.2 }, { x: third + 1, y: 2.2 }));
    expect(
      [
        ...adopt(short, rh, [
          [0, 0],
          [4, 1],
        ]).keys(),
      ].sort(),
    ).toEqual([1, 2]);
  });

  it('takes a row of identical dashes past a rival whose pen has several draws (Leah 24 vs 6)', () => {
    const twentyFour: Rhythm = { draws: [3.75], gaps: [3.5, 1, 1, 1.5], span: 7 };
    const six: Rhythm = { draws: [3.75, 3, 1.75], gaps: [1.75, 1.5, 4], span: 4 };
    const rh = new Map([
      [0, twentyFour],
      [1, six],
    ]);
    // the host ends on a dot: 1.4 mm to the first dash, then 3.57 mm dashes 4.93 apart
    const row = scene(3.57, 1.4, 4.93, 5);
    expect(adopt(row, rh).size).toBe(5);
    // two dashes prove nothing: the rival stays a rival
    expect(adopt(scene(3.57, 1.4, 4.93, 2), rh).size).toBe(0);
    // a rival with ONE draw of that length and this gap still decides (Cassandra)
    const same = new Map([
      [0, twentyFour],
      [1, { draws: [3.75], gaps: [4.9], span: 4.9 } as Rhythm],
    ]);
    expect(adopt(scene(3.57, 1.4, 4.93, 5), same).size).toBe(0);
    // dashes of different lengths are no train of one pen
    const mixed = scene(3.57, 1.4, 4.93, 5);
    mixed[3] = line(3, mixed[3].pts[0], { x: mixed[3].pts[0].x + 3.1, y: 0 });
    expect(adopt(mixed, rh).size).toBe(0);
  });

  it('reads a line extended at its start by its own geometry, not shifted (wall index)', () => {
    // A runs +x from 40 and takes a train BEFORE its start (its pts grow at the front)
    const chains: Chain[] = [line(0, { x: 40, y: 0 }, { x: 100, y: 0 })];
    let x = 40 - 1.3;
    for (let k = 0; k < 4; k++) {
      chains.push(line(1 + k, { x, y: 0 }, { x: x - 6.2, y: 0 }));
      x -= 6.2 + 3.6;
    }
    // B comes down onto A at x = 90 and stops 0.5 mm above it: landed on A
    chains.push(line(5, { x: 90, y: 50 }, { x: 90, y: 0.5 }));
    // dashes below A, on B's line: B must not run through A over them
    let y = -0.8;
    for (let k = 0; k < 3; k++) {
      chains.push(line(6 + k, { x: 90, y }, { x: 90, y: y - 6.2 }));
      y -= 6.2 + 3.6;
    }
    const got = adopt(chains, new Map([[0, LEAH18]]), [
      [0, 0],
      [5, 0],
    ]);
    expect([...got.keys()].sort()).toEqual([1, 2, 3, 4]);
  });

  it('does nothing for a rank without a rhythm', () => {
    expect(adopt(scene(6.2, 1.3, 3.6, 4), new Map()).size).toBe(0);
  });
});

describe('rhythms', () => {
  it('reads draws (not dots) and gaps from a motif', () => {
    expect(rhythmOfMotif([6, 3.75, 0, 1.75, 0, 1.25])).toEqual({
      draws: [6],
      gaps: [3.75, 1.75, 1.25],
      // from the end of the dash to the next dash, over both dots
      span: 6.75,
    });
    // several draws: the longest way between two of them
    expect(rhythmOfMotif([3.75, 1.75, 3, 1.5, 1.75, 4])?.span).toBe(4);
    expect(rhythmOfMotif(null)).toBeNull();
    expect(rhythmOfMotif([0, 1.25])).toBeNull();
  });

  it('takes, per rank, the repeat most of its length is drawn in, from keyed chains only', () => {
    const motifs: Record<number, number[]> = {
      0: [6, 3.75],
      1: [6.2, 3.8],
      2: [4.25, 1],
      3: [9, 1],
    };
    const len = (c: number) => [30, 20, 10, 500][c];
    const got = rankRhythms(
      [
        [0, 5],
        [1, 5],
        [2, 5],
        [3, 5],
      ],
      (c) => c !== 3, // chain 3 was ranked by nesting, not by the key
      (c) => motifs[c],
      len,
    );
    // 0 and 1 are one pen at two tile scales (one 0.5 mm key): the longer one is the reference
    expect(got.get(5)).toEqual({ draws: [6], gaps: [3.75], span: 3.75 });
  });
});
