import type { common_Model } from 'api/proto-http/admin';
import type { ProjectBodyMeasurementRecord } from './measurement-adapter';
import {
  auditMeasurementRecordsV1,
  type MeasurementPopulationFinding,
  type MeasurementRecordAuditReport,
} from './measurement-record-audit-v1';

export const PROJECT_MODEL_AUDIT_SUBJECT_NAMESPACE = 'project-model:' as const;

export type ProjectModelPopulationFindingsResolver = (
  modelId: number,
) => readonly MeasurementPopulationFinding[] | undefined;

export interface AuditProjectModelsV1Options {
  /** Findings must come from a pinned external population model, never from this small cohort. */
  readonly populationFindingsByModelId?: ProjectModelPopulationFindingsResolver;
}

function validModelId(id: number | undefined): id is number {
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
}

function measurementRecords(model: common_Model): readonly ProjectBodyMeasurementRecord[] {
  return (model.model?.measurements ?? []).map((measurement) => ({
    name: measurement.name,
    valueMm: measurement.valueMm,
  }));
}

/**
 * Converts backend fit-model rows into the privacy-minimal measurement audit contract.
 *
 * Model names, comments, timestamps, media and size memberships are deliberately not copied. The
 * current wire schema has no versioned measurement protocol, so structurally valid rows remain
 * review-grade C until independent protocol evidence exists outside this bridge.
 */
export function auditProjectModelsV1(
  models: readonly common_Model[],
  options: AuditProjectModelsV1Options = {},
): MeasurementRecordAuditReport {
  return auditMeasurementRecordsV1(
    models.map((model) => {
      const id = model.id;
      const hasValidId = validModelId(id);
      return {
        subjectId: hasValidId ? `${PROJECT_MODEL_AUDIT_SUBJECT_NAMESPACE}${id}` : '',
        kind: 'real-person' as const,
        records: measurementRecords(model),
        ...(hasValidId
          ? {
              populationFindings: options.populationFindingsByModelId?.(id) ?? Object.freeze([]),
            }
          : {}),
      };
    }),
  );
}
