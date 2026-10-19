// G1's view of the file through the CARD's own parse path: `parseSheets` (worker/parse-files.ts),
// i.e. parseDxf → expandGroups → groupToPieces → PieceDTO, with the card's NEST_DEFAULTS
// tolerances. Nothing here re-implements the parser — a gate that rebuilt its own pieces would be
// measuring a second implementation.
//
// Contract note: 08-CONTRACT lists `roundTrip(dxfText): RoundTrip`; `parseSheets` is async (its
// bytes arrive through a thunk), so this returns a Promise. runGate is async anyway.

import { NEST_DEFAULTS } from 'lib/nesting/types';
import type { PieceDTO } from 'lib/nesting/types';
import { parseSheets } from 'lib/nesting/worker/parse-files';
import type { PtMm, RoundTrip } from '../types';

export async function roundTrip(dxfText: string, name = 'pattern-import.dxf'): Promise<RoundTrip> {
  const bytes = new TextEncoder().encode(dxfText);
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const r = await parseSheets([{ name, open: async () => buf }], {
    unit: 'auto',
    tol: NEST_DEFAULTS.tol,
    tolChain: NEST_DEFAULTS.tolChain,
  });
  return {
    pieces: r.pieces,
    blockNames: r.blockNames,
    failedFiles: r.failedFiles,
    skippedBlocks: r.skippedBlocks,
    warnings: r.warnings,
  };
}

/** The gate's unit boundary: a PieceDTO contour back in absolute drawing millimetres. */
export function contourMm(p: PieceDTO): PtMm[] {
  const ox = p.originX ?? 0;
  const oy = p.originY ?? 0;
  return p.poly.map((q) => ({ x: (q.x + ox) * 10, y: (q.y + oy) * 10 }));
}
