// RULHOOK (section H of the rul probe) — the storage choice through the REAL wizard hook
// (use-import-session.ts; rul.mjs aliases 'react' to react-hook-shim.ts) over the worker session
// in-process: the `write-storage` event sets `Inputs.writeStorage`, the write stage gets
// `storage: 'rul'` (+ a checked `rulBase`), absent = today's write (no package, same per-size
// DXF), the autopilot can never send it. Real runs: B9000-FRONT DXF+RUL packs (8 rules, 0 mm);
// our own kombinezon export refuses with the piece that is not point-for-point.
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type {
  CardSize,
  DraftScopeTarget,
  StageIO,
  StageName,
  WizardEvent,
} from 'lib/pattern-import/types';
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
import {
  normWriteStorage,
  writeStorageFor,
} from 'components/managers/tech-card/components/pattern-import/write-storage';
import {
  ANSWERS,
  answerProblem,
} from 'components/managers/tech-card/components/pattern-import/auto-advance';
import {
  driveTick,
  newDriveState,
} from 'components/managers/tech-card/components/pattern-import/auto-drive';
import {
  hookDriveCtx,
  resolverFor,
} from 'components/managers/tech-card/components/pattern-import/autopilot';
import { mountHook, rerender } from './react-hook-shim';

type Check = (c: string, name: string, ok: boolean, got?: unknown) => void;
type Files = { name: string; bytes: ArrayBuffer }[];
type WriteIn = StageIO['write']['in'];
type WriteOut = StageIO['write']['out'];

const SCOPES: DraftScopeTarget[] = [
  {
    scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
    fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
    bomLineKey: 'L1',
    label: 'main',
    isInterlining: false,
    sections: ['TECH_CARD_BOM_SECTION_FABRIC'],
  },
];
const cardSizes = (tokens: string[]): CardSize[] =>
  tokens.map((t, i) => ({ sizeId: 100 + i, name: t, token: t, rank: i, spellings: [t] }));

/** The wizard mounted over an in-process worker session; every write stage call kept. */
function mount(tokens: string[]) {
  let s: Session | null = null;
  const writes: { in: WriteIn; out: WriteOut }[] = [];
  const ctx: StageCtx = { checkCancel: () => {}, progress: () => {} };
  const client: ImportClient = {
    kind: 'worker',
    async open(files) {
      s?.close();
      s = new Session(1, files);
      return { sessionId: 1, files: s.files };
    },
    async run(_id, stage: StageName, input) {
      if (!s) throw new Error('no session');
      if (stage === 'render-som') return { sheetPng: new Blob([]), crops: [], marks: [] } as never;
      const out = await s.runStage(stage, input as never, ctx);
      if (stage === 'write') writes.push({ in: input as WriteIn, out: out as WriteOut });
      return out as never;
    },
    cancel() {},
    async close() {
      s?.close();
      s = null;
    },
    alive: () => true,
  };
  const card: CardContext = {
    techCardId: 4242,
    sizes: cardSizes(tokens),
    scopes: SCOPES,
    existingPieces: [],
    styleLabel: 'rulhook',
  };
  let api!: ImportSessionApi;
  mountHook(() => {
    api = useImportSession({
      client,
      card,
      namer: async () => [],
      buildDraft: stubBuildDraft,
      applyDraft: async () => ({ ok: true, uploaded: [] }),
    });
  });
  const settle = async () => {
    for (let k = 0; k < 4; k++) await Promise.resolve();
    rerender();
  };
  const get = () => api;
  const dispatch = async (ev: WizardEvent) => {
    await api.dispatch(ev);
    await settle();
  };
  /** files → check by the wizard's own drive with the autopilot's resolver (what an AUTO run does). */
  const drive = async (files: Files) => {
    await dispatch({ type: 'files', files: files.map((f) => new File([f.bytes], f.name)) });
    const resolve = resolverFor(card, get);
    const answer = (snap: Parameters<typeof resolve>[0]) =>
      resolve({
        ...snap,
        card: api.runCard,
        baseSeeds: api.baseSeeds,
        presegmented: !!api.extracted.presegmented,
      } as Parameters<typeof resolve>[0]);
    const st = newDriveState();
    for (let t = 0; t < 200; t++) {
      const r = await driveTick(st, hookDriveCtx(get, settle, answer));
      await settle();
      if (r.kind === 'stopped')
        return r.why === 'auto-stop' && api.session.step === 'check'
          ? null
          : `${r.step}: ${r.why} ${r.reason ?? r.question ?? ''}`.trim();
    }
    return `tick budget spent on ${api.session.step}`;
  };
  return { get, dispatch, drive, settle, writes, close: () => s?.close() };
}

const rulOf = (w: { out: WriteOut } | undefined) => w?.out.scopes[0]?.rul;
const say = (r: ReturnType<typeof rulOf>) =>
  !r
    ? 'no package'
    : r.ok
      ? `ok · base ${r.base} · ${r.rules} rules · max ${r.maxErrMm.toFixed(3)} mm`
      : `not ok · ${r.reasons.slice(0, 3).join(' | ')}`;
/**
 * The per-size DXF without its creation stamps (two writes of the same run differ only there):
 * the header date/time, and the embedded manifest — compared decoded, without `createdAt` and
 * the stage timings.
 */
const unstamped = (w: { out: WriteOut } | undefined) => {
  const sc = w?.out.scopes[0];
  if (!sc) return [];
  const { createdAt: _c, ...manifest } = sc.manifest as { createdAt?: string };
  return [
    JSON.stringify(manifest).replace(/"durationMs":\d+/g, '"durationMs":0'),
    ...sc.dxfText
      .split('\n')
      .filter((l) => !l.startsWith('GRBPWR-MANIFEST'))
      .map((l) => l.replace(/Creation (Date|Time): .*/i, 'C')),
  ];
};

const diffAt = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `…${a.slice(Math.max(0, i - 60), i + 60)} ≠ …${b.slice(Math.max(0, i - 60), i + 60)}`;
};

export async function sectionH(o: {
  check: Check;
  dxf: string;
  rul: string;
  sizes: string[];
  kombinezon: string | null;
}) {
  const { check } = o;
  const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

  // ── H0 · the choice, pure: normalised, judged against the run's sizes ──
  check('H', 'norm: unknown storage → null', normWriteStorage({ storage: 'zip' }) === null);
  check(
    'H',
    'norm: a base only with rul, trimmed',
    JSON.stringify(normWriteStorage({ storage: 'blocks', rulBase: '36' })) ===
      '{"storage":"blocks"}' &&
      JSON.stringify(normWriteStorage({ storage: 'rul', rulBase: ' 36 ' })) ===
        '{"storage":"rul","rulBase":"36"}',
  );
  const unk = writeStorageFor({ storage: 'rul', rulBase: 'XXL' }, o.sizes);
  check(
    'H',
    'an unknown base is ignored with a reason, never a refusal',
    unk.storage === 'rul' && unk.rulBase === undefined && /XXL/.test(unk.ignored ?? ''),
    unk.ignored,
  );
  const loose = writeStorageFor({ storage: 'rul', rulBase: 'm' }, ['S', 'M', 'L']);
  check('H', 'a base matched case-free → the card token', loose.rulBase === 'M', loose);
  check(
    'H',
    'absent / blocks → blocks',
    writeStorageFor(undefined, o.sizes).storage === 'blocks' &&
      writeStorageFor({ storage: 'blocks' }, o.sizes).storage === 'blocks',
  );

  // ── H1 · the autopilot cannot send it: no step takes it as an answer ──
  const ev = { type: 'write-storage', storage: 'rul' } as const;
  check(
    'H',
    'write-storage is no step’s answer (the autopilot never sets it)',
    Object.keys(ANSWERS).every(
      (st) =>
        !!answerProblem(st as keyof typeof ANSWERS, { events: [ev] }) &&
        !!answerProblem(st as keyof typeof ANSWERS, { patch: { writeStorage: ev } }),
    ),
  );

  const pair: Files = [
    { name: 'B9000-FRONT.dxf', bytes: enc(o.dxf) },
    { name: 'B9000-FRONT.rul', bytes: enc(o.rul) },
  ];

  // ── H2 · absent = today's write ──
  const a = mount(o.sizes);
  const stopA = await a.drive(pair);
  const wA = a.writes.at(-1);
  check(
    'H',
    'B9000 DXF+RUL, no choice: the AUTO run writes as today (no storage, no package)',
    stopA === null &&
      !!wA &&
      a.get().inputs.writeStorage === undefined &&
      !('storage' in wA.in) &&
      !('rulBase' in wA.in) &&
      wA.out.scopes.every((x) => x.rul === undefined),
    stopA ?? `${a.writes.length} write(s) · ${say(rulOf(wA))}`,
  );
  a.close();

  // ── H3 · set BEFORE the drop: kept by the drop, carried by the AUTO run's write ──
  const b = mount(o.sizes);
  await b.dispatch({ type: 'write-storage', storage: 'rul' });
  const setOk = JSON.stringify(b.get().inputs.writeStorage) === '{"storage":"rul"}';
  const stopB = await b.drive(pair);
  const wB = b.writes.at(-1);
  const rB = rulOf(wB);
  check(
    'H',
    'event sets Inputs.writeStorage, a file drop keeps it',
    setOk && b.get().inputs.writeStorage?.storage === 'rul',
    b.get().inputs.writeStorage,
  );
  check(
    'H',
    'B9000 DXF+RUL: the AUTO run’s write gets storage rul → ok, 8 rules, 0 mm',
    stopB === null &&
      wB?.in.storage === 'rul' &&
      !!rB &&
      rB.ok &&
      rB.rules === 8 &&
      rB.maxErrMm === 0,
    stopB ?? say(rB),
  );
  const dA = unstamped(wA);
  const dB = unstamped(wB);
  const at = dA.findIndex((l, i) => l !== dB[i]);
  check(
    'H',
    'the per-size DXF is the same file with or without the package',
    !!wA && !!wB && dA.length > 10 && at < 0 && dA.length === dB.length,
    at < 0 ? `${dA.length} lines` : `line ${at}: ${diffAt(dA[at] ?? '', dB[at] ?? '')}`,
  );

  // ── H4 · changed on the check step: written again; a base checked against the run's sizes ──
  const n0 = b.writes.length;
  await b.dispatch({ type: 'write-storage', storage: 'rul', rulBase: '42' });
  const w42 = b.writes.at(-1);
  const r42 = rulOf(w42);
  check(
    'H',
    'on check a new choice writes again: base 42 asked → package based on 42',
    b.writes.length === n0 + 1 &&
      b.get().session.step === 'check' &&
      w42?.in.rulBase === '42' &&
      !!r42 &&
      r42.ok &&
      r42.base === '42',
    say(r42),
  );
  // while the re-write runs, the draft of the old choice cannot be taken for an apply; the new one can
  const pending = b.get().dispatch({ type: 'write-storage', storage: 'rul', rulBase: 'XXL' });
  const oldLocked = b.get().lockApply() === null;
  await pending;
  await b.settle();
  const tok = b.get().lockApply();
  if (tok != null) b.get().unlockApply(tok);
  check(
    'H',
    'the re-write locks the old draft before its first await; the new draft is free',
    oldLocked && tok != null,
    { oldLocked, newLock: tok },
  );
  const wX = b.writes.at(-1);
  check(
    'H',
    'an unknown base: ignored with a reason (api.writeStorage.ignored), the middle size written',
    b.writes.length === n0 + 2 &&
      !('rulBase' in (wX?.in ?? {})) &&
      /XXL/.test(b.get().writeStorage.ignored ?? '') &&
      !!rulOf(wX)?.ok &&
      !b.get().session.error,
    `${b.get().writeStorage.ignored} · ${say(rulOf(wX))}`,
  );
  await b.dispatch({ type: 'write-storage', storage: 'blocks' });
  const wBl = b.writes.at(-1);
  check(
    'H',
    'back to blocks: written again without a package',
    b.writes.length === n0 + 3 &&
      !('storage' in (wBl?.in ?? {})) &&
      !!wBl &&
      wBl.out.scopes.every((x) => x.rul === undefined),
  );
  b.close();

  // ── H5 · our own kombinezon export (per-size blocks 6…20): refused with the piece that differs ──
  if (!o.kombinezon || !existsSync(o.kombinezon)) {
    console.log(`SKIP  H · kombinezon: no file (${o.kombinezon ?? 'RULHOOK_KOMBINEZON unset'})`);
    return;
  }
  const kb = readFileSync(o.kombinezon);
  const k = mount(['6', '8', '10', '12', '14', '16', '18', '20']);
  await k.dispatch({ type: 'write-storage', storage: 'rul' });
  const stopK = await k.drive([
    {
      name: basename(o.kombinezon),
      bytes: kb.buffer.slice(kb.byteOffset, kb.byteOffset + kb.byteLength) as ArrayBuffer,
    },
  ]);
  const wK = k.writes.at(-1);
  const rK = rulOf(wK);
  check(
    'H',
    'kombinezon: the write gets storage rul → not ok, FP_L named with its point counts',
    stopK === null &&
      wK?.in.storage === 'rul' &&
      !!rK &&
      !rK.ok &&
      rK.reasons.some((x) => /^FP_L\b.*points in/.test(x)),
    stopK ?? say(rK),
  );
  if (rK && !rK.ok) for (const x of rK.reasons.slice(0, 6)) console.log(`      - ${x}`);
  k.close();
}
