import { describe, expect, it } from 'vitest';

import { groupPieces } from './groups';

const piece = (pieceKey: string, name: string, areaMm2: number) => ({
  pieceKey,
  name,
  areaMm2,
  twinOf: [],
  rs: [
    [0, 0],
    [10, 0],
    [10, 10],
  ],
});
const surface = (part: string, host: string) => ({
  a: `${part}#0`,
  b: `${host}#0`,
  kind: 'surface',
  surface: { part, host },
});
const edge = (a: string, b: string) => ({ a: `${a}#1`, b: `${b}#1`, kind: 'edge', evidence: {} });

const grouped = (name: string, chosen: object[]) =>
  groupPieces(
    {
      pieces: [piece('front', 'FRONT LEFT', 200000), piece('part', name, 40000)],
      chosen,
      rejected: [],
      components: [],
    } as unknown as Parameters<typeof groupPieces>[0],
    { pieces: [] } as unknown as Parameters<typeof groupPieces>[1],
    { owner: true },
  );
const placedByOwner = (g: ReturnType<typeof grouped>) =>
  g.skipped.some((s) => s.pieceKey === 'part' && s.surface);

describe('owner surface rows', () => {
  it('place a placket with no shell seam on its host', () => {
    expect(placedByOwner(grouped('PLACKET', [surface('part', 'front')]))).toBe(true);
  });

  it('leave a placket sewn by an edge seam in the shell', () => {
    const g = grouped('PLACKET', [surface('part', 'front'), edge('part', 'front')]);
    expect(placedByOwner(g)).toBe(false);
  });

  it('never take a shell panel out of the solve', () => {
    expect(placedByOwner(grouped('BACK', [surface('part', 'front')]))).toBe(false);
  });
});
