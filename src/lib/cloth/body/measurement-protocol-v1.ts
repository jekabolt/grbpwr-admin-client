import type { common_BodyMeasurementName } from 'api/proto-http/admin';
import protocolRegistryJson from '../../../../docs/cloth-simulation/mannequin/32-project-body-measurement-protocol-v1.json';
import protocolExtensionJson from '../../../../docs/cloth-simulation/mannequin/p0-body-measurement-protocol-extension-v1.json';

export const BODY_MEASUREMENT_PROTOCOL_V1_ID = 'grbpwr-body-measurement-protocol-v1' as const;
export const BODY_MEASUREMENT_PROTOCOL_V1_VERSION = '1.1.0' as const;

export type BodyMeasurementProtocolWireFieldV1 = Exclude<
  common_BodyMeasurementName,
  'BODY_MEASUREMENT_NAME_UNKNOWN'
>;

export interface BodyMeasurementProtocolFieldV1 {
  readonly wireField: BodyMeasurementProtocolWireFieldV1;
  readonly label: string;
  readonly group: string;
  readonly canonicalKey: string | null;
  readonly geometryKind: string;
  readonly requiredForAnalyticalMannequin: boolean;
  readonly allowedMissing: boolean;
  readonly repeatToleranceMm: number;
  readonly shortDefinition: string;
  readonly landmarks: readonly string[];
  readonly posture: string;
  readonly path: string;
}

interface RawProtocolFieldV1 {
  readonly wireField?: unknown;
  readonly labelEn?: unknown;
  readonly labelRu?: unknown;
  readonly group?: unknown;
  readonly canonicalKey?: unknown;
  readonly geometryKind?: unknown;
  readonly requiredForAnalyticalMannequin?: unknown;
  readonly allowedMissing?: unknown;
  readonly repeatToleranceMm?: unknown;
  readonly definitionEn?: unknown;
  readonly definitionRu?: unknown;
  readonly landmarks?: unknown;
  readonly posture?: unknown;
  readonly tapePath?: unknown;
}

const WIRE_FIELD_PATTERN = /^BODY_MEASUREMENT_NAME_(?!UNKNOWN$)[A-Z_]+$/;

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Measurement protocol ${field} must be a non-empty string.`);
  }
  return value;
}

function stringList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`Measurement protocol ${field} must be a non-empty string list.`);
  }
  return Object.freeze(value.map((item) => nonEmptyString(item, field)));
}

function parseField(value: RawProtocolFieldV1): BodyMeasurementProtocolFieldV1 {
  const wireField = nonEmptyString(value.wireField, 'wireField');
  if (!WIRE_FIELD_PATTERN.test(wireField)) {
    throw new RangeError(`Measurement protocol contains an invalid wire field: ${wireField}.`);
  }
  if (
    typeof value.requiredForAnalyticalMannequin !== 'boolean' ||
    typeof value.allowedMissing !== 'boolean'
  ) {
    throw new TypeError(`Measurement protocol ${wireField} must declare required/missing policy.`);
  }
  if (!Number.isInteger(value.repeatToleranceMm) || Number(value.repeatToleranceMm) <= 0) {
    throw new RangeError(`Measurement protocol ${wireField} repeat tolerance must be positive mm.`);
  }
  if (value.canonicalKey !== null && typeof value.canonicalKey !== 'string') {
    throw new TypeError(`Measurement protocol ${wireField} canonical key must be string or null.`);
  }

  return Object.freeze({
    wireField: wireField as BodyMeasurementProtocolWireFieldV1,
    label: nonEmptyString(value.labelEn, `${wireField}.labelEn`),
    group: nonEmptyString(value.group, `${wireField}.group`),
    canonicalKey: value.canonicalKey,
    geometryKind: nonEmptyString(value.geometryKind, `${wireField}.geometryKind`),
    requiredForAnalyticalMannequin: value.requiredForAnalyticalMannequin,
    allowedMissing: value.allowedMissing,
    repeatToleranceMm: Number(value.repeatToleranceMm),
    shortDefinition: nonEmptyString(value.definitionEn, `${wireField}.definitionEn`),
    landmarks: stringList(value.landmarks, `${wireField}.landmarks`),
    posture: nonEmptyString(value.posture, `${wireField}.posture`),
    path: nonEmptyString(value.tapePath, `${wireField}.tapePath`),
  });
}

if (
  protocolRegistryJson.protocolId !== BODY_MEASUREMENT_PROTOCOL_V1_ID ||
  protocolRegistryJson.protocolVersion !== protocolExtensionJson.baseProtocolVersion ||
  protocolExtensionJson.protocolId !== BODY_MEASUREMENT_PROTOCOL_V1_ID ||
  protocolExtensionJson.protocolVersion !== BODY_MEASUREMENT_PROTOCOL_V1_VERSION
) {
  throw new Error('Measurement protocol registry identity differs from runtime v1.');
}
if (!Array.isArray(protocolRegistryJson.fields) || protocolRegistryJson.fields.length !== 20) {
  throw new Error('Measurement protocol v1 base must contain exactly 20 wire fields.');
}
if (!Array.isArray(protocolExtensionJson.fields) || protocolExtensionJson.fields.length !== 14) {
  throw new Error('Measurement protocol v1 P0 extension must contain exactly 14 wire fields.');
}

const parsedFields = [...protocolRegistryJson.fields, ...protocolExtensionJson.fields].map(
  (field) => parseField(field),
);
if (new Set(parsedFields.map(({ wireField }) => wireField)).size !== parsedFields.length) {
  throw new Error('Measurement protocol v1 contains duplicate wire fields.');
}
const minimumIndependentObservations =
  protocolRegistryJson.globalProcedure.observationPolicy.minimumIndependentObservations;
if (minimumIndependentObservations !== 2) {
  throw new Error('Measurement protocol v1 requires exactly two independent observations.');
}

export const BODY_MEASUREMENT_PROTOCOL_FIELDS_V1 = Object.freeze(
  Object.fromEntries(parsedFields.map((field) => [field.wireField, field])) as Record<
    BodyMeasurementProtocolWireFieldV1,
    BodyMeasurementProtocolFieldV1
  >,
);

export const BODY_MEASUREMENT_PROTOCOL_V1 = Object.freeze({
  protocolId: BODY_MEASUREMENT_PROTOCOL_V1_ID,
  protocolVersion: BODY_MEASUREMENT_PROTOCOL_V1_VERSION,
  minimumIndependentObservations,
  evidenceStoredByCurrentBackend: false as const,
  provenanceMetadataSupportedByCurrentBackend: true as const,
  fields: BODY_MEASUREMENT_PROTOCOL_FIELDS_V1,
});

export function getBodyMeasurementProtocolFieldV1(
  wireField: string,
): BodyMeasurementProtocolFieldV1 | undefined {
  return BODY_MEASUREMENT_PROTOCOL_FIELDS_V1[wireField as BodyMeasurementProtocolWireFieldV1];
}
