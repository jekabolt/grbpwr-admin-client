import { DraftEdit } from './workspace';

// LANE F owns this file; becomes adminService.DraftFittingEdits once lane E regenerates proto-http.

// TEMP MOCK, REMOVE AT INTEGRATION (dev only): mirrors the mockup's draftFittingFromNote — one edit
// per actionable sentence of the note, descriptive sentences are skipped.
const VERBS =
  /\b(take in|let out|shorten|lengthen|drop|raise|move|remove|add|recheck|check|rotate|twists?|stands away|pulls?|gapes?)\b/i;

function mockDraft(note: string): DraftEdit[] {
  return note
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim().replace(/[.!?]$/, ''))
    .filter((x) => x && VERBS.test(x))
    .map((x) => ({ note: x.charAt(0).toUpperCase() + x.slice(1), target: '' }));
}

export async function draftFittingEdits(_fittingId: number, note: string): Promise<DraftEdit[]> {
  if (import.meta.env.DEV) {
    await new Promise((r) => setTimeout(r, 900));
    return mockDraft(note);
  }
  return [];
}
