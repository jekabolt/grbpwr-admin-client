import { describe, expect, it } from 'vitest';

import { OPERATION_KIND_BY_ID } from './operation-kinds';
import { variantAfterWork, workApplication, type WorkItem } from './operation-work';

const work = (token: string): WorkItem => ({
  token,
  verb: 'machine',
  stage: 'assembly',
  label: token,
  machineMode: 'none',
  defaultMachine: '',
  machines: [],
  syn: [],
  sort: 0,
  retired: false,
});

describe('work application variants', () => {
  it('clears a stale variant without relying on mounted tiles', () => {
    const applied = workApplication({
      item: work('fuse'),
      kind: undefined,
      current: { workVariant: 'two_way' },
      park: { machines: [], presses: [] },
    });

    expect(applied.writes.workVariant).toBe('');
  });

  it('keeps a variant declared by the new work', () => {
    expect(variantAfterWork('set_zip', 'two_way')).toBe('two_way');
    expect(variantAfterWork('', 'two_way')).toBe('');
  });

  it('clears seam kind when the work becomes topstitch', () => {
    const applied = workApplication({
      item: work('topstitch'),
      kind: OPERATION_KIND_BY_ID.get('A2'),
      current: {
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
        seamKind: 'lapped_raw',
      },
      park: { machines: [], presses: [] },
    });

    expect(applied.clears.seamKind).toBe('');
  });

  it('keeps the edge kinds of a topstitch when the work becomes topstitch', () => {
    for (const seamKind of ['faced_split', 'hem_raw', 'hem_closed']) {
      const applied = workApplication({
        item: work('topstitch'),
        kind: OPERATION_KIND_BY_ID.get('A2'),
        current: {
          operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
          machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
          seamKind,
        },
        park: { machines: [], presses: [] },
      });
      expect(applied.clears.seamKind).toBeUndefined();
    }
  });
});
