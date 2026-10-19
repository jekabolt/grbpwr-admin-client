import { DraftEdit } from './workspace';

// LANE F owns this file; becomes adminService.DraftFittingEdits once lane E regenerates proto-http.
export async function draftFittingEdits(_fittingId: number, _note: string): Promise<DraftEdit[]> {
  return [];
}
