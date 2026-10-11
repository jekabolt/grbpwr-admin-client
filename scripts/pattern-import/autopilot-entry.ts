// PATTERN-IMPORT · A10 AUTOPILOT METRIC — every e2e corpus case through the REAL wizard hook
// (use-import-session.ts, React replaced by the one-component shim) over an in-process worker
// Session, with the autopilot answering every question instead of the TRUTH-driven operator:
// 0 clicks, no AI names (headless). Per case: reached apply (gate passed) or stopped (step +
// reason); then the export against corpus/truth.json — pieces matched, counts, folds, sizes,
// outline, fabric, model — each wrong item attributed to the assumption that gave it (or to the
// sheet's own evidence when nothing was assumed). Grain has no truth: the fallback rule is scored
// against the grainlines the sheets DO draw (A1 'detected').
//   node scripts/pattern-import/autopilot.mjs [case…] [--mutate=qty|size]
//   (yarn patimport:autopilot · yarn patimport:e2e --autopilot)
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { readManifest } from 'lib/pattern-import/manifest';
import { answersNowOf } from 'components/managers/tech-card/components/pattern-import/answers';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';
import { toWireError } from 'lib/pattern-import/worker/errors';
import type {
  CardSize,
  DraftScopeTarget,
  PieceFamily,
  Seed,
  SeedId,
  SizeMapEntry,
  StageIO,
  StageName,
} from 'lib/pattern-import/types';
import type {
  CardContext,
  ImportClient,
} from 'components/managers/tech-card/components/pattern-import/client';
import { stubBuildDraft } from 'components/managers/tech-card/components/pattern-import/stub-client';
import {
  exportedRanks,
  useImportSession,
  type ImportSessionApi,
} from 'components/managers/tech-card/components/pattern-import/use-import-session';
import {
  angleDiff180,
  autopilotAnswer,
  autopilotRecordOf,
  autopilotApply,
  hookDriveCtx,
  resolverFor,
  fallbackGrain,
  longestStraight,
  principalAxis,
  type Assumption,
  type AutopilotAnswer,
  type AutopilotSnapshot,
} from 'components/managers/tech-card/components/pattern-import/autopilot';

import { CARD_ID, CASES } from './e2e-entry';
import { mountHook, rerender } from './react-hook-shim';
import {
  driveTick,
  newDriveState,
} from 'components/managers/tech-card/components/pattern-import/auto-drive';
import { splitSize } from './worker-entry';

type Case = (typeof CASES)[number];

/** Labelled points inside the truth pieces (sheet mm), from the click fixture of the truth id. */
function truthPoints(c: Case): { label: string; at: { x: number; y: number } }[] {
  const tid = c.truth?.id;
  const key =
    c.clicks ?? (tid ? CASES.find((x) => x.truth?.id === tid && x.clicks)?.clicks : undefined);
  if (!key) return [];
  try {
    const fx = JSON.parse(
      readFileSync(
        resolve(
          process.env.PATIMPORT_REPO ?? process.cwd(),
          'scripts/pattern-import/fixtures/pieces-clicks.json',
        ),
        'utf8',
      ),
    ) as Record<string, { clicks?: { label: string; at: [number, number] }[] }>;
    return (fx[key]?.clicks ?? []).map((k) => ({ label: k.label, at: { x: k.at[0], y: k.at[1] } }));
  } catch {
    return [];
  }
}

/** A truth point this close (mm) to an exported outline it is not inside still names it. */
const GEO_NEAR_MM = 40;

/** Distance (mm) from a point to a closed polygon's edges. */
function distToPoly(p: { x: number; y: number }, q: readonly { x: number; y: number }[]): number {
  let best = Infinity;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const a = q[j];
    const b = q[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/** Even-odd point in polygon. */
function insidePoly(p: { x: number; y: number }, q: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++)
    if (
      q[i].y > p.y !== q[j].y > p.y &&
      p.x < ((q[j].x - q[i].x) * (p.y - q[i].y)) / (q[j].y - q[i].y) + q[i].x
    )
      inside = !inside;
  return inside;
}

const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';

const SCOPES: DraftScopeTarget[] = [
  ['MAIN', 'L1', 'main', false, 'FABRIC'],
  ['LINING', 'L2', 'lining', false, 'LINING'],
  ['INTERLINING', 'L3', 'interlining', true, 'INTERLINING'],
].map(([p, line, label, inter, sec]) => ({
  scopeKey: `TECH_CARD_BOM_PURPOSE_${p}`,
  fabricPurpose: `TECH_CARD_BOM_PURPOSE_${p}`,
  bomLineKey: line as string,
  label: label as string,
  isInterlining: inter as boolean,
  sections: [`TECH_CARD_BOM_SECTION_${sec}`],
}));

const cardSizes = (tokens: string[]): CardSize[] =>
  tokens.map((t, i) => ({ sizeId: 100 + i, name: t, token: t, rank: i, spellings: [t] }));

function filesOf(c: Case): { name: string; bytes: ArrayBuffer }[] {
  const enc = (b: Buffer) =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  if (c.files[0]?.startsWith('split:')) {
    const graded = readFileSync(resolve(CORPUS, 'dxf-clo/allsizes-merged.dxf')).toString('latin1');
    return c.files.map((f) => {
      const s = f.slice(6);
      return {
        name: `coat_${s.toLowerCase()}.dxf`,
        bytes: enc(Buffer.from(splitSize(graded, s), 'latin1')),
      };
    });
  }
  return c.files.map((f) => ({ name: basename(f), bytes: enc(readFileSync(resolve(CORPUS, f))) }));
}

/** The worker session in-process, behind the wizard's client seam; every stage output kept. */
function sessionClient() {
  let s: Session | null = null;
  const outs: Partial<Record<StageName, unknown>> = {};
  const ctx: StageCtx = { checkCancel: () => {}, progress: () => {} };
  const client: ImportClient = {
    kind: 'worker',
    async open(files) {
      s?.close();
      s = new Session(1, files);
      return { sessionId: 1, files: s.files };
    },
    async run(_id, stage, input) {
      if (!s) throw new Error('no session');
      // headless: the SoM render is for the AI namer only, and there is no AI here
      if (stage === 'render-som') return { sheetPng: new Blob([]), crops: [], marks: [] } as never;
      const out = await s.runStage(stage, input as never, ctx);
      outs[stage] = out;
      return out as never;
    },
    cancel() {},
    async close() {
      s?.close();
      s = null;
    },
    alive: () => true,
  };
  return { client, outs };
}

// ── truth ───────────────────────────────────────────────────────────────────────────────────────

type TPiece = { label: string; qty: unknown; fold: unknown; fabric?: unknown };
type TSample = {
  id: string;
  sizes?: { list?: unknown };
  seam_allowance?: { included?: unknown };
  variants: { pieces: TPiece[] }[];
};
let TRUTH: TSample[] | null = null;
function truthOf(c: Case): TSample | null {
  if (!c.truth) return null;
  TRUTH ??= (
    JSON.parse(readFileSync(resolve(CORPUS, 'truth.json'), 'utf8')) as { samples: TSample[] }
  ).samples;
  return TRUTH.find((x) => x.id === c.truth!.id) ?? null;
}
const norm = (x: string) =>
  x
    .toLowerCase()
    .replace(/^piece\s+/, '')
    .replace(/\.$/, '')
    .trim();
const bare = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
const fabricOf = (f: unknown): string => {
  const t = String(f ?? '').toLowerCase();
  if (/^lining/.test(t)) return 'TECH_CARD_BOM_PURPOSE_LINING';
  if (/^(interfacing|interlining)/.test(t)) return 'TECH_CARD_BOM_PURPOSE_INTERLINING';
  return 'TECH_CARD_BOM_PURPOSE_MAIN';
};

type Wrong = { kind: string; subject: string; got: string; want: string; assumed: string | null };

// ── one case ────────────────────────────────────────────────────────────────────────────────────

export async function runCase(c: Case, mutate: string | null) {
  const T0 = Date.now();
  const rec: Record<string, unknown> = { id: c.id, group: c.group };
  const card: CardContext = {
    techCardId: CARD_ID,
    sizes: cardSizes(c.card),
    scopes: SCOPES,
    existingPieces: [],
    styleLabel: 'autopilot',
  };
  const { client, outs } = sessionClient();
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
  const st = newDriveState();
  let done: null | { ok: true } | { ok: false; stop: { step: string; reason: string } } = null;
  let ticks = 0;
  const mutated: string[] = [];
  const wrapped = (snap: AutopilotSnapshot): AutopilotAnswer => {
    // the policy's own fingerprint of "now" must be the wizard's (answers.ts answersNowOf)
    const mine = JSON.stringify(answersNowOf(snap.session, snap.inputs));
    if (mine !== JSON.stringify(api.answersNow)) fingerprintDrift++;
    const a = autopilotAnswer(snap);
    return mutate ? mutateAnswer(mutate, snap, a, mutated, c) : a;
  };
  let fingerprintDrift = 0;
  const trace: string[] = [];
  let files: { name: string; bytes: ArrayBuffer }[] = [];
  try {
    files = filesOf(c);
  } catch (e) {
    rec.verdict = 'crashed';
    rec.error = String(e);
    return rec;
  }
  try {
    await api.dispatch({
      type: 'files',
      files: files.map((f) => new File([f.bytes], f.name)),
    });
    await settle();
    // the wizard's own drive tick (auto-drive.ts), the autopilot's resolver, then — on a green
    // gate — the autopilot's explicit apply path: the same code the wizard runs
    const resolve = resolverFor(card, () => api);
    const answer = (snap: Parameters<typeof resolve>[0]) => {
      const x = {
        ...snap,
        card,
        baseSeeds: api.baseSeeds,
        presegmented: !!api.extracted.presegmented,
      };
      return wrapped(x);
    };
    for (let t = 0; t < 400 && !done; t++) {
      ticks++;
      const step = api.session.step;
      const r = await driveTick(
        st,
        hookDriveCtx(() => api, settle, answer),
      );
      await settle();
      trace.push(
        `${step}:${r.kind === 'answered' ? 'answer' : r.kind === 'moved' ? 'next' : r.kind}`,
      );
      if (r.kind !== 'stopped') continue;
      if (r.why === 'auto-stop' && api.session.step === 'check') {
        const o = await autopilotApply(() => api, card, settle);
        trace.push(o.ok ? 'apply:done' : `${o.step}:stop`);
        done = o.ok ? { ok: true } : { ok: false, stop: { step: o.step, reason: o.reason } };
      } else
        done = {
          ok: false,
          stop: { step: r.step, reason: `${r.why}: ${r.reason ?? r.question ?? ''}` },
        };
    }
  } catch (e) {
    rec.error = String((e as Error)?.stack ?? e).slice(0, 600);
  }
  const s = api.session;
  rec.trace = compress(trace);
  // the pages clean set aside "to check", with the facts the policy reads (A10 r4)
  rec.pagesAside = (s.clean?.dropped ?? [])
    .filter((d) => d.status === 'suggest')
    .map((d) => {
      const c = s.pages.find((p) => p.file === d.file && p.page === d.page);
      return `${d.cls} p${d.page + 1}${d.face ? ' face' : ''}${d.reducedCopy ? ` copy ${d.reducedCopy.matches}@${d.reducedCopy.scale}` : ''}${c?.ink ? ` ink ${c.ink.strokeM}m/${c.ink.texts}t` : ''}`;
    });
  rec.setAside = (s.pieces?.setAside ?? []).map(
    (a) => `${a.reason} ${Math.round(a.areaMm2 / 100)}cm² ${a.seed?.text?.text ?? ''}`,
  );
  rec.sizesRead = s.sizes
    ? {
        labels: s.sizes.run.sizes.map((x) => x.label),
        expected: s.sizes.expected,
        countAsk: s.sizes.countAsk,
        map: s.sizes.map.entries.map((e) => `${e.source.label || '∅'}→${e.card?.token ?? '—'}`),
      }
    : null;
  rec.legend = (s.chains?.classes ?? []).map(
    (k) =>
      `${k.role}${k.sizeLabel ? ` ${k.sizeLabel}` : ''} ${k.confidence.toFixed(2)} ${Math.round(k.totalLengthMm)}mm`,
  );
  rec.ticks = ticks;
  rec.clicks = 0;
  rec.verdict = done?.ok ? 'apply' : 'stopped';
  if (done && !done.ok) rec.stop = done.stop;
  else if (!done) rec.stop = { step: s.step, reason: 'tick budget spent' };
  if (rec.verdict === 'stopped' && c.group === 'refusal') rec.expectedStop = true;
  rec.fingerprintDrift = fingerprintDrift;
  // the run's assumptions as the wizard keeps them (merged into its inputs, one per question)
  const as = api.inputs.autopilot;
  rec.assumptions = {
    total: as.length,
    strong: as.filter((a) => a.strong).length,
    byKind: countBy(as.map((a) => a.kind)),
    strongByKind: countBy(as.filter((a) => a.strong).map((a) => a.kind)),
    list: as.map((a) => `${a.strong ? '!' : ' '}${a.kind} · ${a.subject} → ${a.answer}`),
  };
  if (mutated.length) rec.mutated = mutated;

  // the written files: gate, manifest round trip (the assumptions ride in every manifest)
  const wr = outs.write as StageIO['write']['out'] | undefined;
  if (wr && s.step !== 'fabrics') {
    const want = autopilotRecordOf(as, new Set((s.semantics?.pieces ?? []).map((p) => p.seed)))
      .assumptions.length;
    rec.write = wr.scopes.map((sc) => {
      const m = readManifest(sc.dxfText);
      const g = wr.gate[sc.target.scopeKey];
      return {
        scope: sc.target.label,
        passed: !!g?.passed,
        blocks: sc.manifest.blocks.length,
        blocking: (g?.checks ?? []).filter((k) => !k.ok && k.severity === 'block').map((k) => k.id),
        manifestAssumptions: m?.autopilot?.assumptions.length ?? null,
        manifestOk:
          !!m &&
          m.techCardId === CARD_ID &&
          // no assumption = no autopilot field (an operator-shaped manifest)
          (want ? m.autopilot?.assumptions.length === Math.min(want, 400) : !m.autopilot),
      };
    });
  }

  // the export against TRUTH
  const seeds = [...(api.baseSeeds ?? []), ...(s.pieces?.seeds ?? [])];
  const labelOf = (sd: SeedId) => seeds.find((x) => x.id === sd)?.text?.text ?? null;
  const assumedOn = (seed: SeedId | null, kinds: string[], subject?: string) =>
    as.find(
      (a) =>
        kinds.includes(a.kind) &&
        (seed != null ? a.seed === seed : subject != null ? a.subject === subject : true),
    )?.kind ?? null;
  const wrong: Wrong[] = [];
  const truth = truthOf(c);
  const sem = s.semantics;
  const reached = rec.verdict === 'apply';
  if (truth && sem) {
    const tps = truth.variants[c.truth?.variant ?? 0]?.pieces ?? [];
    const byLabel = (sd: SeedId) => {
      const l = labelOf(sd);
      if (!l) return null;
      const n = norm(l);
      return tps.find((x) => norm(x.label) === n || norm(x.label.split(' / ')[0]) === n) ?? null;
    };
    // geometry first (A10 r4): a truth point (a labelled click inside each truth piece, sheet mm —
    // fixtures/pieces-clicks.json, by the case's truth id) inside the exported piece's outline; a
    // label decides only a tie (several points in one outline) or where no truth point exists
    const pts = truthPoints(c);
    const outerOf = (sd: SeedId) => {
      const fam = s.pieces?.families.find((f) => f.seed === sd);
      const best = fam?.candidates
        .filter((x) => x.outcome === 'closed' && x.outer.length > 2)
        .sort((x, y) => y.areaMm2 - x.areaMm2)[0];
      return best ? { outer: best.outer, area: best.areaMm2 } : null;
    };
    // one truth point per exported piece: a point inside several outlines (a piece drawn inside
    // another — wm's collar on the back) goes to the smallest; a piece with no point inside takes
    // the nearest free point within GEO_NEAR_MM of its outline (a fixture point clicked on a
    // larger size of the nest); a label breaks a tie only
    const geo = new Map<SeedId, string>();
    const nearBy = new Map<SeedId, number>();
    if (pts.length) {
      const seedsAll = [...new Set(sem.pieces.map((p) => p.seed))];
      const outs = new Map(seedsAll.map((sd) => [sd, outerOf(sd)] as const));
      const free = new Set(pts.map((p) => p.label));
      for (const p of pts) {
        const owners = seedsAll
          .filter((sd) => {
            const o = outs.get(sd);
            return !!o && !geo.has(sd) && insidePoly(p.at, o.outer);
          })
          .sort((x, y) => outs.get(x)!.area - outs.get(y)!.area);
        const lab = owners.find((sd) => byLabel(sd) && norm(byLabel(sd)!.label) === norm(p.label));
        const sd = lab ?? owners[0];
        if (sd == null) continue;
        geo.set(sd, p.label);
        free.delete(p.label);
      }
      for (const sd of seedsAll) {
        const o = outs.get(sd);
        if (geo.has(sd) || !o) continue;
        const near = pts
          .filter((p) => free.has(p.label))
          .map((p) => ({ p, d: distToPoly(p.at, o.outer) }))
          .sort((x, y) => x.d - y.d)[0];
        if (near && near.d <= GEO_NEAR_MM) {
          nearBy.set(sd, Math.round(near.d));
          geo.set(sd, near.p.label);
          free.delete(near.p.label);
        }
      }
      rec.geo = seedsAll.map(
        (sd) =>
          `seed ${sd} → ${geo.get(sd) ?? '—'}${nearBy.has(sd) ? ` (near, ${nearBy.get(sd)} mm off)` : ''}`,
      );
    }
    const match = (sd: SeedId) => {
      if (!pts.length) return byLabel(sd);
      const l = geo.get(sd);
      return l ? tps.find((x) => norm(x.label) === norm(l)) ?? null : null;
    };
    const bySeed = new Map<SeedId, typeof sem.pieces>();
    for (const p of sem.pieces) bySeed.set(p.seed, [...(bySeed.get(p.seed) ?? []), p]);
    // Codex #6: a BIJECTIVE match truth ↔ export (by the piece's printed label): one exported
    // piece per truth piece; a second one on the same label is an extra
    const taken = new Set<TPiece>();
    let matched = 0;
    let extra = 0;
    for (const [sd, ps] of bySeed) {
      const t0 = match(sd);
      const t = t0 && !taken.has(t0) ? t0 : null;
      const subject = `seed ${sd}${labelOf(sd) ? ` · ${labelOf(sd)}` : ''}`;
      if (!t) {
        extra++;
        wrong.push({
          kind: 'piece-set',
          subject,
          got: 'exported',
          want: t0 ? 'one piece per label' : 'no such piece (no truth label)',
          assumed: assumedOn(sd, ['seed-click', 'name-code']),
        });
        continue;
      }
      taken.add(t);
      matched++;
      const qty = typeof t.qty === 'number' ? t.qty : parseInt(String(t.qty), 10);
      const got = ps.reduce((a, p) => a + p.piecesPerGarment, 0);
      if (Number.isFinite(qty) && got !== qty)
        wrong.push({
          kind: 'quantity',
          subject,
          got: String(got),
          want: String(qty),
          assumed: assumedOn(sd, ['quantity', 'fold-edge', 'not-a-fold']),
        });
      // the fold, both ways: a fold piece not unfolded, a piece unfolded that is not cut on fold
      const unfolded = ps.some((p) => p.unfoldedFold);
      if ((t.fold === true) !== unfolded && (t.fold === true || t.fold === false))
        wrong.push({
          kind: 'fold',
          subject,
          got: unfolded ? 'unfolded' : 'not unfolded',
          want: t.fold === true ? 'unfolded' : 'as drawn',
          assumed:
            assumedOn(sd, ['fold-edge', 'not-a-fold', 'cutting-list']) ??
            assumedOn(null, ['cutting-list']),
        });
      const fab = fabricOf(t.fabric);
      const inFab = (s.fabrics?.byPurpose[fab] ?? []).includes(sd);
      if (s.fabrics && !inFab)
        wrong.push({
          kind: 'fabric',
          subject,
          got: Object.entries(s.fabrics?.byPurpose ?? {})
            .filter(([, v]) => v.includes(sd))
            .map(([k]) => k.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase())
            .join('+'),
          want: fab.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase(),
          assumed: assumedOn(sd, ['fabric']) ?? assumedOn(null, ['fabric'], 'every piece'),
        });
    }
    // a truth piece the export misses: set aside by the autopilot (with or without a label), by
    // the reader, or never found
    const want = c.truth?.expect ?? tps.length;
    const asides = as.filter((a) => ['set-aside', 'not-a-piece', 'dropped-piece'].includes(a.kind));
    const labelled = (a: Assumption) =>
      tps.find((t) => a.subject.toLowerCase().includes(`«${norm(t.label)}`)) ?? null;
    for (let k = 0; k < Math.max(0, want - matched); k++) {
      const a = asides[k] ?? null;
      wrong.push({
        kind: 'piece-set',
        subject: a
          ? `${a.subject}${labelled(a) ? ' (a truth label)' : ''}`
          : `truth piece ${k + 1}`,
        got: 'missing',
        want: 'exported',
        assumed: a ? a.kind : null,
      });
    }
    rec.truth = {
      pieces: want,
      matched,
      exported: bySeed.size,
      extra,
      missing: Math.max(0, want - matched),
    };
    // the outline
    const inc = truth.seam_allowance?.included;
    const wantMeaning = inc === true ? 'cut' : inc === false ? 'seam' : null;
    if (wantMeaning) {
      const off = sem.pieces.filter(
        (p) => p.allowance.meaning !== 'both' && p.allowance.meaning !== wantMeaning,
      );
      if (off.length)
        wrong.push({
          kind: 'outline',
          subject: `${off.length} pieces`,
          got: off[0].allowance.meaning,
          want: wantMeaning,
          assumed: assumedOn(null, ['outline']),
        });
    }
  }
  // sizes: the written source label against the card token it went to (and the truth's run)
  if (wr && truth?.sizes && Array.isArray(truth.sizes.list)) {
    const list = truth.sizes.list as string[];
    const tokens = new Set(c.card.map(bare));
    const sizes = wr.scopes[0]?.manifest.sizes ?? [];
    const runN = s.sizes?.run.sizes.length ?? 0;
    for (const z of sizes) {
      const lab = bare(z.sourceLabel ?? '');
      const want = tokens.has(lab)
        ? lab
        : runN === list.length && list[z.rank] && tokens.has(bare(list[z.rank]))
          ? bare(list[z.rank])
          : null;
      if (want != null && want !== bare(z.token))
        wrong.push({
          kind: 'size',
          subject: `source ${z.sourceLabel || `rank ${z.rank}`}`,
          got: z.token,
          want,
          assumed:
            assumedOn(
              null,
              ['size-ordinal', 'size-guess', 'drawn-sizes'],
              `source ${z.sourceLabel || `rank ${z.rank}`}`,
            ) ?? assumedOn(null, ['drawn-sizes']),
        });
    }
  }
  // the model / the sheet
  if (c.variant && s.variant && !c.variant.test(s.variant))
    wrong.push({
      kind: 'model',
      subject: 'the sheet',
      got: s.variant,
      want: String(c.variant),
      assumed: assumedOn(null, ['model']),
    });
  if (c.sheet && c.sheet !== api.inputs.sheetIndex)
    wrong.push({
      kind: 'sheet',
      subject: 'the file',
      got: String(api.inputs.sheetIndex),
      want: String(c.sheet),
      assumed: assumedOn(null, ['sheet-choice']),
    });
  rec.wrong = {
    total: wrong.length,
    byKind: countBy(wrong.map((w) => w.kind)),
    assumedByKind: countBy(wrong.filter((w) => w.assumed).map((w) => w.assumed!)),
    items: wrong.map(
      (w) =>
        `${w.kind} · ${w.subject}: ${w.got} ≠ ${w.want}${w.assumed ? ` [${w.assumed}]` : ' [sheet]'}`,
    ),
  };
  rec.wrongPassing = reached ? wrong.length : 0;

  // grain: the fallback rule against the grainlines the sheet draws
  if (sem && s.pieces) {
    const mapped = exportedRanks(s.sizes?.map);
    const seen = new Set<SeedId>();
    const errs: number[] = [];
    const grainRows: Record<string, unknown>[] = [];
    for (const p of sem.pieces) {
      if (seen.has(p.seed) || p.unfoldedFold) continue;
      seen.add(p.seed);
      const z = p.sizes[p.sizes.length - 1];
      const g = z?.grain;
      // a grain the sheet DRAWS: detected, or an accepted proposal resting on a drawn line
      const drawnLine = (g?.evidence ?? []).some(
        (e) => e !== 'geometry' && e !== 'accepted' && e !== 'operator',
      );
      if (!g || (g.origin !== 'detected' && !drawnLine)) continue;
      // the written cut line: the grain's own frame (a DXF block's outline may lie turned)
      const ring =
        z.cut.length > 2
          ? z.cut
          : ringOf(
              s.pieces.families.find((f) => f.seed === p.seed),
              mapped,
              z.rank,
            );
      const fb = ring ? fallbackGrain(ring) : null;
      if (!fb) continue;
      const ga = (Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) * 180) / Math.PI;
      errs.push(angleDiff180(fb.angleDeg, ga));
      // the rule's parts, for tuning it: drawn grain vs the edge, the axis, the sheet vertical
      const ax = principalAxis(ring!);
      const ed = longestStraight(ring!);
      let per = 0;
      for (let k = 0; k < ring!.length; k++)
        per += Math.hypot(
          ring![(k + 1) % ring!.length].x - ring![k].x,
          ring![(k + 1) % ring!.length].y - ring![k].y,
        );
      grainRows.push({
        piece: `${p.identity}`,
        drawn: +((ga + 360) % 180).toFixed(1),
        rule: +fb.angleDeg.toFixed(1),
        from: fb.from,
        edge: ed ? +ed.angleDeg.toFixed(1) : null,
        edgeShare: ed ? +(ed.lenMm / per).toFixed(2) : null,
        axis: ax ? +ax.angleDeg.toFixed(1) : null,
        elong: ax ? +ax.elongation.toFixed(2) : null,
      });
    }
    errs.sort((a, b) => a - b);
    rec.grainRule = {
      n: errs.length,
      within5: errs.filter((e) => e <= 5).length,
      within15: errs.filter((e) => e <= 15).length,
      median: errs.length ? +errs[Math.floor(errs.length / 2)].toFixed(1) : null,
      rows: grainRows,
      // a DXF always carries its grain (the rule never runs there); CLO lays its blocks turned
      dxf: !!api.extracted.presegmented,
    };
  }
  rec.ms = Date.now() - T0;
  rec.peakRssMb = Math.round(process.resourceUsage().maxRSS / 1024);
  await client.close(1);
  return rec;
}

function ringOf(f: PieceFamily | undefined, mapped: Set<number> | null, rank: number) {
  if (!f) return null;
  const c =
    f.candidates.find((x) => x.rank === rank && x.outer.length > 2) ??
    f.candidates.find((x) => (!mapped || mapped.has(x.rank)) && x.outer.length > 2);
  return c?.outer ?? null;
}

/**
 * The metric's own control: a WRONG answer injected into the policy's answer. `qty` — with the
 * details step's "confirm as shown", the first truth-labelled piece's count + 1 (an operator-shaped
 * override); `size` — with the first answer on the sizes step, the first two mapped sizes swapped.
 * The metric must count it, attributed to the assumption.
 */
function mutateAnswer(
  kind: string,
  snap: AutopilotSnapshot,
  a: AutopilotAnswer,
  mutated: string[],
  c: Case,
): AutopilotAnswer {
  const s = snap.session;
  if (a.stop || mutated.length) return a;
  const withA = (
    x: Assumption[],
    patch: AutopilotAnswer['patch'],
    events: AutopilotAnswer['events'],
  ) => ({
    ...a,
    patch: {
      ...a.patch,
      ...patch,
      autopilot: [...(a.patch?.autopilot ?? snap.inputs.autopilot), ...x],
    },
    events: [...(a.events ?? []), ...(events ?? [])],
    assumptions: [...a.assumptions, ...x],
  });
  if (kind === 'qty' && s.step === 'meaning' && a.patch?.confirmedQuantities && s.semantics) {
    const seeds = [...(snap.baseSeeds ?? []), ...(s.pieces?.seeds ?? [])];
    const lab = (sd: SeedId) => seeds.find((x: Seed) => x.id === sd)?.text?.text;
    const tps = truthOf(c)?.variants[c.truth?.variant ?? 0]?.pieces ?? [];
    // only a piece TRUTH knows: elsewhere a wrong count is invisible to any metric
    const p = s.semantics.pieces.find((x) => {
      const l = lab(x.seed);
      return l && tps.some((t) => norm(t.label) === norm(l));
    });
    if (!p) return a;
    const ppg = p.piecesPerGarment + 1;
    mutated.push(`qty seed ${p.seed}: ${p.piecesPerGarment} → ${ppg}`);
    const overrides = {
      ...snap.inputs.overrides,
      [p.seed]: { ...(snap.inputs.overrides[p.seed] ?? {}), piecesPerGarment: ppg },
    };
    const x: Assumption = {
      step: 'meaning',
      kind: 'quantity',
      subject: `seed ${p.seed}${lab(p.seed) ? ` · ${lab(p.seed)}` : ''}`,
      answer: `×${ppg} (MUTATED)`,
      rule: 'mutation control',
      evidence: [],
      confidence: 0,
      strong: false,
      seed: p.seed,
    };
    return withA([x], { overrides }, [{ type: 'names', decisions: s.names }]);
  }
  if (kind === 'size' && s.step === 'sizes' && s.sizes) {
    const m = s.sizes.map.entries.filter((e) => e.card);
    if (m.length < 2) return a;
    const [x, y] = m;
    mutated.push(`size ${x.source.label}→${y.card!.token}, ${y.source.label}→${x.card!.token}`);
    const entries: SizeMapEntry[] = s.sizes.map.entries.map((e) =>
      e === x
        ? { ...e, card: y.card, origin: 'operator' }
        : e === y
          ? { ...e, card: x.card, origin: 'operator' }
          : { ...e, origin: 'operator' },
    );
    const sub = (e: SizeMapEntry) => `source ${e.source.label || `rank ${e.source.rank}`}`;
    const mk = (e: SizeMapEntry, to: string): Assumption => ({
      step: 'sizes',
      kind: 'size-guess',
      subject: sub(e),
      answer: `→ ${to} (MUTATED)`,
      rule: 'mutation control',
      evidence: [],
      confidence: 0,
      strong: false,
    });
    return withA([mk(x, y.card!.token), mk(y, x.card!.token)], {}, [{ type: 'size-map', entries }]);
  }
  return a;
}

const countBy = (xs: string[]) =>
  xs.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {});

/** "meaning:semantics ×3" for runs of the same tick. */
function compress(xs: string[]): string[] {
  const out: string[] = [];
  for (const x of xs) {
    const last = out[out.length - 1];
    const m = last?.match(/^(.*) ×(\d+)$/);
    if (last === x) out[out.length - 1] = `${x} ×2`;
    else if (m && m[1] === x) out[out.length - 1] = `${x} ×${+m[2] + 1}`;
    else out.push(x);
  }
  return out;
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === 'list') {
    console.log(JSON.stringify(CASES.map((c) => c.id)));
    return 0;
  }
  const mutate = process.env.AUTOPILOT_MUTATE || null;
  const want = args.length ? CASES.filter((c) => args.includes(c.id)) : CASES;
  for (const c of want) {
    let r: Record<string, unknown>;
    try {
      r = await runCase(c, mutate);
    } catch (e) {
      r = { id: c.id, verdict: 'crashed', error: toWireError(e).message.slice(0, 600) };
    }
    console.log(`@@RESULT ${JSON.stringify(r)}`);
  }
  return 0;
}
