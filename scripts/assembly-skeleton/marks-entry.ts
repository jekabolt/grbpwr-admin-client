// P2 step 0 — internal-marks probe entry, bundled by scripts/assembly-skeleton/marks.mjs.
//
// The product path: the nesting parser (parseSheets) → one PieceDTO per block of a size
// (seamPieceOf over every layer of the block) → segmentPiece (which runs collectMarks) — and, for
// the negative controls, classifyMarks with one step switched off.

import type { PieceDTO } from '../../src/lib/nesting/types';
import { parseSheets } from '../../src/lib/nesting/worker/parse-files';
import { seamPieceOf, segmentPiece } from '../../src/lib/assembly-skeleton/geometry';
import { classifyMarks, type MarkOptions } from '../../src/lib/assembly-skeleton/geometry/marks';
import type { PieceMark, SkeletonPieceInput } from '../../src/lib/assembly-skeleton/types';

export type ProbePiece = {
  key: string;
  marks: PieceMark[];
  dropped: { twins: number; seamCopies: number; ticks: number };
  ms: number;
};

/** Block name `<identity>_<size>` → [identity, size] (CLO writes `<M>` sometimes). */
function split(block: string): [string, string] | null {
  const at = block.lastIndexOf('_');
  if (at < 0) return null;
  return [block.slice(0, at), block.slice(at + 1).replace(/^<|>$/g, '')];
}

export async function loadInputs(bytes: ArrayBuffer): Promise<Map<string, SkeletonPieceInput[]>> {
  const parsed = await parseSheets([{ name: 'probe.dxf', open: async () => bytes }], {
    unit: 'auto',
    tol: 0.05,
    tolChain: 0.05,
  });
  const byBlock = new Map<string, PieceDTO[]>();
  for (const p of parsed.pieces) {
    const b = p.blockName ?? p.name ?? '';
    byBlock.set(b, [...(byBlock.get(b) ?? []), p]);
  }
  const bySize = new Map<string, SkeletonPieceInput[]>();
  for (const [block, cands] of byBlock) {
    const piece = seamPieceOf(cands);
    if (!piece) continue;
    const s = split(block);
    const [key, size] = s ?? [block, ''];
    bySize.set(size, [
      ...(bySize.get(size) ?? []),
      {
        pieceKey: key,
        name: key,
        piece,
        piecesPerGarment: 1,
        cutSymmetry: null,
        cloth: null,
        fused: false,
      },
    ]);
  }
  return bySize;
}

/** Marks of every piece: the product path (segmentPiece) or classifyMarks with `opts`. */
export function marksOf(inputs: SkeletonPieceInput[], opts?: MarkOptions): ProbePiece[] {
  return inputs.map((input) => {
    const t0 = performance.now();
    const geom = segmentPiece(input);
    const t1 = performance.now();
    const rep = opts ? classifyMarks(input, geom, opts) : classifyMarks(input, geom);
    // The product field must be what classifyMarks returns with everything on.
    if (!opts && JSON.stringify(geom.marks) !== JSON.stringify(rep.marks)) {
      throw new Error(`${input.pieceKey}: segmentPiece().marks differs from classifyMarks()`);
    }
    return { key: input.pieceKey, marks: rep.marks, dropped: rep.dropped, ms: t1 - t0 };
  });
}
