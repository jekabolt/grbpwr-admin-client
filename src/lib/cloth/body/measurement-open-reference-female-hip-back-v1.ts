import { evaluateMeasurementOpenReferenceDisplayQualityV1 } from './measurement-open-reference-display-quality-gate-v1';
import type { MeasurementOpenReferenceDisplayQualityGateResultV1 } from './measurement-open-reference-display-quality-gate-v1';
import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionVec3V1,
} from './mesh-plane-section-perimeter-v1';
import { meshPlaneSectionLoopTapePerimeterMV1 } from './mesh-plane-section-tape-girth-v1';

export const MEASUREMENT_OPEN_REFERENCE_FEMALE_HIP_BACK_V1 =
  'measurement-open-reference-female-hip-back/v1' as const;

/**
 * Female hip back share: posterior depth over tape (hull) girth at the hip level, where the hip
 * level is the height of greatest posterior protrusion between crotch + 0.01 H and crotch + 0.12 H
 * and the posterior depth is measured from the side-seam line (mean z of the section points within
 * 5 mm of either lateral extreme) to the backmost point.
 *
 * 0.145 is the mean of that ratio on the female scans of HSRD-100 (n 3, 95% CI 0.134-0.157, low
 * confidence). The HM08 female base measures about 0.13 on the same definition.
 *
 * Source: HSRD-100: 100 High-Quality 3D Human Scans Dataset, Digital Reality Lab (2025),
 * https://huggingface.co/datasets/digitalrealitylab/HSRD-100, CC BY 4.0
 * (https://creativecommons.org/licenses/by/4.0/). Statistic derived by measurement; not endorsed
 * by the authors. See docs/cloth-simulation/mannequin/hsrd-100-attribution.md.
 */
export const FEMALE_HIP_BACK_OVER_HIP_GIRTH_V1 = 0.145;

/** Back scale and in-plane scale bounds; outside them the body is left unchanged. */
const MAXIMUM_BACK_SCALE = 1.3;
const MINIMUM_SECTION_SCALE = 0.9;
/** Girth correction passes after the share solve, against the girths of the changed mesh. */
const GIRTH_CORRECTION_PASSES = 2;
/** Hip station tape girth and waist cross-talk tolerance (mm), as the waist/hip solver. */
const GIRTH_TOLERANCE_MM = 0.5;
/** Ratio the solve stops at; the hip-level ratio of the result must sit within REPORT tolerance. */
const RATIO_SOLVE_TOLERANCE = 0.0002;
const RATIO_RESULT_TOLERANCE = 0.005;
/** Side-seam ramp half-width (m): the push fades in over 10 mm on either side of the seam line. */
const SEAM_RAMP_M = 0.01;
const SECTION_POLICY = Object.freeze({ weldToleranceM: 0.00002 });
const PROFILE_STEP_M = 0.002;
const TABLE_STEP_M = 0.004;
const SLICE_M = 0.01;

type Vec3 = readonly [number, number, number];

interface SectionStatsV1 {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly sideZ: number;
  readonly centerX: number;
  readonly girthM: number;
  readonly pointsM: readonly MeshPlaneSectionVec3V1[];
}

export interface FemaleHipBackShareMeasurementV1 {
  readonly crotchY: number;
  readonly levelY: number;
  readonly backM: number;
  readonly girthM: number;
  readonly ratio: number;
}

export type FemaleHipBackShareStatusV1 = 'applied' | 'unchanged' | 'rejected';

export interface FemaleHipBackShareResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_FEMALE_HIP_BACK_V1;
  readonly status: FemaleHipBackShareStatusV1;
  readonly positionsM: Float32Array;
  readonly qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1 | null;
  readonly before: FemaleHipBackShareMeasurementV1 | null;
  readonly after: FemaleHipBackShareMeasurementV1 | null;
  readonly backScale: number;
  readonly sectionScale: number;
  readonly message: string;
}

function sectionStats(
  positionsM: Float32Array,
  triangleIndices: Uint16Array | Uint32Array,
  y: number,
  seedXZ: readonly [number, number],
): SectionStatsV1 | null {
  const originM: MeshPlaneSectionVec3V1 = [seedXZ[0], y, seedXZ[1]];
  let section;
  try {
    section = measureMeshPlaneSectionPerimetersV1({
      positionsM,
      triangleIndices,
      planeOriginM: originM,
      planeNormal: [0, 1, 0],
      selection: { kind: 'nearest-seed', seedM: originM },
      policy: SECTION_POLICY,
    });
  } catch {
    return null;
  }
  if (!section.ok || !section.selectedLoop || section.selectedLoop.pointsM.length < 3) return null;
  const points = section.selectedLoop.pointsM;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minZ = Math.min(minZ, point[2]);
    maxZ = Math.max(maxZ, point[2]);
  }
  const band = 0.005;
  let leftZ = 0;
  let leftN = 0;
  let rightZ = 0;
  let rightN = 0;
  for (const point of points) {
    if (point[0] <= minX + band) {
      leftZ += point[2];
      leftN += 1;
    }
    if (point[0] >= maxX - band) {
      rightZ += point[2];
      rightN += 1;
    }
  }
  let girthM: number;
  try {
    girthM = meshPlaneSectionLoopTapePerimeterMV1(section.selectedLoop);
  } catch {
    return null;
  }
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    sideZ: leftN && rightN ? (leftZ / leftN + rightZ / rightN) / 2 : (minZ + maxZ) / 2,
    centerX: (minX + maxX) / 2,
    girthM,
    pointsM: points,
  };
}

/** Triangles whose height span meets [lowY, highY]: every plane section in that range is closed. */
function trianglesInBand(
  positionsM: Float32Array,
  triangleIndices: Uint16Array | Uint32Array,
  lowY: number,
  highY: number,
): Uint32Array {
  const kept: number[] = [];
  for (let t = 0; t < triangleIndices.length; t += 3) {
    const a = positionsM[triangleIndices[t] * 3 + 1];
    const b = positionsM[triangleIndices[t + 1] * 3 + 1];
    const c = positionsM[triangleIndices[t + 2] * 3 + 1];
    if (Math.max(a, b, c) >= lowY && Math.min(a, b, c) <= highY) {
      kept.push(triangleIndices[t], triangleIndices[t + 1], triangleIndices[t + 2]);
    }
  }
  return Uint32Array.from(kept);
}

/**
 * Triangles by 10 mm height slice. A horizontal section at y only meets triangles whose height span
 * holds y, so each section reads its own slice instead of the whole band (the result is the same:
 * the kept triangles are an order-preserving subset that contains every triangle the plane cuts).
 * The hip back change never moves a vertex in y, so slices built once serve every changed mesh.
 */
function triangleSlices(
  positionsM: Float32Array,
  triangleIndices: Uint16Array | Uint32Array,
  lowY: number,
  highY: number,
): (y: number) => Uint32Array {
  const count = Math.max(1, Math.ceil((highY - lowY) / SLICE_M));
  const buckets: number[][] = Array.from({ length: count }, () => []);
  for (let t = 0; t < triangleIndices.length; t += 3) {
    const a = positionsM[triangleIndices[t] * 3 + 1];
    const b = positionsM[triangleIndices[t + 1] * 3 + 1];
    const c = positionsM[triangleIndices[t + 2] * 3 + 1];
    const low = Math.min(a, b, c);
    const high = Math.max(a, b, c);
    if (high < lowY || low > highY) continue;
    const first = Math.max(0, Math.floor((low - lowY) / SLICE_M));
    const last = Math.min(count - 1, Math.floor((high - lowY) / SLICE_M));
    for (let k = first; k <= last; k += 1) {
      buckets[k].push(triangleIndices[t], triangleIndices[t + 1], triangleIndices[t + 2]);
    }
  }
  const slices = buckets.map((bucket) => Uint32Array.from(bucket));
  const empty = new Uint32Array(0);
  return (y) => {
    const k = Math.floor((y - lowY) / SLICE_M);
    return k >= 0 && k < count ? slices[k] : empty;
  };
}

function spansMidline(stats: SectionStatsV1 | null, midX: number): boolean {
  return stats != null && stats.minX < midX - 0.03 && stats.maxX > midX + 0.03;
}

function smooth(values: readonly number[], half = 2): number[] {
  return values.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (let k = index - half; k <= index + half; k += 1) {
      if (k >= 0 && k < values.length && Number.isFinite(values[k])) {
        sum += values[k];
        count += 1;
      }
    }
    return count ? sum / count : Number.NaN;
  });
}

/**
 * Hip back share of a closed body mesh on the definition above. The crotch is the lowest height at
 * which the torso section around the hip station still spans the midline (1 mm resolution).
 */
export function measureFemaleHipBackShareV1(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly heightM: number;
  readonly hipStationM: Vec3;
}): FemaleHipBackShareMeasurementV1 | null {
  const H = options.heightM;
  const seed: [number, number] = [options.hipStationM[0], options.hipStationM[2]];
  const midX = options.hipStationM[0];
  const hipY = options.hipStationM[1];
  const slices = triangleSlices(
    options.positionsM,
    options.triangleIndices,
    hipY - 0.25 * H,
    hipY + 0.2 * H,
  );
  const at = (y: number) => sectionStats(options.positionsM, slices(y), y, seed);
  if (!spansMidline(at(hipY), midX)) return null;
  let low = hipY;
  while (low > hipY - 0.2 * H && spansMidline(at(low - 0.005), midX)) low -= 0.005;
  let crotchY = low;
  for (let y = low - 0.004; y < low; y += 0.001) {
    if (spansMidline(at(y), midX)) {
      crotchY = y;
      break;
    }
  }
  const ys: number[] = [];
  const stats: (SectionStatsV1 | null)[] = [];
  for (let y = crotchY + 0.01 * H; y <= crotchY + 0.12 * H + 1e-9; y += PROFILE_STEP_M) {
    ys.push(y);
    stats.push(at(y));
  }
  const protrusion = smooth(stats.map((s) => (s ? s.sideZ - s.minZ : Number.NaN)));
  let best = -1;
  for (let index = 0; index < protrusion.length; index += 1) {
    if (!Number.isFinite(protrusion[index])) continue;
    if (best < 0 || protrusion[index] > protrusion[best]) best = index;
  }
  const level = best >= 0 ? stats[best] : null;
  if (!level) return null;
  const backM = level.sideZ - level.minZ;
  return { crotchY, levelY: ys[best], backM, girthM: level.girthM, ratio: backM / level.girthM };
}

function smoothBump(distance: number, radius: number): number {
  if (radius <= 0 || Math.abs(distance) >= radius) return 0;
  const q = 1 - (distance / radius) ** 2;
  return q * q;
}

function lateralWeight(offset: number, radiusX: number): number {
  const a = Math.abs(offset) / Math.max(radiusX, 1e-6);
  if (a <= 1.15) return 1;
  if (a >= 1.45) return 0;
  const t = (1.45 - a) / 0.3;
  return t * t * (3 - 2 * t);
}

/**
 * Vertices strictly inside (lowY, highY) that are connected, through edges inside the band, to the
 * vertex nearest the seed. Started from the buttock surface this is the torso part of the band: a
 * forearm or hand hanging into the band joins the torso only at the shoulder, above it.
 */
function bandComponent(
  positionsM: Float32Array,
  triangleIndices: Uint16Array | Uint32Array,
  lowY: number,
  highY: number,
  seedM: Vec3,
): Uint8Array {
  const vertexCount = positionsM.length / 3;
  const inBand = (v: number) => positionsM[v * 3 + 1] > lowY && positionsM[v * 3 + 1] < highY;
  const parent = new Int32Array(vertexCount);
  for (let v = 0; v < vertexCount; v += 1) parent[v] = v;
  const find = (v: number) => {
    let root = v;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]];
      root = parent[root];
    }
    return root;
  };
  const join = (a: number, b: number) => {
    if (inBand(a) && inBand(b)) parent[find(a)] = find(b);
  };
  for (let t = 0; t < triangleIndices.length; t += 3) {
    join(triangleIndices[t], triangleIndices[t + 1]);
    join(triangleIndices[t + 1], triangleIndices[t + 2]);
    join(triangleIndices[t + 2], triangleIndices[t]);
  }
  let seed = -1;
  let best = Infinity;
  for (let v = 0; v < vertexCount; v += 1) {
    if (!inBand(v)) continue;
    const d = Math.hypot(
      positionsM[v * 3] - seedM[0],
      positionsM[v * 3 + 1] - seedM[1],
      positionsM[v * 3 + 2] - seedM[2],
    );
    if (d < best) {
      best = d;
      seed = v;
    }
  }
  const member = new Uint8Array(vertexCount);
  if (seed < 0) return member;
  const root = find(seed);
  for (let v = 0; v < vertexCount; v += 1) if (inBand(v) && find(v) === root) member[v] = 1;
  return member;
}

/** C1 ramp: 0 in front of the seam band, the distance behind the seam line past it. */
function seamRamp(behindM: number): number {
  if (behindM >= SEAM_RAMP_M) return behindM;
  if (behindM <= -SEAM_RAMP_M) return 0;
  return (behindM + SEAM_RAMP_M) ** 2 / (4 * SEAM_RAMP_M);
}

/**
 * Female only: deepens the buttock behind the side-seam line until the hip back share reaches
 * FEMALE_HIP_BACK_OVER_HIP_GIRTH_V1, and scales each moved section in plane back to its own tape
 * girth, so every level, the hip station included, keeps the girth the waist/hip solve gave it.
 * The change is a smooth bump centred on the hip level that ends above the crotch and well below
 * the waist station, so the waist girth, the legs and every limb are untouched. Heights never change. A body already at or above the share, or one
 * that would need more than the bounded change, is returned unchanged.
 */
export function applyFemaleHipBackShareV1(options: {
  readonly positionsM: Float32Array;
  readonly uniformPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly heightM: number;
  readonly hipStationM: Vec3;
  readonly waistStationM: Vec3;
  readonly targetRatio?: number;
}): FemaleHipBackShareResultV1 {
  const target = options.targetRatio ?? FEMALE_HIP_BACK_OVER_HIP_GIRTH_V1;
  const unchanged = (
    status: 'unchanged' | 'rejected',
    message: string,
    before: FemaleHipBackShareMeasurementV1 | null,
  ): FemaleHipBackShareResultV1 =>
    Object.freeze({
      version: MEASUREMENT_OPEN_REFERENCE_FEMALE_HIP_BACK_V1,
      status,
      positionsM: options.positionsM,
      qualityGate: null,
      before,
      after: null,
      backScale: 1,
      sectionScale: 1,
      message,
    });

  const measure = (positionsM: Float32Array) =>
    measureFemaleHipBackShareV1({
      positionsM,
      triangleIndices: options.triangleIndices,
      heightM: options.heightM,
      hipStationM: options.hipStationM,
    });
  const before = measure(options.positionsM);
  if (!before) return unchanged('rejected', 'Hip level not found.', null);
  if (before.ratio >= target) {
    return unchanged(
      'unchanged',
      `Hip back share ${before.ratio.toFixed(4)} is already at or above ${target}.`,
      before,
    );
  }

  const levelY = before.levelY;
  const waistY = options.waistStationM[1];
  const radiusDown = 0.8 * (levelY - before.crotchY);
  const radiusUp = 0.45 * (waistY - levelY);
  if (!(radiusDown > 0.02 && radiusUp > 0.02)) {
    return unchanged(
      'rejected',
      'Hip level is too close to the crotch or the waist station.',
      before,
    );
  }
  const lowY = levelY - radiusDown;
  const highY = levelY + radiusUp;
  const seed: [number, number] = [options.hipStationM[0], options.hipStationM[2]];
  const bandSlices = triangleSlices(
    options.positionsM,
    options.triangleIndices,
    lowY - 0.01,
    highY + 0.01,
  );

  // Side-seam line, centre and half width per height, interpolated between 4 mm sections.
  const tableYs: number[] = [];
  const table: SectionStatsV1[] = [];
  for (let y = lowY; y < highY + TABLE_STEP_M; y += TABLE_STEP_M) {
    const tableY = Math.min(y, highY);
    const stats = sectionStats(options.positionsM, bandSlices(tableY), tableY, seed);
    if (!stats) return unchanged('rejected', `No torso section at ${y.toFixed(3)} m.`, before);
    tableYs.push(Math.min(y, highY));
    table.push(stats);
  }
  const lookup = (y: number) => {
    const f = Math.min(Math.max((y - lowY) / TABLE_STEP_M, 0), table.length - 1);
    const i = Math.min(Math.floor(f), table.length - 2);
    const t = f - i;
    const a = table[i];
    const b = table[i + 1];
    return {
      index: i,
      t,
      sideZ: a.sideZ + (b.sideZ - a.sideZ) * t,
      centerX: a.centerX + (b.centerX - a.centerX) * t,
      radiusX: (a.maxX - a.minX + (b.maxX - b.minX - (a.maxX - a.minX)) * t) / 2,
    };
  };
  const bumpAt = (y: number) => smoothBump(y - levelY, y < levelY ? radiusDown : radiusUp);

  // The posterior push of each level, per unit of back scale, on that level's own section points.
  const levelPush = table.map((stats, index) => {
    const bump = bumpAt(tableYs[index]);
    const radiusX = (stats.maxX - stats.minX) / 2;
    return stats.pointsM.map(
      ([x, , z]) => -bump * lateralWeight(x - stats.centerX, radiusX) * seamRamp(stats.sideZ - z),
    );
  });
  /**
   * In-plane scale of each level about (centre x, seam z) that returns the pushed section to its own
   * tape girth: a hull scales with its points, so the scale is the girth before over the girth after
   * the push. Heights never change, so every level keeps its girth up to the 4 mm interpolation.
   */
  const levelScales = (backScale: number) =>
    table.map((stats, index) => {
      const b = backScale - 1;
      if (b === 0) return 1;
      const pushed = stats.pointsM.map(
        ([x, y, z], k): MeshPlaneSectionVec3V1 => [x, y, z + b * levelPush[index][k]],
      );
      return stats.girthM / meshPlaneSectionLoopTapePerimeterMV1({ pointsM: pushed });
    });

  // Torso vertices of the band, with their offsets from the level's centre/seam and unit push.
  const levelStats = table[Math.round((levelY - lowY) / TABLE_STEP_M)];
  const torso = bandComponent(options.positionsM, options.triangleIndices, lowY, highY, [
    levelStats.centerX,
    levelY,
    levelStats.minZ,
  ]);
  const vertexCount = options.positionsM.length / 3;
  const moved: number[] = [];
  const rows: { index: number; t: number }[] = [];
  const offsetX: number[] = [];
  const offsetZ: number[] = [];
  const pushZ: number[] = [];
  for (let v = 0; v < vertexCount; v += 1) {
    if (!torso[v]) continue;
    const y = options.positionsM[v * 3 + 1];
    const x = options.positionsM[v * 3];
    const z = options.positionsM[v * 3 + 2];
    const row = lookup(y);
    const w = bumpAt(y) * lateralWeight(x - row.centerX, row.radiusX);
    if (w <= 0) continue;
    moved.push(v);
    rows.push({ index: row.index, t: row.t });
    offsetX.push(x - row.centerX);
    offsetZ.push(z - row.sideZ);
    pushZ.push(-w * seamRamp(row.sideZ - z));
  }
  const deform = (backScale: number, scales = levelScales(backScale)) => {
    const out = options.positionsM.slice();
    const b = backScale - 1;
    for (let k = 0; k < moved.length; k += 1) {
      const v = moved[k];
      const { index, t } = rows[k];
      const scale = scales[index] + (scales[index + 1] - scales[index]) * t;
      out[v * 3] = options.positionsM[v * 3] + (scale - 1) * offsetX[k];
      out[v * 3 + 2] =
        options.positionsM[v * 3 + 2] + (scale - 1) * offsetZ[k] + scale * b * pushZ[k];
    }
    return { positionsM: out, scales };
  };
  const girthAt = (positionsM: Float32Array, station: Vec3, indices: Uint16Array | Uint32Array) =>
    sectionStats(positionsM, indices, station[1], [station[0], station[2]])?.girthM;

  const hipIndices = trianglesInBand(
    options.positionsM,
    options.triangleIndices,
    options.hipStationM[1] - 0.01,
    options.hipStationM[1] + 0.01,
  );
  const hipGirth0 = girthAt(options.positionsM, options.hipStationM, hipIndices);
  if (hipGirth0 == null) return unchanged('rejected', 'Hip station section not found.', before);

  // Secant on a monotone scalar function, bracketed to [lo, hi].
  const secant = (
    f: (x: number) => number | undefined,
    x0: number,
    x1: number,
    lo: number,
    hi: number,
    tolerance: number,
  ) => {
    let a = x0;
    let fa = f(a);
    let b = x1;
    let fb = f(b);
    for (let iteration = 0; iteration < 12; iteration += 1) {
      if (fa == null || fb == null) return undefined;
      if (Math.abs(fb) <= tolerance) return b;
      if (fb === fa) return undefined;
      const next = Math.min(Math.max(b - (fb * (b - a)) / (fb - fa), lo), hi);
      if (next === b) return Math.abs(fb) <= tolerance ? b : undefined;
      a = b;
      fa = fb;
      b = next;
      fb = f(b);
    }
    return fb != null && Math.abs(fb) <= tolerance ? b : undefined;
  };
  const ratioAt = (positionsM: Float32Array) => {
    const stats = sectionStats(positionsM, bandSlices(levelY), levelY, seed);
    return stats ? (stats.sideZ - stats.minZ) / stats.girthM : undefined;
  };
  const backScale = secant(
    (k) => {
      const ratio = ratioAt(deform(k).positionsM);
      return ratio == null ? undefined : ratio - target;
    },
    1,
    1.1,
    1,
    MAXIMUM_BACK_SCALE,
    RATIO_SOLVE_TOLERANCE,
  );
  if (backScale == null) {
    return unchanged(
      'rejected',
      `Hip back share ${target} is not reachable within the bounded change.`,
      before,
    );
  }
  let { positionsM, scales } = deform(backScale);
  // A section also cuts edges to vertices above and below it, which move with their own scales;
  // multiplicative passes on the girths measured after the change remove that coupling.
  for (let pass = 0; pass < GIRTH_CORRECTION_PASSES; pass += 1) {
    const measured = positionsM;
    const corrected = scales.map((scale, index) => {
      const girthM = sectionStats(
        measured,
        bandSlices(tableYs[index]),
        tableYs[index],
        seed,
      )?.girthM;
      return girthM ? (scale * table[index].girthM) / girthM : scale;
    });
    ({ positionsM, scales } = deform(backScale, corrected));
  }
  const sectionScale = scales[Math.round((levelY - lowY) / TABLE_STEP_M)];
  const smallestScale = Math.min(...scales);

  const after = measure(positionsM);
  const hipGirth = girthAt(positionsM, options.hipStationM, hipIndices);
  const waistIndices = trianglesInBand(
    options.positionsM,
    options.triangleIndices,
    waistY - 0.01,
    waistY + 0.01,
  );
  const waistBefore = girthAt(options.positionsM, options.waistStationM, waistIndices);
  const waistAfter = girthAt(positionsM, options.waistStationM, waistIndices);
  const problems: string[] = [];
  if (smallestScale < MINIMUM_SECTION_SCALE)
    problems.push(`section scale ${smallestScale.toFixed(3)}`);
  if (!after || Math.abs(after.ratio - target) > RATIO_RESULT_TOLERANCE) {
    problems.push(`hip-level share ${after ? after.ratio.toFixed(4) : 'unmeasured'}`);
  }
  if (hipGirth == null || Math.abs(hipGirth - hipGirth0) * 1000 > GIRTH_TOLERANCE_MM) {
    problems.push('hip station girth moved');
  }
  if (
    waistBefore == null ||
    waistAfter == null ||
    Math.abs(waistAfter - waistBefore) * 1000 > GIRTH_TOLERANCE_MM
  ) {
    problems.push('waist girth moved');
  }
  const qualityGate = evaluateMeasurementOpenReferenceDisplayQualityV1({
    uniformPositionsM: options.uniformPositionsM,
    personalizedPositionsM: positionsM,
    triangleIndices: options.triangleIndices,
  });
  if (!qualityGate.safe) problems.push(`quality gate: ${qualityGate.reasons.join('+')}`);
  if (problems.length > 0) {
    return unchanged('rejected', `Hip back share rejected (${problems.join(', ')}).`, before);
  }
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_FEMALE_HIP_BACK_V1,
    status: 'applied' as const,
    positionsM,
    qualityGate,
    before,
    after,
    backScale,
    sectionScale,
    message: `Hip back share ${before.ratio.toFixed(4)} -> ${after!.ratio.toFixed(4)} (back x${backScale.toFixed(3)}, section x${sectionScale.toFixed(4)}).`,
  });
}
