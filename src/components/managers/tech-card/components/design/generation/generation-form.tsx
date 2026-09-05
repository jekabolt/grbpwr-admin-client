import type { GetDesignBandResponse } from 'api/proto-http/admin';

/**
 * ═══ СЕКЦИИ `GENERATION — FLAT` БОЛЬШЕ НЕТ (SPEC п.7, CONTRACT §F) ══════════════════════════════
 *
 * Здесь жила отдельная `Section` с чипами видов, раскладкой и рядом GENERATE — вторая секция
 * подряд про тот же жест, что и `input — references` над ней. Владелец слил их: то, что модели
 * дают, и то, что у неё просят, — один запрос, и рвать его заголовком значило рисовать две
 * половины одного вопроса. Органы прогона переехали в подвал секции референсов —
 * `../flat-run-row.tsx`, — а этот файл держит ровно два предиката состава экрана, которые читает
 * `GenerationStudio`.
 */

export function hasFlatRun(band: GetDesignBandResponse): boolean {
  return (band.runs ?? []).some((run) => (run.kind ?? '').trim().toLowerCase() === 'flat');
}

export function hasAnyPictures(band: GetDesignBandResponse): boolean {
  return (band.runs ?? []).length > 0 || (band.batches ?? []).length > 0;
}
