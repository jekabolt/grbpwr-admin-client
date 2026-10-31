// A loose layer can still have a precise place on an assembled unit: pocket bags are often cut
// with the garment's shoulder / neck / armhole as part of their own outline. Find that place from
// the outlines themselves, without treating a partial seam as a rigid anchor.

import type { Affine, PieceGeom, Pt2 } from '../types';
import { apply } from './affine';
import { intersectArea, rasterize, thin, unionRaster, type Raster } from './overlap';

export type LayerOutlineFitOptions = {
  /** Raster row step for the containment test, mm. */
  rasterMm?: number;
  /** Largest point-to-outline distance counted as coincident, mm. */
  outlineMm?: number;
  /** Smallest share of the layer that must lie inside the host union. */
  insideMin?: number;
  /** Smallest coincident share of the layer perimeter. */
  outlineMinShare?: number;
  /** Smallest total coincident outline, mm. */
  outlineMinMm?: number;
  /** Smallest uninterrupted coincident run, mm. */
  runMinMm?: number;
  /** Largest allowed lean from the layer's own up, rad. */
  uprightMax?: number;
};

export type LayerOutlineFit = {
  T: Affine;
  inside: number;
  outlineMm: number;
  outlineShare: number;
  runMm: number;
};

type Sample = { p: Pt2; t: Pt2 };

const signedArea = (ring: readonly Pt2[]) => {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  return area / 2;
};

const perimeter = (ring: readonly Pt2[]) => {
  let length = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    length += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return length;
};

/** Evenly spaced points and smoothed tangents around a closed ring. */
function sampleRing(ring: readonly Pt2[], spacing: number): { samples: Sample[]; step: number } {
  const length = perimeter(ring);
  const count = Math.max(3, Math.ceil(length / spacing));
  const step = length / count;
  const points: Pt2[] = [];
  let segment = 0;
  let start = ring[0];
  let end = ring[1 % ring.length];
  let segmentStart = 0;
  let segmentLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
  for (let i = 0; i < count; i++) {
    const distance = i * step;
    while (segment < ring.length - 1 && distance > segmentStart + segmentLength) {
      segmentStart += segmentLength;
      segment++;
      start = ring[segment];
      end = ring[(segment + 1) % ring.length];
      segmentLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
    }
    const share = segmentLength > 0 ? (distance - segmentStart) / segmentLength : 0;
    points.push([start[0] + share * (end[0] - start[0]), start[1] + share * (end[1] - start[1])]);
  }
  return {
    samples: points.map((p, i) => {
      const before = points[(i - 1 + count) % count];
      const after = points[(i + 1) % count];
      const length = Math.hypot(after[0] - before[0], after[1] - before[1]) || 1;
      return { p, t: [(after[0] - before[0]) / length, (after[1] - before[1]) / length] };
    }),
    step,
  };
}

const insideRaster = (raster: Raster, [x, y]: Pt2) => {
  const row = raster.rows[Math.floor(y / raster.step) - raster.i0];
  if (!row) return false;
  for (let i = 0; i < row.length; i += 2) if (row[i] <= x && x <= row[i + 1]) return true;
  return false;
};

const rotationFit = (from: Sample, to: Sample): Affine => {
  const angle = Math.atan2(to.t[1], to.t[0]) - Math.atan2(from.t[1], from.t[0]);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    c,
    s,
    -s,
    c,
    to.p[0] - c * from.p[0] + s * from.p[1],
    to.p[1] - s * from.p[0] - c * from.p[1],
  ];
};

const longestRun = (matched: readonly boolean[]) => {
  let longest = 0;
  let run = 0;
  for (let i = 0; i < matched.length * 2; i++) {
    run = matched[i % matched.length] ? Math.min(matched.length, run + 1) : 0;
    longest = Math.max(longest, run);
  }
  return longest;
};

/**
 * Place one layer rigidly, never mirrored, where its outline best coincides with the exposed
 * outline of already laid host pieces. A fit is returned only when the layer is almost wholly
 * inside the host union and the coincidence contains a long run.
 */
export function fitLayerToHostUnion(
  layerKey: string,
  hostKeys: readonly string[],
  at: ReadonlyMap<string, Affine>,
  geoms: ReadonlyMap<string, PieceGeom>,
  opts: LayerOutlineFitOptions = {},
): LayerOutlineFit | null {
  const layer = geoms.get(layerKey);
  const hosts = hostKeys.flatMap((key) => {
    const geom = geoms.get(key);
    const T = at.get(key);
    return geom && T ? [{ ring: geom.rs.map((point) => apply(T, point)) }] : [];
  });
  if (!layer || layer.rs.length < 3 || !hosts.length) return null;

  const rasterMm = opts.rasterMm ?? 2;
  const outlineMm = opts.outlineMm ?? 4;
  const insideMin = opts.insideMin ?? 0.9;
  const outlineMinShare = opts.outlineMinShare ?? 0.2;
  const outlineMinMm = opts.outlineMinMm ?? 150;
  const runMinMm = opts.runMinMm ?? 60;
  const uprightMax = opts.uprightMax ?? Math.PI;
  const hostRaster = unionRaster(hosts.map((host) => rasterize(thin(host.ring), rasterMm)));
  if (!hostRaster) return null;

  // Keep only exposed host outline. An edge between two assembled host pieces has cloth on both
  // sides and cannot be the outline coincidence that locates a layer.
  const outlineStep = Math.min(2, outlineMm / 2);
  const probe = Math.max(outlineMm, rasterMm * 2);
  const exposed: Sample[] = [];
  for (const host of hosts) {
    const { samples } = sampleRing(host.ring, outlineStep);
    const ccw = signedArea(host.ring) >= 0;
    for (const sample of samples) {
      const outward: Pt2 = ccw ? [sample.t[1], -sample.t[0]] : [-sample.t[1], sample.t[0]];
      const outside: Pt2 = [sample.p[0] + outward[0] * probe, sample.p[1] + outward[1] * probe];
      const inside: Pt2 = [sample.p[0] - outward[0] * probe, sample.p[1] - outward[1] * probe];
      if (!insideRaster(hostRaster, outside) && insideRaster(hostRaster, inside))
        exposed.push(sample);
    }
  }
  if (!exposed.length) return null;

  const cell = outlineMm;
  const grid = new Map<string, Pt2[]>();
  const cellKey = (x: number, y: number) => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
  for (const sample of exposed) {
    const key = cellKey(sample.p[0], sample.p[1]);
    grid.set(key, [...(grid.get(key) ?? []), sample.p]);
  }
  const nearOutline = ([x, y]: Pt2) => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        if (
          (grid.get(`${gx + dx}:${gy + dy}`) ?? []).some(
            (point) => Math.hypot(x - point[0], y - point[1]) <= outlineMm,
          )
        )
          return true;
    return false;
  };

  const dense = sampleRing(layer.rs, outlineStep);
  const stride = Math.max(1, Math.round(18 / outlineStep));
  const layerAnchors = dense.samples.filter((_, index) => index % stride === 0);
  const hostAnchors = exposed.filter((_, index) => index % stride === 0);
  // Vote in a coarse rigid-motion grid before doing any outline-distance work. A genuine shared
  // run proposes the same motion at many points; unrelated tangent pairs propose isolated ones.
  // Scoring every pair made corpus pictures quadratic in two full garment perimeters.
  const candidates = new Map<
    string,
    { count: number; cosine: number; sine: number; x: number; y: number }
  >();
  for (const from of layerAnchors)
    for (const to of hostAnchors) {
      const T = rotationFit(from, to);
      const tilt = Math.atan2(Math.abs(T[2]), T[3]);
      if (tilt > uprightMax) continue;
      const angle = Math.atan2(T[1], T[0]);
      const key = `${Math.round((angle * 90) / Math.PI)}:${Math.round(T[4] / 4)}:${Math.round(T[5] / 4)}`;
      const vote = candidates.get(key) ?? { count: 0, cosine: 0, sine: 0, x: 0, y: 0 };
      vote.count++;
      vote.cosine += T[0];
      vote.sine += T[1];
      vote.x += T[4];
      vote.y += T[5];
      candidates.set(key, vote);
    }

  // Rank cheaply first; the exact run and containment tests are reserved for the best candidates.
  const quick = dense.samples.filter((_, index) => index % 4 === 0);
  const voted = [...candidates.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 320)
    .map((vote): Affine => {
      const length = Math.hypot(vote.cosine, vote.sine) || 1;
      const c = vote.cosine / length;
      const s = vote.sine / length;
      return [c, s, -s, c, vote.x / vote.count, vote.y / vote.count];
    });
  const ranked = voted
    .map((T) => ({
      T,
      score: quick.reduce((sum, sample) => sum + Number(nearOutline(apply(T, sample.p))), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);

  const measured = ranked
    .map(({ T }) => {
      const matched = dense.samples.map((sample) => nearOutline(apply(T, sample.p)));
      const count = matched.reduce((sum, yes) => sum + Number(yes), 0);
      const outline = count * dense.step;
      const run = longestRun(matched) * dense.step;
      return {
        T,
        outline,
        share: outline / (dense.step * dense.samples.length),
        run,
        score: outline + run / 2,
      };
    })
    .filter(
      (fit) => fit.outline >= outlineMinMm && fit.share >= outlineMinShare && fit.run >= runMinMm,
    )
    .sort((a, b) => b.score - a.score);

  for (const fit of measured) {
    const ring = thin(layer.rs).map((point) => apply(fit.T, point));
    const raster = rasterize(ring, rasterMm);
    const inside = raster.area > 0 ? intersectArea(raster, hostRaster) / raster.area : 0;
    if (inside + 1e-9 < insideMin) continue;
    return {
      T: fit.T,
      inside,
      outlineMm: fit.outline,
      outlineShare: fit.share,
      runMm: fit.run,
    };
  }
  return null;
}
