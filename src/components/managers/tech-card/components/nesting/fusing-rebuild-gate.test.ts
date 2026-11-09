// T6: the seam re-confirm after an import apply runs after the fusing rebuild the apply's save owes.

import { describe, expect, it } from 'vitest';
import { fusingRebuildGate, type FusingSheetGenerationState } from './fusing-sheets-stage';

const at = (phase: FusingSheetGenerationState['phase'], run: number) => ({ phase, run, at: 1 });

describe('fusingRebuildGate', () => {
  it('nothing owed: waits out a rebuild in flight, else goes', () => {
    expect(fusingRebuildGate(at('generating', 3))).toBe('wait');
    expect(fusingRebuildGate(at('idle', 0))).toBe('go');
    expect(fusingRebuildGate(at('generated', 3))).toBe('go');
    expect(fusingRebuildGate(at('error', 3))).toBe('go');
  });

  it('owed: waits for the rebuild the save started, goes when it ended', () => {
    expect(fusingRebuildGate(at('generating', 4), 3)).toBe('wait');
    expect(fusingRebuildGate(at('generated', 4), 3)).toBe('go');
  });

  it('owed: an earlier run does not count, the owed one has not ended yet', () => {
    expect(fusingRebuildGate(at('generated', 3), 3)).toBe('wait');
    expect(fusingRebuildGate(at('error', 2), 3)).toBe('wait');
  });

  it('owed: the rebuild failed — the job stops', () => {
    expect(fusingRebuildGate(at('error', 4), 3)).toBe('failed');
  });

  it('owed: a later rebuild in flight is waited out too', () => {
    expect(fusingRebuildGate(at('generating', 5), 3)).toBe('wait');
    expect(fusingRebuildGate(at('generated', 5), 3)).toBe('go');
  });
});
