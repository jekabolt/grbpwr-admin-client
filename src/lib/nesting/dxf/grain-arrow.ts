// CLO's grain line is an ARROW, not a segment (K2, 10-CLO-DXF-FORMAT §1.6 / §2.4 pitfall 1): an open
// 3-vertex polyline P0 → P1 → P2 where P0→P1 is the 180 mm shaft and P1→P2 is a one-sided barb
// (−27·u + 13.5·n) folding back beside the shaft. The card used to take only 2-point segments as grain
// candidates, so on every CLO R2000 file the real grain was invisible and a long internal line (the
// 65 cm centre-front on layer 8) won the layer vote instead.
//
// The test is the SHAPE of an arrowhead, not a layer name: the layer is chosen file-wide later
// (grain.ts), and a 3-vertex dart leg or an L-shaped placement mark must not qualify.
//   - the shaft is at least 3× the barb (CLO: 180 vs 30.2);
//   - the barb folds BACK toward the tail: angle(P1→P2, P1→P0) < 60° (CLO: 26.6°);
//   - the barb tip sits beside the shaft, its projection strictly inside (0, shaft).
// Only P0→P1 is the grain; the barb is decoration.
import type { Pt } from '../types';

const MIN_SHAFT_TO_BARB = 3;
const MAX_BARB_ANGLE_DEG = 60;

export function isGrainArrow(pts: readonly Pt[]): boolean {
  if (pts.length !== 3) return false;
  const [p0, p1, p2] = pts;
  const sx = p1.x - p0.x;
  const sy = p1.y - p0.y;
  const shaft = Math.hypot(sx, sy);
  const bx = p2.x - p1.x;
  const by = p2.y - p1.y;
  const barb = Math.hypot(bx, by);
  if (!(shaft > 0) || !(barb > shaft * 1e-6)) return false;
  if (shaft < MIN_SHAFT_TO_BARB * barb) return false;
  // Barb vs the way back down the shaft (P1→P0 = −s).
  const cosBack = (bx * -sx + by * -sy) / (barb * shaft);
  if (cosBack < Math.cos((MAX_BARB_ANGLE_DEG * Math.PI) / 180)) return false;
  // Barb tip projected onto the shaft, measured from the tail.
  const along = ((p2.x - p0.x) * sx + (p2.y - p0.y) * sy) / shaft;
  return along > 0 && along < shaft;
}
