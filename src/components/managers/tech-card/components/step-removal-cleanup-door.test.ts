import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ChangeTechCardSeamsRequest,
  ChangeTechCardSeamsResponse,
  common_TechCard,
  common_TechCardSeam,
} from 'api/proto-http/admin';
import { toWire, type StoredRow } from 'lib/seams';

import { CARD6_SEAMS } from './step-seams/card6.fixture';
import { runSeamChange, type SeamChangeDeps } from './assembly-seams/seam-change';
import type { SeamFormBridge } from './assembly-seams/seam-form-bridge';
import { hydrateSeams, resetSeams, rowsOf, useSeamsStore } from './assembly-seams/seams-store';
import type { OwedStepRemoval } from './card-owed';
import { quietCleanupChange, runStepRemovalCleanup } from './step-removal-change';

// The cleanup through the REAL `runSeamChange` and the real seams store: only the door (bridge) and
// the server call are doubles. A fake `io.change` would hide what the strict door does.

const CARD = 6;
const [a, b] = [...CARD6_SEAMS.values()];
const wire = (rows: readonly StoredRow[]) => rows.map(toWire) as common_TechCardSeam[];

type Op = { historyKey: string; operationNumber: number; seamKeys: string[]; poseKeys: string[] };

const entry: OwedStepRemoval = {
  historyKey: 'gone',
  operationNumber: 20,
  candidateKeys: [a.seamKey, b.seamKey],
  at: 0,
};

const lockMoved = () =>
  Object.assign(new Error('the card moved'), {
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.BadRequest',
        fieldViolations: [{ field: 'expected_lock_version', description: 'lock_version_moved' }],
      },
    ],
  });

const reply = (
  lockVersion: number,
  rows: readonly StoredRow[],
  deletedKeys: string[],
): ChangeTechCardSeamsResponse => ({
  seams: wire(rows),
  links: [],
  lockVersion,
  keyMap: [],
  deletedKeys,
});

function harness(call: SeamChangeDeps['call'], over: Partial<SeamFormBridge> = {}) {
  // The saved body: the removed step is gone, h10 is the step that may take its seams.
  const ops: Op[] = [{ historyKey: 'h10', operationNumber: 10, seamKeys: [], poseKeys: [] }];
  const strips: { seamKey?: string }[] = [];
  let version = 7;
  const log: string[] = [];
  const bridge: SeamFormBridge = {
    flush: async () => ({ ok: true }),
    // Strict hold: no pastInvalidForm, the door either holds or refuses.
    hold: async (o) => {
      log.push(o?.pastInvalidForm ? 'hold:past' : 'hold');
      return { release: () => log.push('release') };
    },
    version: () => version,
    operationNumber: (step) =>
      ops.find((op) => op.historyKey === step.historyKey)?.operationNumber ?? 0,
    adopt: (x) => {
      if (version === x.expected) version = x.lockVersion;
    },
    reread: async () => ({ ok: false, why: 'no read' }),
    ...over,
  };
  const deps: SeamChangeDeps = { call, bridge: (id) => (id === CARD ? bridge : undefined) };
  const clear = vi.fn();
  const run = () =>
    runStepRemovalCleanup(entry, {
      active: () => true,
      operations: () => ops,
      cutStrips: () => strips,
      rows: () => {
        const s = useSeamsStore.getState();
        return { seams: s.server, poses: s.poses };
      },
      change: quietCleanupChange(entry.candidateKeys, (input) =>
        runSeamChange(CARD, input, { verb: 'removal', quiet: true }, deps),
      ),
      clear,
    });
  return {
    ops,
    strips,
    log,
    bridge,
    clear,
    run,
    setVersion: (v: number) => {
      version = v;
    },
  };
}

const storeKeys = () => rowsOf(useSeamsStore.getState()).map((row) => row.seamKey);

beforeEach(() => {
  resetSeams();
  hydrateSeams(CARD, wire([a, b]), 7);
});

describe('step removal cleanup through the real seam door', () => {
  it('a) both candidates linked while the cleanup waited: no request, debt cleared, rows untouched', async () => {
    const call = vi.fn<SeamChangeDeps['call']>();
    const h = harness(call);
    // The body save the flush carries holds the new links.
    h.bridge.flush = async () => {
      h.ops[0].seamKeys = [a.seamKey, b.seamKey];
      return { ok: true };
    };
    await h.run();
    expect(call).not.toHaveBeenCalled();
    expect(h.clear).toHaveBeenCalledOnce();
    const s = useSeamsStore.getState();
    expect(s.pending[a.seamKey]).toBeUndefined();
    expect(s.pending[b.seamKey]).toBeUndefined();
    expect(s.errors[a.seamKey]).toBeUndefined();
    expect(s.errors[b.seamKey]).toBeUndefined();
    expect(storeKeys()).toEqual([a.seamKey, b.seamKey]);
    expect(h.log).not.toContain('hold:past');
  });

  it('b) only one candidate linked: exactly one request deleting the free row', async () => {
    const sent: ChangeTechCardSeamsRequest[] = [];
    const h = harness(async (req) => {
      sent.push(req);
      return reply(8, [a], [b.seamKey]);
    });
    h.bridge.flush = async () => {
      h.ops[0].seamKeys = [a.seamKey];
      return { ok: true };
    };
    await h.run();
    expect(sent).toHaveLength(1);
    expect(sent[0].delete).toEqual([b.seamKey]);
    expect(sent[0].link).toEqual([]);
    expect(sent[0].detach).toEqual([]);
    expect(h.clear).toHaveBeenCalledOnce();
    const s = useSeamsStore.getState();
    expect(s.pending[a.seamKey]).toBeUndefined();
    expect(s.errors[a.seamKey]).toBeUndefined();
    expect(storeKeys()).toEqual([a.seamKey]);
    expect(h.log).toEqual(['hold', 'release']);
  });

  it('c) lock_version_moved: the retry is built from the fresh card and deletes only what is free in it', async () => {
    const sent: ChangeTechCardSeamsRequest[] = [];
    const h = harness(async (req) => {
      sent.push(req);
      if (sent.length === 1) throw lockMoved();
      return reply(10, [a], [b.seamKey]);
    });
    h.bridge.reread = async () => {
      // Another save linked `a` meanwhile; the read brings that body into the form.
      h.ops[0].seamKeys = [a.seamKey];
      h.setVersion(9);
      return {
        ok: true,
        card: { lockVersion: 9, seams: wire([a, b]) } as unknown as common_TechCard,
      };
    };
    await h.run();
    expect(sent.map((req) => req.delete)).toEqual([[a.seamKey, b.seamKey], [b.seamKey]]);
    expect(sent.map((req) => req.expectedLockVersion)).toEqual([7, 9]);
    expect(h.clear).toHaveBeenCalledOnce();
    expect(storeKeys()).toEqual([a.seamKey]);
    const s = useSeamsStore.getState();
    expect(s.pending[a.seamKey]).toBeUndefined();
    expect(s.errors[a.seamKey]).toBeUndefined();
  });

  it('d) a cut strip measured from a candidate keeps that seam: one request deleting only the other', async () => {
    const sent: ChangeTechCardSeamsRequest[] = [];
    const h = harness(async (req) => {
      sent.push(req);
      return reply(8, [b], [a.seamKey]);
    });
    // A non-binding step took the strip as an input; the strip outlives the removed step.
    h.strips.push({ seamKey: b.seamKey });
    await h.run();
    expect(sent).toHaveLength(1);
    expect(sent[0].delete).toEqual([a.seamKey]);
    expect(h.clear).toHaveBeenCalledOnce();
    expect(storeKeys()).toEqual([b.seamKey]);
    const s = useSeamsStore.getState();
    expect(s.pending[b.seamKey]).toBeUndefined();
    expect(s.errors[b.seamKey]).toBeUndefined();
  });
});
