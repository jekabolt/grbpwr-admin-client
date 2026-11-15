import { describe, expect, it } from 'vitest';
import protocolRegistryJson from '../../../../docs/cloth-simulation/mannequin/32-project-body-measurement-protocol-v1.json';
import protocolExtensionJson from '../../../../docs/cloth-simulation/mannequin/p0-body-measurement-protocol-extension-v1.json';
import { BODY_MEASUREMENT_GROUPS } from '../../../components/managers/model/components/measurements';
import {
  BODY_MEASUREMENT_PROTOCOL_FIELDS_V1,
  BODY_MEASUREMENT_PROTOCOL_V1,
  BODY_MEASUREMENT_PROTOCOL_V1_ID,
  BODY_MEASUREMENT_PROTOCOL_V1_VERSION,
  getBodyMeasurementProtocolFieldV1,
} from './measurement-protocol-v1';

const uiWireFields = BODY_MEASUREMENT_GROUPS.flatMap((group) =>
  group.measurements.map(({ name }) => name),
);

describe('body measurement protocol v1 registry', () => {
  it('projects the project-owned JSON authority without field drift', () => {
    expect(BODY_MEASUREMENT_PROTOCOL_V1).toMatchObject({
      protocolId: protocolRegistryJson.protocolId,
      protocolVersion: protocolExtensionJson.protocolVersion,
      minimumIndependentObservations:
        protocolRegistryJson.globalProcedure.observationPolicy.minimumIndependentObservations,
      evidenceStoredByCurrentBackend: false,
      provenanceMetadataSupportedByCurrentBackend: true,
    });
    expect(BODY_MEASUREMENT_PROTOCOL_V1_ID).toBe('grbpwr-body-measurement-protocol-v1');
    expect(BODY_MEASUREMENT_PROTOCOL_V1_VERSION).toBe('1.1.0');

    const projectedFields = [...protocolRegistryJson.fields, ...protocolExtensionJson.fields].map(
      (field) => ({
        wireField: field.wireField,
        label: field.labelEn,
        group: field.group,
        canonicalKey: field.canonicalKey,
        geometryKind: field.geometryKind,
        requiredForAnalyticalMannequin: field.requiredForAnalyticalMannequin,
        allowedMissing: field.allowedMissing,
        repeatToleranceMm: field.repeatToleranceMm,
        shortDefinition: field.definitionEn,
        landmarks: field.landmarks,
        posture: field.posture,
        path: field.tapePath,
      }),
    );
    expect(Object.values(BODY_MEASUREMENT_PROTOCOL_FIELDS_V1)).toEqual(projectedFields);
  });

  it('covers each of the 34 UI wire fields exactly once and excludes UNKNOWN', () => {
    const registryWireFields = Object.keys(BODY_MEASUREMENT_PROTOCOL_FIELDS_V1);
    expect(registryWireFields).toHaveLength(34);
    expect(new Set(registryWireFields).size).toBe(34);
    expect(new Set(registryWireFields)).toEqual(new Set(uiWireFields));
    expect(uiWireFields).toHaveLength(34);
    expect(getBodyMeasurementProtocolFieldV1('BODY_MEASUREMENT_NAME_UNKNOWN')).toBeUndefined();
  });

  it('keeps every operator instruction and tolerance usable at runtime', () => {
    for (const field of Object.values(BODY_MEASUREMENT_PROTOCOL_FIELDS_V1)) {
      expect(field.shortDefinition.trim()).not.toBe('');
      expect(field.landmarks.length).toBeGreaterThan(0);
      expect(field.path.trim()).not.toBe('');
      expect(field.posture.trim()).not.toBe('');
      expect(field.repeatToleranceMm).toBeGreaterThan(0);
    }
  });

  it('keeps sleeve length aligned with the straight analytical arm-length input', () => {
    const sleeve = getBodyMeasurementProtocolFieldV1('BODY_MEASUREMENT_NAME_SLEEVE_LENGTH');
    expect(sleeve).toMatchObject({
      geometryKind: 'straight-length',
      repeatToleranceMm: 8,
    });
    expect(sleeve?.shortDefinition).toMatch(/straight endpoint span/i);
    expect(sleeve?.posture).toMatch(/elbow straight/i);
    expect(sleeve?.path).toMatch(/held straight/i);
    expect(sleeve?.path).toMatch(/do not follow the arm surface/i);
  });

  it('keeps standing height distinct from high-point-shoulder height', () => {
    const standing = getBodyMeasurementProtocolFieldV1('BODY_MEASUREMENT_NAME_HEIGHT');
    const hps = getBodyMeasurementProtocolFieldV1('BODY_MEASUREMENT_NAME_HPS_HEIGHT');

    expect(standing?.shortDefinition).toMatch(/highest point of the head/i);
    expect(hps).toMatchObject({ geometryKind: 'vertical-height', canonicalKey: 'hpsHeightMm' });
    expect(hps?.shortDefinition).toMatch(/not standing stature/i);
  });
});
