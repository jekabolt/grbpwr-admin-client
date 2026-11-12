import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import type {
  ChangeTechCardSeamsRequest,
  ChangeTechCardSeamsResponse,
  common_TechCardSeam,
} from 'api/proto-http/admin';
import { toWire, type StoredRow } from 'lib/seams';

import { runSeamChange, type SeamChangeDeps } from './assembly-seams/seam-change';
import type { SeamChange } from './assembly-seams/seam-change-plan';
import type { SeamFormBridge } from './assembly-seams/seam-form-bridge';
import { hydrateSeams, resetSeams, useSeamsStore } from './assembly-seams/seams-store';
import type { OwedStepRemoval } from './card-owed';
import type { TechCardFormData } from './schema';
import { CARD6_SEAMS } from './step-seams/card6.fixture';
import {
  quietCleanupChange,
  runStepRemovalChange,
  runStepRemovalCleanup,
  runStepRemovalUndoChange,
  type StepRemovalIo,
  type StepRemovalRows,
} from './step-removal-change';
import {
  useTechCardUndoHistory,
  type UndoHistoryApi,
  type UndoHistoryCaptureProps,
} from './undo-history';
import type { AutosaveController } from './useTechCardAutosave';

// The REAL card history (`useTechCardUndoHistory`) and the real react-hook-form, mounted by
// react-dom without a DOM library: the hook only needs `window` timers, `HTMLElement#closest` on
// event targets and a container react-dom can listen on. The step side is a thin stand-in for
// operations-field's removal record; the order of form writes, record and debt is the product's
// (`runStepRemovalChange` / `runStepRemovalUndoChange`).

class FakeElement {
  dataset: Record<string, string> = {};
  constructor(private readonly owned = false) {}
  closest(selector: string) {
    return this.owned && selector.includes('data-history-owner') ? this : null;
  }
  getAttribute() {
    return null;
  }
}

const g = globalThis as Record<string, unknown>;
const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };

beforeAll(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.HTMLElement ??= FakeElement;
  g.HTMLInputElement ??= class extends FakeElement {};
  g.HTMLTextAreaElement ??= class extends FakeElement {};
  g.window ??= Object.assign(globalThis, listeners);
});

const [seamA] = [...CARD6_SEAMS.values()];

type Op = {
  historyKey: string;
  operationNumber: number;
  seamKeys: string[];
  poseKeys: string[];
};
type Strip = { seamKey?: string };
type Form = { name: string; operations: Op[]; cutStrips: Strip[] };
type Rec = { historyKey: string; row: Op; rows: StepRemovalRows; at: number };

const ops0 = (): Op[] => [
  { historyKey: 'h10', operationNumber: 10, seamKeys: [], poseKeys: [] },
  { historyKey: 'h20', operationNumber: 20, seamKeys: [seamA.seamKey], poseKeys: [] },
  { historyKey: 'h30', operationNumber: 30, seamKeys: [], poseKeys: [] },
];

const autosave = {
  status: 'idle',
  whenSettled: async () => undefined,
  request: () => undefined,
  holdWrites: () => () => undefined,
  flush: async () => 'ok',
} as unknown as AutosaveController;

const latest: {
  api?: UndoHistoryApi;
  capture?: UndoHistoryCaptureProps;
  form?: UseFormReturn<Form>;
} = {};

function Harness() {
  const form = useForm<Form>({
    defaultValues: { name: 'card', operations: ops0(), cutStrips: [] },
  });
  const { api, captureProps } = useTechCardUndoHistory({
    enabled: true,
    form: form as unknown as UseFormReturn<TechCardFormData>,
    autosave,
  });
  latest.api = api;
  latest.capture = captureProps;
  latest.form = form;
  return null;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const outside = () =>
  ({ nativeEvent: { isTrusted: true }, target: new FakeElement(false) }) as never;
/** A click whose DOM target is outside every history owner, e.g. the confirm dialog in a portal. */
const clickOutside = () => {
  latest.capture!.onPointerDownCapture(outside());
  latest.capture!.onPointerUpCapture(outside());
  latest.capture!.onClickCapture(outside());
};
const ops = () => latest.form!.getValues('operations');
const keys = () => ops().map((op) => op.historyKey);

let root: { render: (node: unknown) => void; unmount: () => void } | undefined;
let stepUndo: Rec[];
let owed: Set<string>;
let server: StepRemovalRows;
let changes: SeamChange[];
let refusals: string[];
let pending: Promise<boolean> | undefined;
/** Runs while the undo upsert is on the wire; `false` makes the server refuse it. */
let duringRequest: (() => boolean | void) | undefined;

const syncOwner = () =>
  latest.api!.setOwner({
    undoDepth: stepUndo.length,
    redoDepth: 0,
    undo: () => {
      pending = undoTop();
    },
    redo: () => undefined,
  });

const removalIo = (historyKey: string): StepRemovalIo<Rec> => ({
  // Nothing in flight: the product's wait resolves in a microtask, inside the click's task.
  settle: () => Promise.resolve(true),
  snapshot: () => {
    const at = keys().indexOf(historyKey);
    if (at < 0) return null;
    return {
      historyKey,
      row: structuredClone(ops()[at]),
      rows: { seams: structuredClone(server.seams), poses: [] },
      at,
    };
  },
  cutHistory: () => latest.api!.cut('step-removal'),
  remove: (rec) =>
    latest.form!.setValue(
      'operations',
      ops().filter((op) => op.historyKey !== rec.historyKey),
      { shouldDirty: true },
    ),
  record: (rec) => {
    stepUndo.push(rec);
    syncOwner();
  },
  owe: (rec) => owed.add(rec.historyKey),
  refuse: (why) => refusals.push(why),
  unsettled: 'still saving',
});

function undoTop(settle: () => Promise<boolean> = () => Promise.resolve(true)) {
  const rec = stepUndo.at(-1)!;
  const close = () => {
    stepUndo.pop();
    syncOwner();
  };
  return runStepRemovalUndoChange<Op, { at: number }>(
    {
      step: { historyKey: rec.historyKey },
      row: structuredClone(rec.row),
      rows: structuredClone(rec.rows),
      operationNumber: rec.row.operationNumber,
      candidateKeys: rec.row.seamKeys,
    },
    {
      validate: () => null,
      alreadyBack: () => keys().includes(rec.historyKey),
      close: () => {
        owed.delete(rec.historyKey);
        close();
      },
      settle,
      rows: () => server,
      change: async (input) => {
        const change = (typeof input === 'function' ? input() : input) as SeamChange;
        changes.push(change);
        await tick();
        if (duringRequest?.() === false) return { ok: false, why: 'refused' };
        server = {
          seams: [...server.seams, ...(change.upsert as StoredRow[] as never[])],
          poses: [],
        };
        return { ok: true, keyMap: new Map(), deletedKeys: [], lockVersion: 2 };
      },
      restore: (row) => {
        const next = [...ops()];
        next.splice(rec.at, 0, row);
        latest.form!.setValue('operations', next, { shouldDirty: true });
        return { at: rec.at };
      },
      clearOwed: () => owed.delete(rec.historyKey),
      cutHistory: () => latest.api!.cut('step-removal-undo'),
      finishHistory: close,
      select: () => undefined,
      refuse: (why) => refusals.push(why),
      unsettled: 'still saving',
    },
  );
}

/** One header UNDO; an owner-side undo is fire-and-forget in the hook, so wait for it too. */
async function undo() {
  pending = undefined;
  await act(async () => {
    await latest.api!.undo();
    await pending;
  });
  await act(tick);
}

async function removeStep(historyKey: string) {
  await act(async () => {
    clickOutside();
    await runStepRemovalChange(removalIo(historyKey));
  });
  await act(tick);
}

async function editName(value: string) {
  await act(async () => {
    clickOutside();
    latest.form!.setValue('name', value, { shouldDirty: true });
  });
  await act(tick);
}

beforeEach(async () => {
  stepUndo = [];
  owed = new Set();
  server = { seams: [structuredClone(seamA)], poses: [] };
  changes = [];
  refusals = [];
  duringRequest = undefined;
  const { createRoot } = await import('react-dom/client');
  // `defaultView` lets the commit phase look for a focused element without a real document.
  const view = { document: { activeElement: null }, HTMLIFrameElement: class {} };
  const doc = { nodeType: 9, defaultView: view, ...listeners };
  const container = {
    nodeType: 1,
    nodeName: 'DIV',
    tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: doc,
    ...listeners,
  };
  root = createRoot(container as never) as never;
  await act(async () => root!.render(createElement(Harness)));
  await act(async () => syncOwner());
});

afterEach(async () => {
  await act(async () => root?.unmount());
});

describe('step removal against the real card history', () => {
  it('removal opened by an outside click never lands in card history; UNDO reaches undoRemoval', async () => {
    await removeStep('h20');
    expect(keys()).toEqual(['h10', 'h30']);
    await editName('edited');
    // The body save went out and the cleanup deleted the free seam row.
    server = { seams: [], poses: [] };
    owed.delete('h20');

    await undo();
    expect(latest.form!.getValues('name')).toBe('card');
    expect(keys()).toEqual(['h10', 'h30']);

    await undo();
    expect(changes).toHaveLength(1);
    expect(changes[0].upsert?.map((row) => row.seamKey)).toEqual([seamA.seamKey]);
    expect(keys()).toEqual(['h10', 'h20', 'h30']);
    expect(ops()[1].seamKeys).toEqual([seamA.seamKey]);
    expect(stepUndo).toHaveLength(0);

    await undo();
    expect(keys()).toEqual(['h10', 'h20', 'h30']);
    expect(changes).toHaveLength(1);
    expect(refusals).toEqual([]);
  });

  it('immediate card UNDO before any save goes through undoRemoval: debt and step record agree', async () => {
    await removeStep('h20');
    expect(owed.has('h20')).toBe(true);
    expect(latest.api!.canUndo).toBe(true);

    await undo();
    expect(keys()).toEqual(['h10', 'h20', 'h30']);
    // Rows were never cleaned up: the zero-request branch.
    expect(changes).toHaveLength(0);
    expect(owed.has('h20')).toBe(false);
    expect(stepUndo).toHaveLength(0);

    await undo();
    expect(keys()).toEqual(['h10', 'h20', 'h30']);
    expect(refusals).toEqual([]);
  });

  it('a press outside the owner during the undo request does not put the restored step in card history', async () => {
    await removeStep('h20');
    server = { seams: [], poses: [] };
    // Pointer down outside the owner while the upsert is on the wire: the gesture stays open until
    // pointer up, after the restore has written the form.
    duringRequest = () => latest.capture!.onPointerDownCapture(outside());

    await undo();
    expect(changes).toHaveLength(1);
    expect(keys()).toEqual(['h10', 'h20', 'h30']);
    await act(async () => latest.capture!.onPointerUpCapture(outside()));
    await act(tick);

    expect(latest.api!.canUndo).toBe(false);
    await undo();
    expect(keys()).toEqual(['h10', 'h20', 'h30']);
    expect(refusals).toEqual([]);
  });

  it('a refused undo request leaves the card history alone', async () => {
    await removeStep('h20');
    server = { seams: [], poses: [] };
    await editName('edited');
    duringRequest = () => false;

    await act(async () => {
      await undoTop();
    });
    expect(refusals).toEqual(['refused']);
    expect(keys()).toEqual(['h10', 'h30']);
    expect(stepUndo).toHaveLength(1);

    await undo();
    expect(latest.form!.getValues('name')).toBe('card');
    expect(keys()).toEqual(['h10', 'h30']);
  });

  it('guard: a step already back closes the record with no insert and no request', async () => {
    await removeStep('h20');
    server = { seams: [], poses: [] };
    // The step came back some other way (a draft, a reload) before UNDO reached the step side.
    await act(async () => latest.form!.setValue('operations', ops0()));

    await act(async () => {
      await undoTop();
    });
    expect(keys()).toEqual(['h10', 'h20', 'h30']);
    expect(changes).toHaveLength(0);
    expect(stepUndo).toHaveLength(0);
    expect(owed.has('h20')).toBe(false);
    expect(refusals).toEqual([]);
  });

  it('guard: a step that comes back while undo waits closes the record after the wait', async () => {
    await removeStep('h20');
    server = { seams: [], poses: [] };
    await act(async () => {
      await undoTop(async () => {
        latest.form!.setValue('operations', ops0());
        return true;
      });
    });
    expect(keys()).toEqual(['h10', 'h20', 'h30']);
    expect(changes).toHaveLength(0);
    expect(stepUndo).toHaveLength(0);
    expect(refusals).toEqual([]);
  });
});

// BLOCKER 2: the cleanup really deletes rows, so it cuts the card history. Strip edits made before
// the save (S, then T) must not bring S back onto the strip after the row is gone.
describe('step removal cleanup against the real card history and the real seam door', () => {
  const CARD = 6;
  const T = 'strip-seam-t';
  const wire = (rows: readonly StoredRow[]) => rows.map(toWire) as common_TechCardSeam[];
  const entry: OwedStepRemoval = {
    historyKey: 'h20',
    operationNumber: 20,
    candidateKeys: [seamA.seamKey],
    at: 0,
  };
  const strips = () => latest.form!.getValues('cutStrips').map((strip) => strip.seamKey);

  async function setStrip(seamKey: string) {
    await act(async () => {
      clickOutside();
      latest.form!.setValue('cutStrips', [{ seamKey }], { shouldDirty: true });
    });
    await act(tick);
  }

  function cleanup(call: SeamChangeDeps['call'], log: string[]) {
    let version = 7;
    const bridge: SeamFormBridge = {
      flush: async () => ({ ok: true }),
      hold: async () => ({ release: () => undefined }),
      version: () => version,
      operationNumber: (step) =>
        ops().find((op) => op.historyKey === step.historyKey)?.operationNumber ?? 0,
      adopt: (x) => {
        if (version === x.expected) version = x.lockVersion;
      },
      reread: async () => ({ ok: false, why: 'no read' }),
    };
    const deps: SeamChangeDeps = { call, bridge: (id) => (id === CARD ? bridge : undefined) };
    return runStepRemovalCleanup(entry, {
      active: () => true,
      operations: () => ops(),
      cutStrips: () => latest.form!.getValues('cutStrips'),
      rows: () => {
        const st = useSeamsStore.getState();
        return { seams: st.server, poses: st.poses };
      },
      change: quietCleanupChange(entry.candidateKeys, (input) =>
        runSeamChange(CARD, input, { verb: 'removal', quiet: true }, deps),
      ),
      cutHistory: () => {
        log.push('cut');
        latest.api!.cut('step-removal-cleanup');
      },
      clear: () => log.push('clear'),
    });
  }

  beforeEach(async () => {
    resetSeams();
    hydrateSeams(CARD, wire([seamA]), 7);
    await removeStep('h20');
    // Isolate the page side: the owner record is covered by the suite above.
    stepUndo = [];
    await act(async () => syncOwner());
  });

  it('a deleting cleanup cuts before the request; UNDO during and after it never puts S back', async () => {
    await setStrip(seamA.seamKey);
    await setStrip(T);
    expect(latest.api!.canUndo).toBe(true);

    const log: string[] = [];
    let answer: (reply: ChangeTechCardSeamsResponse) => void = () => undefined;
    const sent: ChangeTechCardSeamsRequest[] = [];
    let running: Promise<boolean> | undefined;
    await act(async () => {
      running = cleanup((req) => {
        log.push('call');
        sent.push(req);
        return new Promise<ChangeTechCardSeamsResponse>((resolve) => {
          answer = resolve;
        });
      }, log);
      for (let i = 0; i < 5 && sent.length === 0; i += 1) await tick();
    });
    expect(sent).toHaveLength(1);
    // Every build that sends a delete cuts (the optimistic one and the one after the body flush),
    // and all of them run before the request.
    expect(log.indexOf('call')).toBeGreaterThan(0);
    expect(log.slice(0, log.indexOf('call')).every((step) => step === 'cut')).toBe(true);

    // UNDO while the delete is on the wire.
    await undo();
    expect(strips()).toEqual([T]);
    expect(latest.api!.canUndo).toBe(false);

    await act(async () => {
      answer({ seams: [], links: [], lockVersion: 8, keyMap: [], deletedKeys: [seamA.seamKey] });
      await running;
    });
    expect(log.at(-1)).toBe('clear');

    // UNDO after the row is gone.
    await undo();
    await undo();
    expect(strips()).toEqual([T]);
  });

  it('a cleanup with nothing to delete leaves the card history alone', async () => {
    // The strip still holds S at cleanup time: no row to delete, no request, no cut.
    await setStrip(seamA.seamKey);
    const log: string[] = [];
    const call = async () => {
      log.push('call');
      throw new Error('no request expected');
    };
    await act(async () => {
      await cleanup(call, log);
    });
    expect(log).toEqual(['clear']);
    expect(latest.api!.canUndo).toBe(true);
    await undo();
    expect(strips()).toEqual([]);
  });
});
