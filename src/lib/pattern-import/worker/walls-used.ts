// The stretches of the source walls a written piece actually USES (F13c, for gate G3).
//
// `buildPieceSpecsDetailed(...).wallsOf` returns whole wall CHAINS. On a CLO DXF a chain is the
// piece's own outline, but on a PDF a chain runs on past the piece (a common edge shared with the
// neighbour, a size line that continues into the next piece), and G3 — "share of wall length
// within 0.3 mm of the written line" — then counts the part beyond the corner as a miss: every
// PDF piece blocked at 60–90 % although the outline sits on its walls (G4 p95 ≈ 0). Here each wall
// is cut to the runs lying within `reachMm` (= the gate's G4 max, 1 mm) of the drawn line; G3 then
// measures how much of those runs sits within 0.3 mm, which is the question it asks.
import type { PtMm } from '../types';

const CELL = 5;
/**
 * A run of a wall with less than this share ON the line (≤ 0.3 mm) only runs alongside it — a
 * neighbouring size line converging within a millimetre, not a wall this piece follows.
 */
const NEIGHBOUR_MAX_ON = 0.1;

function index(line: readonly PtMm[]) {
  const grid = new Map<string, number[]>();
  const n = line.length;
  for (let i = 0; i < n; i++) {
    const a = line[i];
    const b = line[(i + 1) % n];
    const x0 = Math.floor(Math.min(a.x, b.x) / CELL);
    const x1 = Math.floor(Math.max(a.x, b.x) / CELL);
    const y0 = Math.floor(Math.min(a.y, b.y) / CELL);
    const y1 = Math.floor(Math.max(a.y, b.y) / CELL);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`;
        const a2 = grid.get(k);
        if (a2) a2.push(i);
        else grid.set(k, [i]);
      }
  }
  return (p: PtMm, reach: number): number => {
    let d = Infinity;
    const r = Math.ceil(reach / CELL);
    const cx = Math.floor(p.x / CELL);
    const cy = Math.floor(p.y / CELL);
    for (let x = cx - r; x <= cx + r; x++)
      for (let y = cy - r; y <= cy + r; y++)
        for (const i of grid.get(`${x},${y}`) ?? []) {
          const a = line[i];
          const b = line[(i + 1) % n];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const l2 = dx * dx + dy * dy;
          const t =
            l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
          const q = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
          if (q < d) d = q;
        }
    return d;
  };
}

/**
 * Walls cut to the stretches the closed `line` uses: runs within `reachMm` of it, their ends
 * trimmed where the wall departs (beyond `onMm`), and runs that hardly touch the line (< 10 %
 * within `onMm`) dropped — a neighbouring size line running alongside within a millimetre is not
 * this piece's wall. Misses INSIDE a used run stay and count against G3; a line that strays off its walls is
 * caught by G4 (line → walls, max 1 mm).
 */
export function wallsUsedBy(
  walls: readonly PtMm[][],
  line: readonly PtMm[] | null | undefined,
  reachMm = 1,
  onMm = 0.3,
): PtMm[][] {
  if (!line || line.length < 3) return walls.map((w) => w.slice());
  const near = index(line);
  const out: PtMm[][] = [];
  for (const w of walls) {
    let run: { p: PtMm; d: number }[] = [];
    const flush = () => {
      let a = 0;
      let b = run.length - 1;
      while (a <= b && run[a].d > onMm) a++;
      while (b >= a && run[b].d > onMm) b--;
      const kept = run.slice(a, b + 1);
      run = [];
      if (kept.length < 2) return;
      let len = 0;
      for (let i = 1; i < kept.length; i++)
        len += Math.hypot(kept[i].p.x - kept[i - 1].p.x, kept[i].p.y - kept[i - 1].p.y);
      const on = kept.filter((q) => q.d <= onMm).length;
      if (len >= 1 && on >= kept.length * NEIGHBOUR_MAX_ON) out.push(kept.map((q) => q.p));
    };
    for (let i = 0; i < w.length; i++) {
      // densify to ≤ 0.5 mm so a long straight edge is cut where it leaves the line, not at a vertex
      const a = w[i];
      const b = w[i + 1];
      const steps = b ? Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2)) : 1;
      for (let k = 0; k < steps; k++) {
        const p = b
          ? { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps }
          : a;
        const d = near(p, reachMm);
        if (d <= reachMm) run.push({ p, d });
        else flush();
      }
    }
    flush();
  }
  return out;
}
