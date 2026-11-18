import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { createMakeHumanAnteriorChestShoulderModesResearchV1 } from './makehuman-anterior-chest-shoulder-modes-research-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisKindV1,
} from './measurement-open-reference-display-v1';
import {
  FEMALE_UNDERBUST_FOLD_STATION_RULE_V1,
  resolveMeasurementOpenReferenceFemaleUnderBustFoldYV1,
} from './measurement-open-reference-female-underbust-fold-station-v1';

const workspace = process.cwd();
const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readFileSync(resolve(workspace, 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin')),
);

function loadBasis(kind: MakeHumanOpenReferenceBasisKindV1) {
  return parseMakeHumanOpenReferenceBasisV1(
    readFileSync(resolve(workspace, MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath)),
    kind,
  );
}

/** Licences a shipped constant may come from (lane rule: public domain, CC0, CC BY, own code). */
const SHIPPABLE_LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'public-domain', 'project code']);

/** ANSUR II female rows (public domain), outside the 200+200 validation holdout: short, mid, tall. */
const ANSUR_FEMALE_FIXTURES = [
  {
    subject: 18105,
    height: 1525,
    shoulder: 364,
    chest: 838,
    waist: 736,
    hip: 875,
    arm: 489,
    inseam: 753,
  },
  {
    subject: 25040,
    height: 1685,
    shoulder: 377,
    chest: 906,
    waist: 824,
    hip: 1015,
    arm: 582,
    inseam: 835,
  },
  {
    subject: 27849,
    height: 1740,
    shoulder: 365,
    chest: 881,
    waist: 730,
    hip: 945,
    arm: 591,
    inseam: 875,
  },
] as const;

function measurements(row: (typeof ANSUR_FEMALE_FIXTURES)[number]): CanonicalBodyMeasurementsMm {
  return Object.freeze({
    schemaVersion: 'canonical-body-measurements-v1',
    heightMm: row.height,
    shoulderBreadthMm: row.shoulder,
    chestCircumferenceMm: row.chest,
    waistCircumferenceMm: row.waist,
    hipCircumferenceMm: row.hip,
    armLengthMm: row.arm,
    inseamMm: row.inseam,
  }) as CanonicalBodyMeasurementsMm;
}

/** `bustPath`: the torso worker sets the fold option exactly when the female bust bundle loaded. */
function modesFor(
  kind: MakeHumanOpenReferenceBasisKindV1,
  body: CanonicalBodyMeasurementsMm,
  bustPath = true,
) {
  const basis = loadBasis(kind);
  const modes = createMakeHumanAnteriorChestShoulderModesResearchV1({
    basis,
    measurements: body,
    bundle: torsoBundle,
    underBustAtFemaleFold: bustPath,
  });
  const chest = modes.modes.find(({ measurementKey }) => measurementKey === 'chestCircumferenceMm');
  if (!chest?.chestStationOriginM) throw new Error('Test chest station is missing.');
  return { basis, modes, chestStationY: chest.chestStationOriginM[1] };
}

/** The bounded height fallback every base used before the fold rule. */
function heightFallbackY(chestStationY: number, heightMm: number): number {
  return chestStationY - Math.min(0.085, Math.max(0.045, (heightMm / 1000) * 0.04));
}

describe('female under-bust fold station', () => {
  it('is geometry only: no data-fitted constant, every source shippable', () => {
    const rule = FEMALE_UNDERBUST_FOLD_STATION_RULE_V1;
    expect(rule.dataFittedConstants).toBe(0);
    expect(rule.sources.length).toBeGreaterThan(0);
    for (const source of rule.sources) expect(SHIPPABLE_LICENCES.has(source.licence)).toBe(true);
    expect(rule.walkStartBelowChestM).toBeLessThan(rule.walkEndBelowChestM);
    expect(rule.walkStepM).toBeGreaterThan(0);
  });

  it('returns null for a mesh that is not HM08', () => {
    expect(
      resolveMeasurementOpenReferenceFemaleUnderBustFoldYV1({
        positionsM: new Float32Array(9),
        triangleIndices: new Uint32Array([0, 1, 2]),
      }),
    ).toBeNull();
  });

  it.each(ANSUR_FEMALE_FIXTURES)(
    'ANSUR $subject: bust path with no under-bust typed puts the female station on the fold',
    (row) => {
      const body = measurements(row);
      const { basis, modes, chestStationY } = modesFor('female', body);
      const foldY = resolveMeasurementOpenReferenceFemaleUnderBustFoldYV1({
        positionsM: modes.uniformPositionsM,
        triangleIndices: basis.indices,
      });
      expect(foldY).not.toBeNull();
      expect(modes.underBustStationOriginM[1]).toBe(foldY);
      expect(modes.diagnostics).toContain('underbust-station:female-fold-template');
      expect(modes.diagnostics).not.toContain('underbust-station:bounded-height-fallback');

      const { left, right } = FEMALE_UNDERBUST_FOLD_STATION_RULE_V1.apexVertices;
      const positions = modes.uniformPositionsM;
      const apexY = (positions[left * 3 + 1] + positions[right * 3 + 1]) / 2;
      const apexToFoldM = apexY - (foldY as number);
      // Below the breast's lower slope (the walk starts 30 mm under the apex), inside the window.
      expect(apexToFoldM).toBeGreaterThanOrEqual(0.04);
      expect(apexToFoldM).toBeLessThanOrEqual(
        FEMALE_UNDERBUST_FOLD_STATION_RULE_V1.walkEndBelowChestM,
      );
      // The bounded height fallback (0.04 H under the armpit line) lands on the breast slope,
      // at least 1 cm above the fold.
      expect(foldY as number).toBeLessThan(heightFallbackY(chestStationY, row.height) - 0.01);
    },
    60_000,
  );

  it('a typed under-bust keeps the bounded plane above the fold', () => {
    const row = ANSUR_FEMALE_FIXTURES[1];
    const body = Object.freeze({
      ...measurements(row),
      underBustCircumferenceMm: 760,
    }) as CanonicalBodyMeasurementsMm;
    const { modes, chestStationY } = modesFor('female', body);
    expect(modes.diagnostics).not.toContain('underbust-station:female-fold-template');
    expect(modes.diagnostics).toContain('underbust-station:bounded-height-fallback');
    expect(modes.underBustStationOriginM[1]).toBe(heightFallbackY(chestStationY, row.height));
  }, 60_000);

  it('the legacy chest path (no bust bundle) keeps the bounded plane', () => {
    const row = ANSUR_FEMALE_FIXTURES[1];
    const { modes, chestStationY } = modesFor('female', measurements(row), false);
    expect(modes.diagnostics).not.toContain('underbust-station:female-fold-template');
    expect(modes.diagnostics).toContain('underbust-station:bounded-height-fallback');
    expect(modes.underBustStationOriginM[1]).toBe(heightFallbackY(chestStationY, row.height));
  }, 60_000);

  it.each(['male', 'neutral'] as const)(
    '%s keeps the bounded height fallback',
    (kind) => {
      const row = ANSUR_FEMALE_FIXTURES[1];
      const { modes, chestStationY } = modesFor(kind, measurements(row));
      expect(modes.diagnostics).not.toContain('underbust-station:female-fold-template');
      expect(modes.diagnostics).toContain('underbust-station:bounded-height-fallback');
      expect(modes.underBustStationOriginM[1]).toBe(heightFallbackY(chestStationY, row.height));
    },
    60_000,
  );
});
