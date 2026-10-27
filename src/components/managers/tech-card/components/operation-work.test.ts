import { describe, expect, it } from 'vitest';

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
});
