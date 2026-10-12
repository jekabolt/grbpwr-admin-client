// PATTERN-IMPORT · AP-REPLAY probe — a re-import of the same files into the same card reuses the
// previous import's answers (autopilot/replay.ts) and asks nothing new.
//
// Per corpus case (the e2e list), through the REAL wizard hook over an in-process worker Session
// (the autopilot metric's harness, autopilot-entry.ts):
//   1 · import #1 — the autopilot answers, and where it stops a stand-in operator answers through
//       the hook's own controls (go on past pages to check, pick the sheet / model, the size count,
//       "not a piece" on open regions, confirm counts as shown, "cut line", "not a fold" …); a case
//       that reaches the check step (written) is a replay case. Then an UNASKED operator edit: a
//       piece's name typed over (back to details, `editName`), written again.
//   2 · import #2, the manifests of #1 as the card's `existingPatterns`:
//         manual — the replay alone (no autopilot): must reach check with 0 questions;
//         auto   — the replay first, then the autopilot: 0 questions left to the autopilot;
//       both must write the SAME files: every scope's DXF (manifest prologue aside) and manifest
//       geometry (sizes, pieces, blocks, source) equal to #1's.
//   3 · mutated file (one byte appended → another sha256): nothing is replayed.
//   4 · moved piece (the record's outline of a piece with a confirmed count — else a grainline, a
//       confirmed name — shifted 50 mm, as if the piece read elsewhere): its answers do not land — listed "not replayed" — and the
//       question is asked (the manual replay stops on the details step).
//   5 · AP-tail (generated codes × the card): the card holds what import #1 applied (its pieces and
//       block links, the real draft builder):
//         a · the honest re-import (auto, replay first) applies through `autopilotApply` and creates
//             NO new card piece — every piece reuses its own, proven by the replay (lineage);
//         b · a piece the autopilot NAMED on #1 (P01 …) moved: its name does not replay, the code
//             the autopilot gives it again matches a card piece nothing ties it to → the autopilot
//             refuses the apply with the reason (never a silent update of that card piece). When
//             the piece reads a name of its own from the file instead (kombinezon-A: «FP»), the
//             new card piece beside the card's piece that is no longer drawn («P01») is refused too.
//   node scripts/pattern-import/replay.mjs [case…]   (yarn patimport:replay)
import { readManifest } from 'lib/pattern-import/manifest';
import { PATIMPORT } from 'lib/pattern-import/types';
import type { ConversionManifest, StageIO } from 'lib/pattern-import/types';
import { toWireError } from 'lib/pattern-import/worker/errors';
import type { CardContext } from 'components/managers/tech-card/components/pattern-import/client';
import { stubBuildDraft } from 'components/managers/tech-card/components/pattern-import/stub-client';
import {
  exportedRanks,
  useImportSession,
  variantsOf,
  type ImportSessionApi,
} from 'components/managers/tech-card/components/pattern-import/use-import-session';
import { buildDraft } from 'lib/pattern-import/fabrics/draft';
import type { CardDraft } from 'lib/pattern-import/types';
import {
  autopilotApply,
  hookDriveCtx,
  isReplayed,
  priorOf,
  replayDrive,
  resolverFor,
  type Prior,
} from 'components/managers/tech-card/components/pattern-import/autopilot';
import {
  driveTick,
  newDriveState,
  type DriveTick,
} from 'components/managers/tech-card/components/pattern-import/auto-drive';

import { CARD_ID, CASES } from './e2e-entry';
import { mountHook, rerender } from './react-hook-shim';
import { SCOPES, cardSizes, filesOf, sessionClient } from './autopilot-entry';

type Case = (typeof CASES)[number];
type Files = { name: string; bytes: ArrayBuffer }[];
type Mode = 'first' | 'manual' | 'auto';

type ScopeOut = {
  key: string;
  label: string;
  dxfText: string;
  manifest: ConversionManifest | null;
  passed: boolean;
};
type ImportRun = {
  reached: boolean;
  stop: string | null;
  scopes: ScopeOut[];
  asked: string[];
  answered: number;
  misses: { key: string; why: string }[];
  ops: string[];
  prior: { label: string; exact: boolean; answers: number } | null;
  replayed: number;
  /** Fill-only: an operator's answer over a replayed one stood (undefined = not tried). */
  kept?: boolean;
  /** The run's assumptions as the wizard lists them (replayed ones first word "R"). */
  list: string[];
  ticks: number;
  error?: string;
  /** The draft the card would receive (the builder the run was given). */
  draft?: CardDraft | null;
  /** `autopilotApply` on check (opts.apply). */
  applied?: { ok: boolean; reason?: string };
};

const settle = async () => {
  for (let k = 0; k < 4; k++) await Promise.resolve();
  rerender();
};

const cardOf = (c: Case, existing: CardContext['existingPatterns'] = []): CardContext => ({
  techCardId: CARD_ID,
  sizes: cardSizes(c.card),
  scopes: SCOPES,
  existingPieces: [],
  styleLabel: 'replay',
  ...(c.cardName ? { cardName: c.cardName } : {}),
  ...(existing.length ? { existingPatterns: existing } : {}),
});

/**
 * The stand-in operator of import #1: one answer to where the drive stopped, through the hook's
 * own controls (what the steps' buttons call). false = no answer (the case is not a replay case).
 */
async function operate(
  c: Case,
  get: () => ImportSessionApi,
  t: DriveTick & { kind: 'stopped' },
  ops: string[],
) {
  const api = get();
  const s = api.session;
  const say = (x: string) => ops.push(`${s.step}: ${x}`);
  switch (s.step) {
    case 'files':
    case 'pieces': {
      if (s.step === 'pieces') {
        const variants = variantsOf(s.pieces?.seeds ?? [], api.baseSeeds, s.pieces?.variants);
        if (variants.length > 1 && !s.variant) {
          const v = variants.find((x) => c.variant?.test(x)) ?? variants[0];
          say(`model ${v}`);
          await api.dispatch({ type: 'variant', variant: v });
          return true;
        }
        const mapped = exportedRanks(s.sizes?.map);
        const open = (s.pieces?.families ?? []).filter((f) =>
          f.candidates.some((k) => (!mapped || mapped.has(k.rank)) && k.outcome !== 'closed'),
        );
        if (open.length) {
          say(`not a piece: ${open.length} open regions`);
          for (const f of open) {
            await get().editPieces({ kind: 'not-a-piece', seed: f.seed });
            await settle();
          }
          return true;
        }
      }
      if (api.blocker) return false;
      say('next (go on past the offer)');
      const from = s.step;
      await api.next();
      await settle();
      return get().session.step !== from;
    }
    case 'sheet':
      // D6: no sheet is picked — every tile sheet is in the drawing
      return false;
    case 'sizes': {
      const sz = s.sizes;
      if (sz && ((sz.countAsk && !sz.expected) || /how many sizes/.test(t.reason ?? ''))) {
        const labelled = sz.run.sizes.filter((x) => x.label).length;
        const n = sz.countAsk?.auto?.n ?? sz.countAsk?.inferred?.n ?? Math.max(1, labelled);
        say(`${n} sizes drawn`);
        await api.setDrawnSizes(n);
        return true;
      }
      return false;
    }
    case 'meaning': {
      const sem = s.semantics;
      if (!sem) return false;
      const fail = sem.blocked.filter(
        (b) =>
          ![
            'no-grain',
            'grammar',
            'duplicate-identity',
            'fold-question',
            'fold-unresolved',
          ].includes(b.reason),
      );
      if (fail.length) {
        say(`not a piece: ${fail.length} pieces that cannot be built`);
        await api.dispatch({ type: 'back', to: 'pieces' });
        await settle();
        for (const b of fail) {
          await get().editPieces({ kind: 'not-a-piece', seed: b.seed });
          await settle();
        }
        return true;
      }
      const folds = sem.blocked.filter(
        (b) => b.reason === 'fold-question' || b.reason === 'fold-unresolved',
      );
      if (folds.length) {
        say(`not a fold: ${folds.length}`);
        const overrides = { ...api.inputs.overrides };
        for (const b of folds)
          overrides[b.seed] = { ...(overrides[b.seed] ?? {}), unfoldedFold: false };
        await api.dispatch({
          type: 'semantics',
          input: api.semanticsInput({ ...api.inputs, overrides }),
        });
        return true;
      }
      if (sem.foldList) {
        say('cutting list checked');
        await api.dispatch({
          type: 'semantics',
          input: api.semanticsInput({
            ...api.inputs,
            foldListChecked: [...new Set([...api.inputs.foldListChecked, ...sem.foldList.entries])],
          }),
        });
        return true;
      }
      if (/drawn outline is/.test(t.reason ?? '') || /drawn outline is/.test(api.blocker ?? '')) {
        say('the drawn outline is the cut line');
        await api.answerOutline('cut', PATIMPORT.defaultAllowanceMm);
        return true;
      }
      if (/drawn once|confirm/.test(t.reason ?? '') || /confirm/.test(api.blocker ?? '')) {
        say('confirm all as shown');
        api.confirmShown();
        await settle();
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}

/** The written files of the run (the write stage's last output). */
function scopesOf(outs: Record<string, unknown>): ScopeOut[] {
  const wr = outs.write as StageIO['write']['out'] | undefined;
  return (wr?.scopes ?? []).map((sc) => ({
    key: sc.target.scopeKey,
    label: sc.target.label,
    dxfText: sc.dxfText,
    manifest: readManifest(sc.dxfText),
    passed: !!wr?.gate[sc.target.scopeKey]?.passed,
  }));
}

async function runImport(
  c: Case,
  card: CardContext,
  mode: Mode,
  files: Files,
  opts: {
    typedName?: boolean;
    retype?: boolean;
    tweak?: (p: Prior) => Prior;
    /** The real draft builder (lib/fabrics/draft.ts) instead of the stub. */
    realDraft?: boolean;
    /** On check: the autopilot's gated apply (`autopilotApply`). */
    apply?: boolean;
  } = {},
): Promise<ImportRun> {
  const { client, outs } = sessionClient();
  let api!: ImportSessionApi;
  mountHook(() => {
    api = useImportSession({
      client,
      card,
      namer: async () => [],
      buildDraft: opts.realDraft ? (write, ctx) => buildDraft(write, ctx.card) : stubBuildDraft,
      applyDraft: async () => ({ ok: true, uploaded: [] }),
    });
  });
  const rec: ImportRun = {
    reached: false,
    stop: null,
    scopes: [],
    asked: [],
    answered: 0,
    misses: [],
    ops: [],
    prior: null,
    replayed: 0,
    list: [],
    ticks: 0,
  };
  let prior: Prior | null | undefined;
  const src = () => {
    const fs = api.session.files;
    if (prior === undefined && fs.length && fs.every((f) => f.sha256)) {
      prior = priorOf(card, fs);
      if (prior && opts.tweak) prior = opts.tweak(prior);
      rec.prior = prior
        ? { label: prior.label, exact: prior.exact, answers: prior.answers.length }
        : null;
    }
    return {
      prior: prior ?? null,
      card: api.runCard,
      baseSeeds: api.baseSeeds,
      presegmented: !!api.extracted.presegmented,
    };
  };
  const auto = resolverFor(card, () => api);
  const misses = new Map<string, string>();
  const rd =
    mode === 'first'
      ? null
      : replayDrive(src, mode === 'auto' ? auto : undefined, {
          miss: (m) => misses.set(m.key, m.why),
          answered: () => rec.answered++,
          asked: (step, q) => rec.asked.push(`${step}: ${q}`),
        });
  const resolve = rd ? rd.resolve : auto;
  const prefill = rd?.prefill;
  const drive = async (operator: boolean) => {
    let st = newDriveState();
    for (let t = 0; t < 600; t++) {
      rec.ticks++;
      const r = await driveTick(
        st,
        hookDriveCtx(() => api, settle, resolve, prefill),
      );
      await settle();
      if (r.kind !== 'stopped') continue;
      if (r.why === 'auto-stop' && api.session.step === 'check') return true;
      if (operator && rec.ops.length < 60 && (await operate(c, () => api, r, rec.ops))) {
        await settle();
        st = newDriveState();
        continue;
      }
      rec.stop = `${r.step}: ${r.why}: ${String(r.reason ?? r.question ?? '').slice(0, 200)}`;
      return false;
    }
    rec.stop = 'tick budget spent';
    return false;
  };
  try {
    await api.dispatch({ type: 'files', files: files.map((f) => new File([f.bytes], f.name)) });
    await settle();
    src();
    rec.reached = await drive(mode === 'first');
    // the unasked operator answer: a piece's name typed over, the files written again
    if (rec.reached && opts.typedName) {
      const p = api.session.semantics?.pieces[0];
      if (p) {
        await api.dispatch({ type: 'back', to: 'meaning' });
        await settle();
        await api.editName(p.seed, { code: 'ZZ', mods: [], displayName: 'replay probe' });
        await settle();
        rec.ops.push(`meaning: name typed over (seed ${p.seed} → ZZ)`);
        rec.reached = await drive(true);
      }
    }
    rec.scopes = rec.reached ? scopesOf(outs as Record<string, unknown>) : [];
    // fill-only: the operator types over a REPLAYED name, the drive (replay standing) runs on —
    // the operator's name must stand
    if (rec.reached && opts.retype) {
      const p = api.session.semantics?.pieces.find((x) => x.code === 'ZZ');
      if (p) {
        await api.dispatch({ type: 'back', to: 'meaning' });
        await settle();
        await api.editName(p.seed, { code: 'YY', mods: [], displayName: 'operator again' });
        await settle();
        const again = await drive(false);
        rec.kept =
          again &&
          !!api.session.semantics?.pieces.some((x) => x.seed === p.seed && x.code === 'YY');
      }
    }
    rec.draft = api.session.draft;
    if (rec.reached && opts.apply) {
      const o = await autopilotApply(() => api, card, settle);
      rec.applied = o.ok ? { ok: true } : { ok: false, reason: o.reason };
    }
    rec.replayed = api.inputs.autopilot.filter(isReplayed).length;
    rec.list = api.inputs.autopilot.map(
      (a) =>
        `${isReplayed(a) ? 'R' : 'A'}${a.strong ? '!' : ' '}${a.kind} · ${a.subject} → ${a.answer}`,
    );
  } catch (e) {
    rec.error = String((e as Error)?.stack ?? e).slice(0, 600);
  }
  rec.misses = [...misses].map(([key, why]) => ({ key, why }));
  try {
    await client.close(1);
  } catch {
    /* gone */
  }
  (globalThis as { gc?: () => void }).gc?.();
  return rec;
}

/** The DXF without its manifest prologue (999 comment pairs). */
function bare(dxf: string): string {
  const lines = dxf.split(/\r?\n/);
  const out: string[] = [];
  for (let k = 0; k + 1 < lines.length; k += 2) {
    if (lines[k].trim() === '999') continue;
    // the writer stamps the time of writing into the file's own text
    out.push(lines[k], lines[k + 1].replace(/(CREATION (?:TIME|DATE):?\s*)[^\n]*/i, '$1…'));
  }
  return out.join('\n');
}

/** What must be identical between two imports: the drawing and the manifest's geometry. */
const printOf = (xs: ScopeOut[]) =>
  xs.map((x) => ({
    key: x.key,
    passed: x.passed,
    dxf: bare(x.dxfText),
    m: x.manifest
      ? {
          scope: x.manifest.scope,
          allowanceMm: x.manifest.allowanceMm,
          sizes: x.manifest.sizes,
          pieces: x.manifest.pieces,
          blocks: x.manifest.blocks,
          source: x.manifest.source,
        }
      : null,
  }));

/** Where two exports differ, in words (first difference per scope). */
function diffOf(a: ScopeOut[], b: ScopeOut[]): string[] {
  const pa = printOf(a);
  const pb = printOf(b);
  if (pa.length !== pb.length) return [`scopes ${pa.map((x) => x.key)} vs ${pb.map((x) => x.key)}`];
  const out: string[] = [];
  pa.forEach((x, k) => {
    const y = pb[k];
    if (x.key !== y.key) out.push(`scope ${x.key} vs ${y.key}`);
    else if (x.passed !== y.passed) out.push(`${x.key}: gate ${x.passed} vs ${y.passed}`);
    else if (JSON.stringify(x.m) !== JSON.stringify(y.m)) {
      const f = (['sizes', 'pieces', 'blocks', 'source', 'allowanceMm', 'scope'] as const).find(
        (key) => JSON.stringify(x.m?.[key]) !== JSON.stringify(y.m?.[key]),
      );
      out.push(`${x.key}: manifest ${f} differs`);
    } else if (x.dxf !== y.dxf) {
      const la = x.dxf.split('\n');
      const lb = y.dxf.split('\n');
      const i = la.findIndex((l, j) => l !== lb[j]);
      out.push(`${x.key}: DXF line ${i}: ${la[i]?.slice(0, 60)} vs ${lb[i]?.slice(0, 60)}`);
    }
  });
  return out;
}

export async function runCase(c: Case) {
  const T0 = Date.now();
  const rec: Record<string, unknown> = { id: c.id, group: c.group };
  let files: Files;
  try {
    files = filesOf(c);
  } catch (e) {
    return { ...rec, verdict: 'crashed', error: String(e) };
  }
  // 1 · import #1 (autopilot + the stand-in operator), then a name typed over
  const first = await runImport(c, cardOf(c), 'first', files, { typedName: true, realDraft: true });
  rec.first = {
    reached: first.reached,
    stop: first.stop,
    ops: first.ops,
    scopes: first.scopes.map((x) => `${x.label}${x.passed ? '' : ' (gate blocks)'}`),
    error: first.error,
  };
  if (!first.reached || !first.scopes.length)
    return { ...rec, verdict: 'not-reached', ms: Date.now() - T0 };
  const existing = first.scopes.map((x, k) => ({
    scopeKey: x.key,
    filename: `${c.id}-${x.label}.dxf`,
    url: `mem://${c.id}/${k}`,
    lineKey: `L${k}`,
    name: `${c.id} ${x.label}`,
    manifest: x.manifest,
  }));
  const record = first.scopes[0].manifest?.replay?.answers ?? [];
  rec.record = { answers: record.length, kinds: [...new Set(record.map((a) => a.kind))] };
  const card2 = cardOf(c, existing);
  // 2 · import #2: the replay alone, then the replay before the autopilot
  const out: Record<string, unknown> = {};
  const failures: string[] = [];
  for (const mode of ['manual', 'auto'] as const) {
    const r = await runImport(c, card2, mode, files, { retype: mode === 'manual' });
    const diff = r.reached ? diffOf(first.scopes, r.scopes) : ['did not reach check'];
    out[mode] = {
      reached: r.reached,
      stop: r.stop,
      questions: r.asked.length,
      asked: r.asked.slice(0, 6),
      answered: r.answered,
      replayed: r.replayed,
      list: r.list.slice(0, 40),
      prior: r.prior,
      misses: r.misses.slice(0, 8),
      identical: !diff.length,
      kept: r.kept,
      diff: diff.slice(0, 4),
      error: r.error,
    };
    if (!r.prior?.exact) failures.push(`${mode}: no exact previous import found`);
    if (r.asked.length) failures.push(`${mode}: ${r.asked.length} questions (${r.asked[0]})`);
    if (diff.length) failures.push(`${mode}: export differs (${diff[0]})`);
    if (r.error) failures.push(`${mode}: ${r.error.split('\n')[0]}`);
    if (r.kept === false)
      failures.push(`${mode}: the replay overwrote the operator's later answer`);
  }
  // 3 · mutated files (every file one byte longer): another sha256, nothing replayed
  const mutated = files.map((f, k) => ({
    ...f,
    bytes: concat(f.bytes, c.files[k]?.endsWith('.pdf') ? '\n%replay\n' : '\n'),
  }));
  const mu = await runImport(c, card2, 'manual', mutated);
  out.mutated = { prior: mu.prior, answered: mu.answered, replayed: mu.replayed };
  if (mu.prior || mu.answered || mu.replayed)
    failures.push(`mutated: replayed (${mu.answered} answers)`);
  // 3b · one of several files changed: a partial match — only the unchanged files' pages answers
  if (files.length > 1) {
    const one = files.map((f, k) =>
      k === 0
        ? { ...f, bytes: concat(f.bytes, c.files[0]?.endsWith('.pdf') ? '\n%replay\n' : '\n') }
        : f,
    );
    const pa = await runImport(c, card2, 'manual', one);
    const beyond = pa.list.filter(
      (l) => l.startsWith('R') && !/clean-accept|pages-as-read/.test(l),
    );
    out.partial = { prior: pa.prior, answered: pa.answered, beyond: beyond.slice(0, 4) };
    if (!pa.prior || pa.prior.exact) failures.push('partial: no partial previous import found');
    if (beyond.length) failures.push(`partial: replayed beyond the pages (${beyond[0]})`);
  }
  // 4 · a moved piece: a piece whose count was confirmed reads 50 mm elsewhere in the record
  // a piece with an answer to a question: a confirmed count, else a grainline, else a confirmed name
  const answered = (f: string) =>
    record.find((a) => a.kind === 'piece' && (a.value as Record<string, unknown>)[f] !== undefined);
  const target = answered('qty') ?? answered('grain') ?? answered('named');
  if (target) {
    const pc = (target.value as { pc: { a: number; x: number; y: number } }).pc;
    const tweak = (p: Prior): Prior => ({
      ...p,
      answers: p.answers.map((a) =>
        a === target ||
        (a.kind === 'piece' &&
          JSON.stringify((a.value as { pc: unknown }).pc) === JSON.stringify(pc))
          ? { ...a, value: { ...(a.value as object), pc: { ...pc, x: pc.x + 50 } } }
          : a,
      ),
    });
    const mv = await runImport(c, card2, 'manual', files, { tweak });
    const missed = mv.misses.some((m) => m.key === `piece|${pc.x + 50},${pc.y}`);
    const asked = mv.asked.some((q) => q.startsWith('meaning'));
    out.moved = {
      piece: target.subject,
      missed,
      asked,
      stop: mv.stop,
      misses: mv.misses.slice(0, 4),
    };
    if (!missed) failures.push('moved: the moved piece was not listed as not replayed');
    if (!asked) failures.push('moved: no question asked for the moved piece');
  } else out.moved = null;
  // 5 · AP-tail: the card holds what import #1 applied (pieces + block links, real draft)
  const d1 = first.draft;
  if (d1) {
    const card3: CardContext = {
      ...card2,
      existingPieces: d1.pieces.map((p) => ({
        lineKey: p.lineKey,
        name: p.name,
        cutSymmetry: p.cutSymmetry,
        piecesPerGarment: p.piecesPerGarment,
        fused: p.fused,
        fusingMode: p.fusingMode,
      })),
      existingAliases: d1.aliases.map((a) => ({
        scopeKey: a.scopeKey,
        blockName: a.blockName,
        pieceLineKey: a.pieceLineKey,
      })),
    };
    // a · the honest re-import: applied, every piece its own card piece (lineage), none new
    const h = await runImport(c, card3, 'auto', files, { realDraft: true, apply: true });
    const fresh = (h.draft?.pieces ?? []).filter((p) => !p.existingLineKey).map((p) => p.name);
    out.lineage = {
      reached: h.reached,
      stop: h.stop,
      applied: h.applied,
      pieces: h.draft?.pieces.length ?? 0,
      created: fresh,
    };
    // a gate block refuses any apply (the export would be known wrong): not this check's concern
    const gated = (o?: { reason?: string }) => /^the gate blocks/.test(o?.reason ?? '');
    if (!h.reached) failures.push(`lineage: did not reach check (${h.stop})`);
    else if (!h.applied?.ok && !gated(h.applied))
      failures.push(`lineage: apply refused (${h.applied?.reason})`);
    if (fresh.length) failures.push(`lineage: ${fresh.length} new card pieces (${fresh[0]})`);
    // b · a piece named by the autopilot on #1 moved: its code is not proven any more
    const named = record.find((a) => {
      const v = a.value as { name?: { code?: string }; auto?: string[] } | null;
      return (
        a.kind === 'piece' &&
        !!v?.name?.code &&
        /^P\d+$/.test(v.name.code) &&
        !!v.auto?.includes('name')
      );
    });
    if (named) {
      const pc = (named.value as { pc: { a: number; x: number; y: number } }).pc;
      const tweak = (p: Prior): Prior => ({
        ...p,
        answers: p.answers.map((a) =>
          a.kind === 'piece' &&
          JSON.stringify((a.value as { pc: unknown }).pc) === JSON.stringify(pc)
            ? { ...a, value: { ...(a.value as object), pc: { ...pc, x: pc.x + 50 } } }
            : a,
        ),
      });
      const m = await runImport(c, card3, 'auto', files, { realDraft: true, apply: true, tweak });
      out.movedNamed = {
        piece: named.subject,
        reached: m.reached,
        stop: m.stop,
        applied: m.applied,
        misses: m.misses.slice(0, 3),
        named: m.list.filter((l) => /^A.name-code/.test(l)).slice(0, 4),
        card: (m.draft?.pieces ?? []).map(
          (p) => `${p.name}${p.existingLineKey ? '' : ' (new)'} ×${p.piecesPerGarment}`,
        ),
        vanished: (m.draft?.scopes ?? [])
          .flatMap((sc) => sc.vanished ?? [])
          .map((v) => v.pieceName),
      };
      // the moved piece is not proven the card's piece any more, whatever it is named now — a code
      // the autopilot gives it again (P05 over the card's P05) or its own name read back from the
      // file («FP» beside the card's «P01», which loses its drawing): never applied on its own
      const generated = m.list.some((l) => /^A.name-code/.test(l));
      (out.movedNamed as Record<string, unknown>).generated = generated;
      const why = m.applied?.reason ?? '';
      if (m.reached && m.applied?.ok)
        failures.push(
          `moved named piece: applied — ${generated ? 'a generated code' : 'its own file name'} reached the card without lineage`,
        );
      else if (m.reached && !gated(m.applied) && !/generated code|no longer drawn/.test(why))
        failures.push(`moved named piece: refused for another reason (${why})`);
      // kombinezon-A (failing before AP-tail 3): the moved P01 reads «FP» back — a new card piece
      // «FP» beside the card's «P01» that is no longer drawn: refused, both pieces named
      if (
        c.id === 'kombinezon-A' &&
        m.reached &&
        !/«FP».*no longer drawn|«P01».*no longer/.test(why)
      )
        failures.push(
          `kombinezon-A moved piece: not refused as «FP» beside «P01» (${why || 'applied'})`,
        );
    } else out.movedNamed = null;
  }
  return {
    ...rec,
    ...out,
    verdict: failures.length ? 'FAIL' : 'ok',
    failures,
    ms: Date.now() - T0,
  };
}

function concat(a: ArrayBuffer, tail: string): ArrayBuffer {
  const t = new TextEncoder().encode(tail);
  const out = new Uint8Array(a.byteLength + t.byteLength);
  out.set(new Uint8Array(a), 0);
  out.set(t, a.byteLength);
  return out.buffer;
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === 'list') {
    console.log(JSON.stringify(CASES.map((c) => c.id)));
    return 0;
  }
  const want = args.length ? CASES.filter((c) => args.includes(c.id)) : CASES;
  for (const c of want) {
    let r: Record<string, unknown>;
    try {
      r = await runCase(c);
    } catch (e) {
      r = { id: c.id, verdict: 'crashed', error: toWireError(e).message.slice(0, 600) };
    }
    console.log(`@@RESULT ${JSON.stringify(r)}`);
  }
  return 0;
}
