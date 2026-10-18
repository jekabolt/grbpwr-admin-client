// STOPFIX PROBE ENTRY — bundled by stopfix.mjs with 'react' aliased to react-hook-shim-fx.ts (the
// shim WITH effects: the wizard's drive is an effect). Drives the REAL wizard hook
// (use-import-session.ts) with the autopilot's resolver over an in-process worker session that can
// be "killed" the way worker/client.ts kills it (a stage that would not pause: the in-flight run
// rejects `cancelled`, every session of the worker is gone).
//
// Owner bug (17.10): "pressing stop exits the import entirely". The cases:
//   hard-kill at a late stage — the run keeps its step, outputs, inputs and answers; the next
//     move restores it (files read again, the history replayed quietly) and ends where the run
//     without the stop ends, output for output;
//   kill on the details before they were built — the resume builds them and goes on;
//   stop between two stages of one move of the drive — the next stage never starts, nothing is
//     lost, the resume ends where the run without the stop ends;
//   a replay that comes out different — refused with a clear error (never a silent other run);
//   a stop during the restore — the run stays kept, the next resume restores it;
//   kombinezon (the owner's file): a kill in the pieces fill, replay through the heavy stages.
import type { StageName } from 'lib/pattern-import/types';
import { ImportWorkerError } from 'lib/pattern-import/worker/client';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';
import type {
  CardContext,
  ImportClient,
} from 'components/managers/tech-card/components/pattern-import/client';
import { stubBuildDraft } from 'components/managers/tech-card/components/pattern-import/stub-client';
import {
  useImportSession,
  type ImportSessionApi,
} from 'components/managers/tech-card/components/pattern-import/use-import-session';
import { resolverFor } from 'components/managers/tech-card/components/pattern-import/autopilot';
import {
  digestOf,
  pruneAfter,
  type RestoreEntry,
} from 'components/managers/tech-card/components/pattern-import/stop-restore';
import { readManifest } from 'lib/pattern-import/manifest';
import { mountHook } from './react-hook-shim-fx';
import { CARD_ID, CASES } from './e2e-entry';
import { cardSizes, filesOf, SCOPES } from './autopilot-entry';

let failures = 0;
const check = (ok: boolean, what: string, extra?: unknown) => {
  if (!ok) failures++;
  console.log(
    `${ok ? '  ok ' : '  FAIL'} ${what}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`,
  );
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── a killable in-process worker ────────────────────────────────────────────────────────────────
type Hooks = {
  /**
   * 'kill' = the stage starts, the operator stops it, the worker is terminated under it; 'soft' =
   * the soft cancel lands in the stage: the worker ran its invalidation, the session lives on.
   */
  before?: (stage: StageName, sid: number, nth: number) => 'kill' | 'soft' | void;
  /** After a stage: the output to hand back (a perturbed one), or nothing. */
  after?: (stage: StageName, sid: number, out: unknown) => unknown;
};
function killableClient() {
  const sessions = new Map<number, Session>();
  let nextId = 1;
  const ctx: StageCtx = { checkCancel: () => {}, progress: () => {} };
  const t = {
    hooks: {} as Hooks,
    log: [] as { sid: number; stage: StageName }[],
    opens: 0,
    kills: 0,
    nth: new Map<string, number>(),
    stageMs: new Map<string, number>(),
  };
  const kill = () => {
    for (const s of sessions.values()) s.close();
    sessions.clear();
    t.kills++;
  };
  const client: ImportClient = {
    kind: 'worker',
    async open(files) {
      await sleep(0);
      const id = nextId++;
      const s = new Session(id, files);
      sessions.set(id, s);
      t.opens++;
      return { sessionId: id, files: s.files };
    },
    async run(id, stage, input) {
      await sleep(0);
      const s = sessions.get(id);
      if (!s)
        throw new ImportWorkerError(
          'no-session',
          'the importer was restarted — read the files again',
          stage,
        );
      const n = (t.nth.get(stage) ?? 0) + 1;
      t.nth.set(stage, n);
      const how = t.hooks.before?.(stage, id, n);
      if (how === 'soft') {
        (s as unknown as { invalidateAfter(x: StageName): void }).invalidateAfter(stage);
        throw new ImportWorkerError('cancelled', 'stopped by the operator', stage);
      }
      if (how === 'kill') {
        kill();
        throw new ImportWorkerError(
          'cancelled',
          'stopped — the importer was restarted (the stage could not pause)',
          stage,
        );
      }
      t.log.push({ sid: id, stage });
      // headless: the SoM render feeds the AI namer only, and there is no AI here
      if (stage === 'render-som') return { sheetPng: new Blob([]), crops: [], marks: [] } as never;
      const t0 = Date.now();
      const out = await s.runStage(
        stage,
        (stage === 'render-pages' ? { ...(input as object), pictures: false } : input) as never,
        ctx,
      );
      t.stageMs.set(stage, (t.stageMs.get(stage) ?? 0) + Date.now() - t0);
      return (t.hooks.after?.(stage, id, out) ?? out) as never;
    },
    cancel() {},
    async close(id) {
      sessions.get(id)?.close();
      sessions.delete(id);
    },
    alive: (id) => sessions.has(id),
  };
  return { client, t };
}

// ── one mounted wizard ──────────────────────────────────────────────────────────────────────────
type Case = (typeof CASES)[number];
type Snap = {
  step: string;
  sid: number | null;
  note: string | null;
  autopilot: number;
  semantics: boolean;
  fabrics: boolean;
  pieces: boolean;
};
function mount(c: Case) {
  const card: CardContext = {
    techCardId: CARD_ID,
    sizes: cardSizes(c.card),
    scopes: SCOPES,
    existingPieces: [],
    styleLabel: 'stopfix',
    ...(c.cardName ? { cardName: c.cardName } : {}),
  };
  const { client, t } = killableClient();
  let api!: ImportSessionApi;
  let last = Date.now();
  const restoring: Snap[] = [];
  mountHook(() => {
    api = useImportSession({
      client,
      card,
      namer: async () => [],
      buildDraft: stubBuildDraft,
      applyDraft: async () => ({ ok: true, uploaded: [] }),
    });
    last = Date.now();
    const s = api.session;
    if (s.busy?.note?.startsWith('restoring'))
      restoring.push({
        step: s.step,
        sid: s.sessionId,
        note: s.busy.note,
        autopilot: api.inputs.autopilot.length,
        semantics: !!s.semantics,
        fabrics: !!s.fabrics,
        pieces: !!s.pieces,
      });
  });
  const resolve = resolverFor(card, () => api);
  /** Idle: no stage in flight and nothing rendered for a while (the drive has stopped). */
  const idle = async (limitMs = 20 * 60_000) => {
    const t0 = Date.now();
    for (;;) {
      await sleep(25);
      if (!api.session.busy && Date.now() - last > 500) return;
      if (Date.now() - t0 > limitMs) throw new Error('the wizard never went idle');
    }
  };
  const start = async () => {
    await api.dispatch({
      type: 'files',
      files: filesOf(c).map((f) => new File([f.bytes], f.name)),
    });
    api.advance({ resolve });
    await idle();
  };
  const resume = async () => {
    api.advance({ resolve });
    await idle();
  };
  return { api: () => api, t, start, resume, restoring, resolve };
}

/** ISO timestamps (the manifest's createdAt inside the written text) do not count. */
const noTime = (x: unknown): unknown =>
  typeof x === 'string'
    ? x
        .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<t>')
        // the draft's new line keys are ULIDs (stub-client.ts): new on every draft by design
        .replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/g, '<ulid>')
    : Array.isArray(x)
      ? x.map(noTime)
      : x && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype
        ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, noTime(v)]))
        : x;

/**
 * The draft as compared: every written DXF read as its manifest (decoded, its times and the new
 * line keys left out) plus its drawing without the manifest's comment lines (999 groups).
 */
const draftOf = (d: unknown): unknown => {
  if (!d || typeof d !== 'object') return d;
  type T = { dxfText?: string };
  const x = d as { scopes?: T[]; downloads?: T[] };
  const read = (sc: T) => {
    if (typeof sc.dxfText !== 'string') return sc;
    const { dxfText, ...rest } = sc;
    return {
      ...rest,
      manifest: readManifest(dxfText),
      // the r12 header's own creation stamp (write/r12.ts) is the time, not the drawing
      drawing: dxfText
        .replace(/(^|\r?\n)\s*999\r?\n[^\r\n]*/g, '')
        .replace(/Creation (Date|Time): [^\r\n]*/g, 'Creation $1'),
    };
  };
  return noTime({
    ...x,
    scopes: (x.scopes ?? []).map(read),
    downloads: (x.downloads ?? []).map(read),
  });
};

/** Everything the run ends with: the outputs on screen, the answers, where and why it stopped. */
function endOf(api: ImportSessionApi) {
  const s = api.session;
  const { fileList, ...inputs } = api.inputs;
  const parts = {
    step: s.step,
    variant: s.variant,
    sheet: digestOf(s.sheet),
    chains: digestOf(s.chains),
    sizes: digestOf(s.sizes),
    pieces: digestOf(s.pieces),
    names: digestOf(s.names),
    semantics: digestOf(s.semantics),
    fabrics: digestOf(s.fabrics),
    gate: digestOf(s.gate),
    draft: digestOf(draftOf(s.draft)),
    inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, digestOf(v)])),
    files: fileList.length,
    error: s.error,
    stop: api.driveStop ? `${api.driveStop.step}: ${api.driveStop.reason}` : null,
  };
  return { parts, all: digestOf(parts), draft: draftOf(s.draft) };
}
const diffOf = (a: ReturnType<typeof endOf>, b: ReturnType<typeof endOf>) =>
  (Object.keys(a.parts) as (keyof typeof a.parts)[]).flatMap((k) => {
    if (JSON.stringify(a.parts[k]) === JSON.stringify(b.parts[k])) return [];
    if (k === 'inputs') {
      const x = a.parts.inputs as Record<string, string>;
      const y = b.parts.inputs as Record<string, string>;
      return [...new Set([...Object.keys(x), ...Object.keys(y)])]
        .filter((q) => x[q] !== y[q])
        .map((q) => `inputs.${q}`);
    }
    if (k === 'error' || k === 'stop' || k === 'step')
      return [`${k}: ${a.parts[k]} | ${b.parts[k]}`];
    return [k];
  });

/** Where two values part (the first few paths), for a failed comparison. */
function partsOf(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (out.length >= 6 || digestOf(a) === digestOf(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !ArrayBuffer.isView(a)) {
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)]))
      partsOf(x[k], y[k], `${path}.${k}`, out);
    return out;
  }
  out.push(`${path}: ${String(a).slice(0, 120)} | ${String(b).slice(0, 120)}`);
  return out;
}

/** The stages the fresh session ran before the first one that was not a replay. */
const freshRuns = (t: ReturnType<typeof killableClient>['t'], sid: number) =>
  t.log.filter((x) => x.sid === sid).map((x) => x.stage);

// ── the cases ───────────────────────────────────────────────────────────────────────────────────
function units() {
  console.log('\n· digest / history units');
  const a = { x: 1, ms: 5, p: new Float32Array([1, 2, 3]), m: new Map([[1, 'a']]) };
  check(digestOf(a) === digestOf({ ...a, ms: 99 }), 'timing (ms) is not in the digest');
  check(
    digestOf(a) !== digestOf({ ...a, p: new Float32Array([1, 2, 3.0001]) }),
    'a typed-array value change is in the digest',
  );
  check(digestOf([1, 2]) !== digestOf([2, 1]), 'order is in the digest');
  check(digestOf({ a: undefined }) !== digestOf({}), 'an undefined field is in the digest');
  const h: RestoreEntry[] = (
    ['extract', 'clean', 'scale', 'assemble', 'chains', 'pieces'] as const
  ).map((stage) => ({ stage, input: {} as never, digest: stage }));
  check(
    pruneAfter(h, 'chains')
      .map((e) => e.stage)
      .join() === 'extract,clean,scale,assemble,chains',
    'a stage drops the history after it, keeps itself and before',
  );
}

async function optitex(c: Case) {
  console.log(`\n· ${c.id}`);
  // baseline: the run without a stop
  const base = mount(c);
  await base.start();
  const B = endOf(base.api());
  check(base.api().session.step === 'check', 'baseline reaches check', base.api().session.step);
  const baseRuns = base.t.log.map((x) => x.stage);
  console.log(`    baseline stages: ${baseRuns.join(' ')}`);

  // (1) hard kill at the latest stage (write), then resume
  {
    const w = mount(c);
    let pre = null as { step: string; autopilot: number; sid: number | null } | null;
    w.t.hooks.before = (stage, _sid, n) => {
      if (stage !== 'write' || n !== 1) return;
      const a = w.api();
      pre = {
        step: a.session.step,
        autopilot: a.inputs.autopilot.length,
        sid: a.session.sessionId,
      };
      a.cancel(); // the operator's stop; the worker is terminated under the stage
      return 'kill';
    };
    await w.start();
    const a = w.api();
    check(w.t.kills === 1, 'kill@write: the worker was killed in write');
    check(
      a.session.sessionId != null && a.session.sessionId === pre?.sid,
      'kill@write: the run keeps its id',
    );
    check(a.session.step === pre?.step, 'kill@write: the run stays on its step', [
      a.session.step,
      pre?.step,
    ]);
    check(!!a.session.semantics && !!a.session.fabrics, 'kill@write: the outputs are kept');
    check(
      a.inputs.autopilot.length > 0 &&
        a.inputs.autopilot.length <= (pre?.autopilot ?? 0) &&
        a.inputs.fileList.length > 0,
      'kill@write: the answers before the move and the files are kept (the move’s own undone)',
    );
    check(
      a.errorCode === 'cancelled' && /restarted/.test(a.session.error ?? ''),
      'kill@write: a stop, said as one',
      [a.errorCode, a.session.error],
    );
    check(
      a.restorePending && a.stopped?.restarted === true,
      'kill@write: stopped · restore pending',
      a.stopped,
    );
    const a0 = a.inputs.autopilot.length;
    const before = w.t.log.length;
    await sleep(800);
    check(w.t.log.length === before, 'kill@write: nothing runs after the stop');
    await w.resume();
    const E = endOf(w.api());
    const d = diffOf(B, E);
    if (d.includes('draft')) console.log('    draft parts:', partsOf(B.draft, E.draft));
    check(d.length === 0, 'kill@write: the resumed run ends as the run without the stop', d);
    check(
      !w.api().restorePending && w.api().stopped == null,
      'kill@write: restored, the stop line is gone',
    );
    const fresh = freshRuns(w.t, 2);
    console.log(`    replayed + resumed in the fresh session: ${fresh.join(' ')}`);
    check(
      w.t.opens === 2 && fresh[0] === 'extract',
      'kill@write: one restore (the files read again once)',
    );
    check(
      w.restoring.length > 0 &&
        w.restoring.every(
          (r) =>
            r.step === pre?.step &&
            r.sid === pre?.sid &&
            r.autopilot >= a0 &&
            r.autopilot === w.restoring[0].autopilot &&
            r.semantics &&
            r.fabrics,
        ),
      'kill@write: the restore is quiet — same step, same id, outputs and answers stay on screen',
      w.restoring.length,
    );
  }

  // (2) hard kill on the details before they were built (semantics of pieces → details)
  {
    const w = mount(c);
    w.t.hooks.before = (stage, _sid, n) => {
      if (stage !== 'semantics' || n !== 1) return;
      w.api().cancel();
      return 'kill';
    };
    await w.start();
    const a = w.api();
    check(
      a.session.step === 'pieces' && !a.session.semantics && !a.session.names.length,
      'kill@semantics: the move is undone — back on pieces, where it started',
      a.session.step,
    );
    check(
      a.restorePending && a.session.pieces != null,
      'kill@semantics: run kept, restore pending',
    );
    // (2b) Codex #1: an operator edit stopped mid-run is undone, not kept unapplied
    const p0 = digestOf(a.session.pieces);
    const seeds0 = a.inputs.clickSeeds.length;
    // the click's own pieces run (after the restore replayed the first one) is killed
    w.t.hooks.before = (stage, sid) => {
      if (stage !== 'pieces' || sid !== 2) return;
      if (w.t.log.filter((x) => x.sid === 2 && x.stage === 'pieces').length !== 1) return;
      w.api().cancel();
      return 'kill';
    };
    const fam = a.session.pieces?.families[0]?.candidates[0]?.outer[0];
    await a.addSeed(fam ? { x: fam.x + 1, y: fam.y + 1 } : { x: 0, y: 0 });
    await sleep(50);
    const b = w.api();
    check(
      w.t.kills === 2 &&
        b.inputs.clickSeeds.length === seeds0 &&
        digestOf(b.session.pieces) === p0 &&
        b.restorePending,
      'stopped click seed: the seed is not kept unapplied (inputs and pieces as before)',
      { seeds: b.inputs.clickSeeds.length, was: seeds0 },
    );
    await w.resume();
    const d = diffOf(B, endOf(w.api()));
    check(d.length === 0, 'kill@semantics: the resume ends as without the stop', d);
  }

  // (3) a stop between two stages of one move of the drive
  {
    const w = mount(c);
    let at = -1;
    let step = '';
    w.t.hooks.after = (stage, _sid, out) => {
      if (stage !== 'chains' || at >= 0) return out;
      at = w.t.log.length;
      step = w.api().session.step;
      w.api().cancel(); // pressed as the stage ended: the next stage of the move must not start
      return out;
    };
    await w.start();
    const a = w.api();
    const after = w.t.log.slice(at).map((x) => x.stage);
    check(
      at > 0 && after.length === 0,
      'stop between stages: no stage starts after the stop',
      after,
    );
    check(
      a.errorCode === 'cancelled' && a.restorePending && a.stopped?.restarted === false,
      'stop between stages: stopped (no worker kill; the worker ran past the screen → restore)',
      a.stopped,
    );
    check(
      a.session.step === step && !a.session.chains && !a.session.scale.decision,
      'stop between stages: the move is undone (the step as it started, no half-applied scale)',
      [a.session.step, !!a.session.chains],
    );
    check(
      a.session.sessionId != null && a.inputs.fileList.length > 0,
      'stop between stages: the run is kept',
    );
    console.log(`    stopped on ${a.session.step} (the move started on ${step}) after chains`);
    await sleep(800);
    check(w.t.log.length === at, 'stop between stages: the drive does not go on by itself');
    await w.resume();
    const d = diffOf(B, endOf(w.api()));
    check(d.length === 0, 'stop between stages: the resume ends as without the stop', d);
    check(w.t.opens === 2, 'stop between stages: one restore');
  }

  // (6) Codex #2: a soft stop in a stage — the worker lives but ran its invalidation: the screen
  // and the worker part, so the run is restored (never a run on the half-cleared worker)
  {
    const w = mount(c);
    w.t.hooks.before = (stage, _sid, n) => {
      if (stage !== 'write' || n !== 1) return;
      w.api().cancel();
      return 'soft';
    };
    await w.start();
    const a = w.api();
    check(
      w.t.kills === 0 &&
        a.restorePending &&
        a.stopped?.restarted === false &&
        !!a.session.semantics,
      'soft stop: the run is kept, the worker is restored before the next stage',
      a.stopped,
    );
    await w.resume();
    const d = diffOf(B, endOf(w.api()));
    check(d.length === 0 && w.t.opens === 2, 'soft stop: the resume ends as without the stop', d);
  }

  // (7) Codex #3: files read anew while a restore runs — the old restore changes nothing of it
  {
    const w = mount(c);
    let again: Promise<void> | null = null;
    w.t.hooks.before = (stage, sid, n) => {
      if (stage === 'write' && n === 1) {
        w.api().cancel();
        return 'kill';
      }
      if (sid === 2 && stage === 'chains' && !again)
        again = w.api().dispatch({
          type: 'files',
          files: filesOf(c).map((f) => new File([f.bytes], f.name)),
        });
    };
    await w.start();
    w.api().advance({ resolve: w.resolve });
    for (let k = 0; k < 400 && !again; k++) await sleep(25);
    await again;
    await w.resume();
    const a = w.api();
    const d = diffOf(B, endOf(a));
    check(
      !!again && a.session.sessionId === 3 && !a.restorePending && d.length === 0,
      'files read during a restore: the new run is its own (no stale error, ends as the baseline)',
      { sid: a.session.sessionId, d, error: a.session.error },
    );
  }

  // (4) a replay that comes out different is refused, clearly
  {
    const w = mount(c);
    w.t.hooks.before = (stage, _sid, n) => {
      if (stage !== 'write' || n !== 1) return;
      w.api().cancel();
      return 'kill';
    };
    w.t.hooks.after = (stage, sid, out) =>
      sid > 1 && stage === 'pieces' ? { ...(out as object), perturbed: true } : out;
    await w.start();
    await w.resume();
    const a = w.api();
    check(
      a.errorCode === 'no-session' &&
        /could not be restored/.test(a.session.error ?? '') &&
        /pieces came out different/.test(a.session.error ?? ''),
      'divergent replay: refused with a clear error',
      [a.errorCode, a.session.error],
    );
    check(
      a.session.sessionId == null && a.session.step === 'files' && !a.restorePending,
      'divergent replay: the run is given up as before the fix (read the files again)',
    );
    const fresh = freshRuns(w.t, 2);
    check(
      !fresh.includes('write') && !fresh.includes('fabrics'),
      'divergent replay: nothing ran on the other drawing',
      fresh,
    );
  }

  // (5) a stop during the restore keeps the run (still to restore); the next resume restores it
  {
    const w = mount(c);
    w.t.hooks.before = (stage, sid, n) => {
      if ((stage === 'write' && n === 1) || (sid === 2 && stage === 'chains')) {
        w.api().cancel();
        return 'kill';
      }
    };
    await w.start();
    await w.resume();
    const a = w.api();
    check(w.t.kills === 2, 'stop in restore: killed again during the replay');
    check(
      a.restorePending &&
        a.session.step === 'fabrics' &&
        !!a.session.semantics &&
        a.errorCode === 'cancelled',
      'stop in restore: the run is still kept, still to restore',
      [a.session.step, a.errorCode],
    );
    await w.resume();
    const E = endOf(w.api());
    const d = diffOf(B, E);
    if (d.includes('draft')) console.log('    draft parts:', partsOf(B.draft, E.draft));
    check(
      d.length === 0 && w.t.opens === 3,
      'stop in restore: the next resume restores and ends as without the stop',
      d,
    );
  }
}

/** (8) RULHOOK × STOPFIX: a hard kill during the storage re-write is a stopped move like any. */
async function rewriteKill(c: Case) {
  const w = mount(c);
  await w.start();
  const a = w.api();
  const d0 = a.session.draft;
  check(a.session.step === 'check' && !!d0, 'rewrite kill: at check with a draft');
  w.t.hooks.before = (stage, _sid, n) => {
    if (stage !== 'write' || n !== 2) return;
    w.api().cancel();
    return 'kill';
  };
  await a.dispatch({ type: 'write-storage', storage: 'rul' });
  await sleep(50);
  const b = w.api();
  const tok = b.lockApply();
  if (tok != null) b.unlockApply(tok);
  check(
    b.inputs.writeStorage === undefined &&
      b.session.draft === d0 &&
      b.writeStorage.rewriteError === null &&
      tok != null &&
      b.restorePending,
    'rewrite kill: undone — the storage as before, the draft matches it and stays appliable',
    { storage: b.inputs.writeStorage, rewriteError: b.writeStorage.rewriteError, tok },
  );
  await b.dispatch({ type: 'write-storage', storage: 'rul' });
  await sleep(50);
  const e = w.api();
  check(
    e.session.draft !== d0 &&
      e.inputs.writeStorage?.storage === 'rul' &&
      !e.restorePending &&
      !e.session.error &&
      w.t.opens === 2,
    'rewrite kill: the choice made again restores the run and writes',
    { error: e.session.error, opens: w.t.opens },
  );
}

async function kombinezon(c: Case) {
  console.log(`\n· ${c.id} (the owner's file)`);
  const base = mount(c);
  let t0 = Date.now();
  await base.start();
  const B = endOf(base.api());
  const baseMs = Date.now() - t0;
  console.log(
    `    baseline ${(baseMs / 1000).toFixed(1)}s, ends on ${B.parts.stop ?? base.api().session.step}`,
  );
  // what the digests cost on this file (they run after every recorded stage)
  {
    const s = base.api().session;
    const cost: string[] = [];
    for (const [k, v] of Object.entries({
      sheet: s.sheet,
      chains: s.chains,
      sizes: s.sizes,
      pieces: s.pieces,
      clean: s.clean,
    })) {
      const a = Date.now();
      digestOf(v);
      cost.push(`${k} ${Date.now() - a}ms`);
    }
    console.log(
      `    digest cost: ${cost.join(', ')} · stage time ${[...base.t.stageMs].map(([k, v]) => `${k} ${v}ms`).join(', ')}`,
    );
  }
  const w = mount(c);
  let pre = null as { step: string; autopilot: number } | null;
  w.t.hooks.before = (stage, _sid, n) => {
    if (stage !== 'pieces' || n !== 1) return;
    const a = w.api();
    pre = { step: a.session.step, autopilot: a.inputs.autopilot.length };
    a.cancel();
    return 'kill';
  };
  await w.start();
  const a = w.api();
  check(
    w.t.kills === 1 && a.session.step === pre?.step && !!a.session.sizes && a.restorePending,
    'kombinezon kill@pieces: the run is kept on its step',
    [a.session.step, pre?.step],
  );
  check(
    a.inputs.autopilot.length === pre?.autopilot,
    'kombinezon kill@pieces: the answers are kept',
  );
  t0 = Date.now();
  await w.resume();
  console.log(
    `    restore + resume ${((Date.now() - t0) / 1000).toFixed(1)}s; fresh session ran: ${freshRuns(w.t, 2).join(' ')}`,
  );
  const d = diffOf(B, endOf(w.api()));
  check(
    d.length === 0,
    'kombinezon kill@pieces: the resumed run ends as the run without the stop',
    d,
  );
}

export async function main(args: string[]): Promise<number> {
  const quick = args.includes('--quick');
  units();
  const opt = CASES.find((c) => c.id === 'syn:optitex-hpgl2-pe.plt');
  if (!opt) throw new Error('case syn:optitex-hpgl2-pe.plt is gone');
  await optitex(opt);
  console.log(`\n· ${opt.id} · storage re-write`);
  await rewriteKill(opt);
  if (!quick) {
    const k = CASES.find((c) => c.id === 'kombinezon-B');
    if (!k) throw new Error('case kombinezon-B is gone');
    await kombinezon(k);
  }
  console.log(`\nSTOPFIX ${failures ? `FAIL (${failures})` : 'PASS'}`);
  return failures ? 1 : 0;
}
