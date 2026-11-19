import { describe, expect, it } from 'vitest';
import type { common_TechCard } from 'api/proto-http/admin';
import { mapFormToTechCardInsert, mapTechCardToForm } from './schema';

const first = '01M6H6VJXY4R08K3M9PM13JP1W';
const pose = '01M6H6WHVNYJFX49DF94J3B87R';
const last = '01M7RT86EVKTVJZSD0GJNBSVG7';
const original = {
  id: 2,
  techCard: { operations: [{ operationNumber: 640, seamKeys: [first, pose, last] }] },
  seams: [
    { seamKey: first, kind: 'TECH_CARD_SEAM_KIND_COMPOSITE' },
    { seamKey: pose, kind: 'TECH_CARD_SEAM_KIND_POSE' },
    { seamKey: last, kind: 'TECH_CARD_SEAM_KIND_PARTIAL' },
  ],
} as common_TechCard;

describe('operation seam and pose order in the card mapper', () => {
  it('round-trips the mixed wire order when the form changes another field', () => {
    const form = mapTechCardToForm(original);
    expect(form.operations?.[0].seamKeys).toEqual([first, last]);
    expect(form.operations?.[0].poseKeys).toEqual([pose]);
    form.name = 'New garment name';
    expect(mapFormToTechCardInsert(form, original.techCard).operations?.[0].seamKeys).toEqual([
      first,
      pose,
      last,
    ]);
  });

  it('still persists explicit seam reordering and keeps duplicate keys out', () => {
    const form = mapTechCardToForm(original);
    form.operations![0].seamKeys = [last, first, last];
    expect(mapFormToTechCardInsert(form, original.techCard).operations?.[0].seamKeys).toEqual([
      last,
      first,
      pose,
    ]);
  });
});
