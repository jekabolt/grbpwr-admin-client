import { adminService } from 'api/api';

import { DraftEdit } from './workspace';

export async function draftFittingEdits(fittingId: number, note: string): Promise<DraftEdit[]> {
  const response = await adminService.DraftFittingEdits({ fittingId, note });
  return (response.edits ?? []).map((edit) => ({
    note: edit.note ?? '',
    target: edit.target ?? '',
  }));
}
