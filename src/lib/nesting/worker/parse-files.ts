// Per-file pipeline: bytes → dxf-parser → block expansion → loop chaining/filtering →
// raw pieces in absolute cm coordinates.
import type { ParseOpts, Unit } from '../types';
import { parseDxf } from '../dxf/parse';
import { expandGroups } from '../dxf/transform';
import { groupToPieces, type RawPiece } from '../dxf/pieces';

export function parseFiles(
  buf: ArrayBuffer,
  opts: ParseOpts,
  warnings: string[],
): { raws: RawPiece[]; unit: Exclude<Unit, 'auto'>; unitGuessed: boolean } {
  const parsed = parseDxf(buf, opts.unit);
  const groups = expandGroups(
    parsed.dxf.entities ?? [],
    parsed.dxf.blocks ?? {},
    parsed.cmPerUnit,
    opts.tol,
    warnings,
  );
  const raws: RawPiece[] = [];
  for (const g of groups) {
    raws.push(...groupToPieces(g, opts.tolChain, warnings));
  }
  return { raws, unit: parsed.unit, unitGuessed: parsed.unitGuessed };
}
