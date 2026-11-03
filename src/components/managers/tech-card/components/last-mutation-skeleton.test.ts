import { describe, expect, it } from 'vitest';
import { skeletonIssueLinks } from './last-mutation';

const issue = (description: string, operationNumber = 0, status = 'open') => ({
  description,
  operationNumber,
  raisedBy: 'me',
  status,
});

/** The undo as `operations-field.tsx` writes it, read back as text → step number. */
function undone(
  before: ReturnType<typeof issue>[],
  current: ReturnType<typeof issue>[],
): Record<string, number> {
  const out = current.map((row) => ({ ...row }));
  for (const { index, operationNumber } of skeletonIssueLinks(before, out)) {
    out[index].operationNumber = operationNumber;
  }
  return Object.fromEntries(out.map((row) => [row.description, row.operationNumber]));
}

describe('the step references of an undone skeleton', () => {
  const before = [issue('P', 10), issue('A', 20)];

  it('come back whole when the defects were left alone', () => {
    expect(undone(before, [issue('P'), issue('A')])).toEqual({ P: 10, A: 20 });
  });

  it('do not pass to a new defect when one was deleted and another added', () => {
    expect(undone(before, [issue('A'), issue('C')])).toEqual({ A: 20, C: 0 });
  });

  it('follow the defect when the array moved', () => {
    expect(undone(before, [issue('A'), issue('P')])).toEqual({ A: 20, P: 10 });
  });

  it('skip a rewritten defect and keep an edited one', () => {
    expect(undone(before, [issue('P rewritten'), issue('A')])).toEqual({
      'P rewritten': 0,
      A: 20,
    });
    expect(undone(before, [issue('P', 0, 'resolved'), issue('A')])).toEqual({ P: 10, A: 20 });
  });

  it('do not guess between twins that were both edited', () => {
    const links = skeletonIssueLinks(
      [issue('T', 10)],
      [issue('T', 0, 'resolved'), issue('T', 0, 'wontfix')],
    );
    expect(links).toEqual([]);
  });

  it('give a defect that was unlinked nothing, also next to its twin', () => {
    const links = skeletonIssueLinks(
      [issue('T'), issue('T', 20)],
      [issue('T'), issue('T')],
    );
    expect(links).toEqual([{ index: 1, operationNumber: 20 }]);
  });

  it('leave alone what an append never unlinked', () => {
    expect(skeletonIssueLinks([issue('A', 20)], [issue('A', 20)])).toEqual([]);
  });

  it('keep a number that points at nothing, as it stood', () => {
    expect(undone([issue('S', 15)], [issue('S')])).toEqual({ S: 15 });
  });
});
