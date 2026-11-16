import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisKindV1,
} from './measurement-open-reference-display-v1';
import {
  SURFACE_ANCHOR_TABLE_V1,
  checkSurfaceAnchorsV1,
  evaluateSurfaceAnchorRulesV1,
  type SurfaceAnchorIdV1,
} from './measurement-surface-anchors-v1';
import {
  meshSurfaceEdgePointV1,
  meshSurfaceVertexPointV1,
  mirrorMeshSurfacePointV1,
  type MeshSurfacePointV1,
  type MeshSurfaceVec3V1,
} from './mesh-surface-path-v1';
import {
  createMeshSurfaceTopologyV1,
  type MeshSurfaceTopologyV1,
} from './mesh-surface-topology-v1';

const KINDS = Object.freeze([
  'female',
  'neutral',
  'male',
  'base',
] as const satisfies readonly MakeHumanOpenReferenceBasisKindV1[]);

const IDS = Object.freeze([
  'ssn',
  'c7',
  'hps-l',
  'hps-r',
  'underarm-l',
  'underarm-r',
  'crotch',
] as const satisfies readonly SurfaceAnchorIdV1[]);

const EXPECTED_FRACTIONS = Object.freeze({
  female: Object.freeze({ underarm: 0.7535, crotch: 0.462 }),
  neutral: Object.freeze({ underarm: 0.7535, crotch: 0.472 }),
  male: Object.freeze({ underarm: 0.752, crotch: 0.48 }),
  base: Object.freeze({ underarm: 0.7595, crotch: 0.464 }),
});

interface Fixture {
  readonly positionsM: Float32Array;
  readonly topology: MeshSurfaceTopologyV1;
  readonly minimumY: number;
  readonly heightM: number;
}

const fixtures = new Map<MakeHumanOpenReferenceBasisKindV1, Fixture>();
const checks = new Map<
  MakeHumanOpenReferenceBasisKindV1,
  ReturnType<typeof checkSurfaceAnchorsV1>
>();
const ruleEvaluations = new Map<
  MakeHumanOpenReferenceBasisKindV1,
  ReturnType<typeof evaluateSurfaceAnchorRulesV1>
>();

function fixture(kind: MakeHumanOpenReferenceBasisKindV1): Fixture {
  const cached = fixtures.get(kind);
  if (cached) return cached;
  const basis = parseMakeHumanOpenReferenceBasisV1(
    readFileSync(
      resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    ),
    kind,
  );
  const positionsM = Float32Array.from(
    basis.positionsSourceUnits,
    (value) => value * basis.sourceUnitScaleToM,
  );
  const built = createMeshSurfaceTopologyV1({ positionsM, triangleIndices: basis.indices });
  if (!built.ok)
    throw new Error(`${kind} topology failed: ${built.code}: ${built.errors.join('; ')}`);
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (let offset = 1; offset < positionsM.length; offset += 3) {
    minimumY = Math.min(minimumY, positionsM[offset]);
    maximumY = Math.max(maximumY, positionsM[offset]);
  }
  const current = Object.freeze({
    positionsM,
    topology: built.topology,
    minimumY,
    heightM: maximumY - minimumY,
  });
  fixtures.set(kind, current);
  return current;
}

function vertex(point: MeshSurfacePointV1): number {
  expect(point.kind).toBe('vertex');
  return point.kind === 'vertex' ? point.vertex : -1;
}

function checked(kind: MakeHumanOpenReferenceBasisKindV1) {
  const cached = checks.get(kind);
  if (cached) return cached;
  const result = checkSurfaceAnchorsV1(fixture(kind));
  checks.set(kind, result);
  return result;
}

function evaluated(kind: MakeHumanOpenReferenceBasisKindV1) {
  const cached = ruleEvaluations.get(kind);
  if (cached) return cached;
  const result = evaluateSurfaceAnchorRulesV1(fixture(kind));
  ruleEvaluations.set(kind, result);
  return result;
}

function separationMm(left: MeshSurfaceVec3V1, right: MeshSurfaceVec3V1): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]) * 1000;
}

/**
 * HPS plateau under the design §2.2 definition (scratch neck.mjs: 24.6 / 22.4 / 31.1 / 11.8 mm).
 * Male exceeds the design's own 30 mm runtime limit, so its HPS check fails honestly.
 */
const DESIGN_HPS_PLATEAU_MM = Object.freeze({
  female: 24.6,
  neutral: 22.4,
  male: 31.1,
  base: 11.8,
} as const satisfies Record<MakeHumanOpenReferenceBasisKindV1, number>);

describe('measurement surface anchors v1', () => {
  it.each(KINDS)(
    '%s HPS plateau reproduces the design definition',
    (kind) => {
      const rules = evaluated(kind);
      for (const id of ['hps-l', 'hps-r'] as const) {
        const rule = rules[id];
        expect(rule.ok, id).toBe(true);
        if (!rule.ok) continue;
        expect(Math.abs((rule.plateauMm ?? NaN) - DESIGN_HPS_PLATEAU_MM[kind])).toBeLessThanOrEqual(
          0.1,
        );
      }
    },
    30_000,
  );

  it('male fails only the HPS plateau limit, with an honest code', () => {
    const result = checked('male');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('anchor-check-failed');
    expect(result.failures.map((failure) => failure.id).sort()).toEqual(['hps-l', 'hps-r']);
    for (const failure of result.failures) {
      expect(failure.code).toBe('anchor-check-failed');
      expect(failure.detail).toMatch(/plateau/i);
    }
  }, 30_000);

  it.each(KINDS.filter((kind) => kind !== 'male'))(
    '%s rules pass on the real basis and report fractions and time',
    (kind) => {
      const current = fixture(kind);
      const startedAt = performance.now();
      const result = checkSurfaceAnchorsV1(current);
      const elapsedMs = performance.now() - startedAt;
      checks.set(kind, result);
      expect(result, result.ok ? kind : JSON.stringify(result.failures)).toMatchObject({
        ok: true,
      });
      if (!result.ok) return;

      const rows = IDS.map((id) => ({
        id,
        fractionH: result.heightFractions[id].toFixed(6),
        distanceMm: result.anchors[id].distanceMm.toFixed(3),
        plateauMm: result.anchors[id].plateauMm?.toFixed(3) ?? '-',
      }));
      console.info(`surface-anchors ${kind}: ${elapsedMs.toFixed(3)}ms`);
      console.table(rows);

      const expected = EXPECTED_FRACTIONS[kind];
      expect(result.heightFractions['underarm-l']).toBeCloseTo(expected.underarm, 2);
      expect(
        Math.abs(result.heightFractions['underarm-l'] - expected.underarm),
      ).toBeLessThanOrEqual(0.003);
      expect(result.heightFractions['underarm-r']).toBe(result.heightFractions['underarm-l']);
      expect(Math.abs(result.heightFractions.crotch - expected.crotch)).toBeLessThanOrEqual(0.003);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.anchors)).toBe(true);
      expect(Object.isFrozen(result.heightFractions)).toBe(true);
    },
    30_000,
  );

  it('uses the three gender bases as the consensus and records the non-voting base', () => {
    const genderKinds = ['female', 'neutral', 'male'] as const;
    const rules = Object.fromEntries(genderKinds.map((kind) => [kind, evaluated(kind)])) as Record<
      (typeof genderKinds)[number],
      ReturnType<typeof evaluateSurfaceAnchorRulesV1>
    >;
    const expectedVotes: Readonly<Record<SurfaceAnchorIdV1, readonly number[]>> = Object.freeze({
      ssn: Object.freeze([815, 815, 815]),
      c7: Object.freeze([857, 857, 857]),
      'hps-l': Object.freeze([8189, 8189, 8189]),
      'hps-r': Object.freeze([1505, 1505, 1505]),
      'underarm-l': Object.freeze([8337, 8336, 8336]),
      'underarm-r': Object.freeze([1665, 1664, 1664]),
      crotch: Object.freeze([4372, 4372, 4372]),
    });

    for (const id of IDS) {
      const votes = genderKinds.map((kind) => {
        const result = rules[kind][id];
        expect(result.ok, `${kind} ${id}`).toBe(true);
        return result.ok ? vertex(result.nearest) : -1;
      });
      expect(votes).toEqual(expectedVotes[id]);
      const counts = new Map<number, number>();
      votes.forEach((vote) => counts.set(vote, (counts.get(vote) ?? 0) + 1));
      const consensus = [...counts].sort(
        ([leftVertex, leftCount], [rightVertex, rightCount]) =>
          rightCount - leftCount || leftVertex - rightVertex,
      )[0][0];
      const table = SURFACE_ANCHOR_TABLE_V1.find((entry) => entry.id === id)!;
      if (id === 'underarm-l') {
        expect(table.template).toEqual(meshSurfaceEdgePointV1(8336, 8340, 0.4));
      } else if (id === 'underarm-r') {
        expect(table.template).toEqual(meshSurfaceEdgePointV1(1664, 1668, 0.4));
      } else {
        expect(vertex(table.template), id).toBe(consensus);
      }
    }

    const base = evaluated('base');
    const baseNearest = Object.fromEntries(
      IDS.map((id) => [id, base[id].ok ? vertex(base[id].nearest) : base[id].code]),
    );
    console.info('surface-anchor base nearest (non-voting)', baseNearest);
    expect(base.ssn.ok && vertex(base.ssn.nearest)).toBe(809);
  }, 30_000);

  it.each(KINDS)(
    '%s mirrors HPS and underarm templates and rules within 1 mm',
    (kind) => {
      const current = fixture(kind);
      const rules = evaluated(kind);
      for (const [leftId, rightId] of [
        ['hps-l', 'hps-r'],
        ['underarm-l', 'underarm-r'],
      ] as const) {
        const leftTable = SURFACE_ANCHOR_TABLE_V1.find((entry) => entry.id === leftId)!;
        const rightTable = SURFACE_ANCHOR_TABLE_V1.find((entry) => entry.id === rightId)!;
        expect(rightTable.template).toEqual(
          mirrorMeshSurfacePointV1(leftTable.template, current.topology),
        );
        expect(rightTable.mirrorOf).toBe(leftId);

        const left = rules[leftId];
        const right = rules[rightId];
        expect(left.ok && right.ok).toBe(true);
        if (!left.ok || !right.ok) continue;
        expect(right.nearest).toEqual(mirrorMeshSurfacePointV1(left.nearest, current.topology));
        expect(
          separationMm([-left.positionM[0], left.positionM[1], left.positionM[2]], right.positionM),
        ).toBeLessThanOrEqual(1);
      }
    },
    30_000,
  );

  it.each(KINDS)(
    '%s satisfies the frozen height order',
    (kind) => {
      const rules = evaluated(kind);
      const { ssn, c7 } = rules;
      expect(ssn.ok && c7.ok).toBe(true);
      if (!ssn.ok || !c7.ok) return;
      const ssnY = ssn.positionM[1];
      const c7Y = c7.positionM[1];
      expect(ssnY).toBeLessThan(c7Y);
      for (const id of ['hps-l', 'hps-r'] as const) {
        const hps = rules[id];
        expect(hps.ok).toBe(true);
        if (!hps.ok) continue;
        expect(hps.positionM[1]).toBeGreaterThanOrEqual(ssnY - 0.01);
        expect(hps.positionM[1]).toBeLessThanOrEqual(c7Y + 0.01);
      }
    },
    30_000,
  );

  it('rejects an SSN template outside its check band', () => {
    const current = fixture('neutral');
    const wrongTable = SURFACE_ANCHOR_TABLE_V1.map((entry) =>
      entry.id === 'ssn'
        ? Object.freeze({ ...entry, template: meshSurfaceVertexPointV1(857) })
        : entry,
    );
    const result = checkSurfaceAnchorsV1({ ...current, table: wrongTable });
    expect(result).toMatchObject({ ok: false, code: 'anchor-check-failed' });
    if (result.ok) return;
    expect(result.failures).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'ssn', code: 'anchor-check-failed' })]),
    );
    const failure = result.failures.find((candidate) => candidate.id === 'ssn');
    expect(failure?.distanceMm).toBeGreaterThan(40);
  }, 30_000);

  it('never accepts a neck whose back profile is shifted below SSN', () => {
    const current = fixture('neutral');
    const shifted = current.positionsM.slice();
    for (const component of current.topology.midlineVertexOrder) {
      for (const vertexIndex of component) {
        const offset = vertexIndex * 3;
        const fraction = (current.positionsM[offset + 1] - current.minimumY) / current.heightM;
        if (fraction >= 0.8 && fraction <= 0.88 && current.positionsM[offset + 2] < 0) {
          shifted[offset + 1] -= 0.08;
        }
      }
    }
    const result = checkSurfaceAnchorsV1({ topology: current.topology, positionsM: shifted });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(['height-order-broken', 'anchor-rule-failed']).toContain(result.code);
  }, 30_000);
});
