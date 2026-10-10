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

/**
 * A synthetic piece with internal annotations far from it (Codex 10.10: a title block / size
 * table 1–2 m off the piece on the same block hung the CONSTRUCTION tab — every nearest-edge
 * search walked hundreds of empty grid rings per sample). The piece: a 40 × 60 cm sewing line
 * with one real fold inside; the annotations: 12 long wavy paths, a V, a loop and a short dash,
 * 1–2 m away, and 6 wavy leader lines running from inside the piece out to them. Returns the time of segmentPiece (marks included) on a fresh object, the median of
 * three runs, and the marks.
 */
export function farAnnotation(): { ms: number; marks: PieceMark[] } {
  const make = (): SkeletonPieceInput => {
    const poly = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 60 },
      { x: 0, y: 60 },
    ];
    const inner: NonNullable<PieceDTO['inner']> = [
      // A real fold: 2.5 cm in from the left edge, the full height.
      {
        layer: '8',
        closed: false,
        pts: [
          { x: 2.5, y: 0 },
          { x: 2.5, y: 60 },
        ],
      },
    ];
    for (let k = 0; k < 12; k++) {
      const ox = 120 + (k % 4) * 25;
      const oy = 150 + Math.floor(k / 4) * 20;
      const pts = Array.from({ length: 200 }, (_, i) => ({
        x: ox + i * 0.25,
        y: oy + 2 * Math.sin(i / 9),
      }));
      inner.push({ layer: '8', closed: false, pts });
    }
    // Leader lines from the piece out to the annotation: their bbox overlaps the piece, so no
    // envelope test spares them — only the search cap keeps each far sample cheap.
    for (let k = 0; k < 6; k++) {
      const pts = Array.from({ length: 400 }, (_, i) => ({
        x: 20 + i * 0.5 + 1.5 * Math.sin(i / 7 + k),
        y: 30 + k * 2 + i * 0.5,
      }));
      inner.push({ layer: '8', closed: false, pts });
    }
    inner.push({
      layer: '8',
      closed: false,
      pts: [
        { x: -150, y: 180 },
        { x: -145, y: 160 },
        { x: -140, y: 180 },
      ],
    });
    inner.push({
      layer: '8',
      closed: true,
      pts: Array.from({ length: 16 }, (_, i) => ({
        x: 200 + 0.5 * Math.cos((i / 16) * 2 * Math.PI),
        y: -120 + 0.5 * Math.sin((i / 16) * 2 * Math.PI),
      })),
    });
    inner.push({
      layer: '8',
      closed: false,
      pts: [
        { x: 180, y: -100 },
        { x: 182.3, y: -100 },
      ],
    });
    const piece = {
      name: 'FAR',
      layer: '14',
      poly,
      inner,
      bboxW: 40,
      bboxH: 60,
      areaCm2: 2400,
      source: 'synthetic',
    } as unknown as PieceDTO;
    return {
      pieceKey: 'FAR',
      name: 'FAR',
      piece,
      piecesPerGarment: 1,
      cutSymmetry: null,
      cloth: null,
      fused: false,
    };
  };
  const times: number[] = [];
  let marks: PieceMark[] = [];
  for (let r = 0; r < 3; r++) {
    const input = make();
    const t0 = performance.now();
    marks = segmentPiece(input).marks ?? [];
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { ms: times[1], marks };
}
