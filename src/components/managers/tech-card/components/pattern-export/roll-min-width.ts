// The narrowest roll the picked pieces fit on, for the `min X` line under the width input.
// The contract (lib/pattern-export/roll-print.ts) exposes no piece geometry yet, so this reads the
// DXF through the same nesting path as the marker: pieces → sizes → contour layer → seam
// allowance → fold unit. A piece fits a roll if its narrower bbox side fits the printable width.
// TODO(print-roll engine): move into the contract once the engine exposes its source model.
import { buildAllowanceIndex } from 'components/managers/tech-card/components/nesting/contour-allowance';
import {
  contourIsCutLine,
  defaultContourLayer,
  layerOptions,
} from 'components/managers/tech-card/components/nesting/contour-layer';
import { scanDxfSizes } from 'components/managers/tech-card/components/nesting/dxf-size-plan';
import { splitPiecesBySize } from 'components/managers/tech-card/components/nesting/split-pieces';
import { area, bounds } from 'lib/nesting/geom/polygon';
import { applySeamAllowance } from 'lib/nesting/geom/seam-allowance';
import { NEST_DEFAULTS, type PieceDTO } from 'lib/nesting/types';
import { parseFiles } from 'lib/nesting/worker/parse-files';
import type { SizeCopies } from 'lib/pattern-export/roll-print';

const bare = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

/** Narrower side of each printable piece, cm, by size label (`OS` when the file has no sizes). */
type MinSides = Map<string, number>;

const cache = new WeakMap<ArrayBuffer, Map<string, MinSides>>();

function readMinSides(dxf: ArrayBuffer, fileName: string): MinSides {
  const hit = cache.get(dxf)?.get(fileName);
  if (hit) return hit;
  const parsed = parseFiles(
    dxf,
    { unit: 'auto', tol: NEST_DEFAULTS.tol, tolChain: NEST_DEFAULTS.tolChain },
    [],
  );
  const pieces: PieceDTO[] = parsed.raws.map((raw, i) => {
    const bb = bounds(raw.poly);
    const poly = raw.poly.map((p) => ({ x: p.x - bb.minX, y: p.y - bb.minY }));
    return {
      id: i + 1,
      name: raw.blockName == null ? `piece ${i + 1}` : raw.name,
      blockName: raw.blockName ?? '',
      layer: raw.layer,
      source: fileName,
      fileIndex: 0,
      poly,
      bboxW: bb.maxX - bb.minX,
      bboxH: bb.maxY - bb.minY,
      areaCm2: area(poly),
    };
  });
  const text = new TextDecoder('windows-1252').decode(new Uint8Array(dxf));
  const tokens = new Set(scanDxfSizes(text, () => false).sizes.map(bare));
  const split = splitPiecesBySize(pieces, tokens);
  const options = layerOptions(pieces, split.codeById, buildAllowanceIndex(pieces));
  const layer = defaultContourLayer(options);
  const measured = options.find((o) => o.layer === layer)?.allowance;
  const allowanceCm = contourIsCutLine(measured) ? 0 : NEST_DEFAULTS.seamAllowanceCm;
  const seam = applySeamAllowance(
    pieces.filter((p) => p.layer === layer),
    allowanceCm,
  );
  const out: MinSides = new Map();
  for (const p of seam.pieces) {
    const size = split.codeById.get(p.id)?.size || 'OS';
    out.set(size, Math.max(out.get(size) ?? 0, Math.min(p.bboxW, p.bboxH)));
  }
  const files = cache.get(dxf) ?? new Map<string, MinSides>();
  files.set(fileName, out);
  cache.set(dxf, files);
  return out;
}

/**
 * Narrowest roll width, cm (0.1 cm up), that takes every picked piece in some orientation with
 * `edgeMm` dead edge on each side. Null when nothing is picked or the file cannot be read.
 */
export function minRollWidthCm(
  dxf: ArrayBuffer,
  fileName: string,
  copies: SizeCopies,
  edgeMm: number,
): number | null {
  let sides: MinSides;
  try {
    sides = readMinSides(dxf, fileName);
  } catch {
    return null;
  }
  let widest = 0;
  for (const [size, n] of Object.entries(copies))
    if (n > 0) widest = Math.max(widest, sides.get(size) ?? 0);
  if (!(widest > 0)) return null;
  return Math.ceil((widest + (2 * edgeMm) / 10) * 10 - 1e-9) / 10;
}
