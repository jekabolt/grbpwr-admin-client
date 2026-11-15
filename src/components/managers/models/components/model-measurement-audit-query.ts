import type { common_Model } from 'api/proto-http/admin';

export interface ModelMeasurementAuditPageV1 {
  readonly models?: readonly common_Model[];
  readonly total?: number;
}

export type ModelMeasurementAuditPageLoaderV1 = (request: {
  readonly limit: number;
  readonly offset: number;
}) => Promise<ModelMeasurementAuditPageV1>;

/**
 * Collects the complete model cohort without changing the bounded `useAllModels` contract used by
 * pickers and unrelated manager screens.
 */
export async function collectAllModelsForMeasurementAuditV1(
  loadPage: ModelMeasurementAuditPageLoaderV1,
  limit: number,
): Promise<common_Model[]> {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error('Measurement audit page limit must be a positive integer.');
  }

  const models: common_Model[] = [];
  let offset = 0;
  while (true) {
    const response = await loadPage({ limit, offset });
    const page = response.models ?? [];
    const total = response.total;
    if (total == null || !Number.isSafeInteger(total) || total < 0) {
      throw new Error('Model list did not return a valid total for the complete audit cohort.');
    }

    models.push(...page);
    if (models.length >= total) return models;
    if (page.length === 0) {
      throw new Error(`Model list stopped at ${models.length} of ${total} records.`);
    }
    offset += page.length;
  }
}
