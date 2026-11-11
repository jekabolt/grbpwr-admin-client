import { describe, expect, it } from 'vitest';

import { workApplication, type WorkItem } from './operation-work';

const LOCK = 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH';
const BIND = 'TECH_CARD_MACHINE_TYPE_BINDING_TAPING';

const bindWork: WorkItem = {
  token: 'bind_tape_edge',
  verb: 'machine',
  stage: 'assembly',
  label: 'Bind / tape edge',
  machineMode: 'fixed',
  defaultMachine: 'binding_taping',
  machines: ['binding_taping'],
  syn: [],
  sort: 0,
  retired: false,
};

const hemStep = {
  operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
  machineType: LOCK,
  machineProfileKey: 'lock-1',
};

describe('work application: machine profile after the machine changes', () => {
  it('drops a lockstitch profile when the step moves to binding and the park has none', () => {
    const applied = workApplication({
      item: bindWork,
      kind: undefined,
      current: hemStep,
      park: { machines: [{ machineType: LOCK, profileKey: 'lock-1' }], presses: [] },
    });
    expect(applied.writes.machineType).toBe(BIND);
    expect(applied.links.machineProfileKey).toBe('');
  });

  it('moves the link to the only profile of the new machine', () => {
    const applied = workApplication({
      item: bindWork,
      kind: undefined,
      current: hemStep,
      park: {
        machines: [
          { machineType: LOCK, profileKey: 'lock-1' },
          { machineType: BIND, profileKey: 'bind-1' },
        ],
        presses: [],
      },
    });
    expect(applied.links.machineProfileKey).toBe('bind-1');
  });

  it('drops the stale link when the new machine has several profiles', () => {
    const applied = workApplication({
      item: bindWork,
      kind: undefined,
      current: hemStep,
      park: {
        machines: [
          { machineType: BIND, profileKey: 'bind-1' },
          { machineType: BIND, profileKey: 'bind-2' },
        ],
        presses: [],
      },
    });
    expect(applied.links.machineProfileKey).toBe('');
  });

  it('keeps a link the person chose when the machine stays', () => {
    const applied = workApplication({
      item: bindWork,
      kind: undefined,
      current: { ...hemStep, machineType: BIND, machineProfileKey: 'bind-2' },
      park: {
        machines: [
          { machineType: BIND, profileKey: 'bind-1' },
          { machineType: BIND, profileKey: 'bind-2' },
        ],
        presses: [],
      },
    });
    expect(applied.links.machineProfileKey).toBeUndefined();
  });
});
