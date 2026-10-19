// PATTERN-IMPORT · ARCHIVE RUNNER — one PDF of the owner's pattern archive through the REAL wizard
// hook (use-import-session.ts, React replaced by the one-component shim) over an in-process worker
// Session, the autopilot answering every question (0 clicks, no AI). Per file: reached apply /
// stopped (step + reason) / refused; pieces found and written against pieces expected (the
// passport's list, the overview's piece letters, "Cut N" lines); sizes read against the printed
// size key; gate blocks by id; the recorded assumptions. For Mood Fabrics files the written blocks
// are judged with the mood probe's truth (printed key + pen identity + monotone + no overlaps):
// wrongPassing = a block that passes the gate and is wrong.
//   node scripts/pattern-import/archive.mjs   (yarn patimport:archive) — this is its child
// The archive is READ ONLY: bytes are read once, nothing is ever written next to them.
import { mkdirSync, readFileSync, writeSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Session, type StageCtx } from 'lib/pattern-import/worker/session';
import { toWireError } from 'lib/pattern-import/worker/errors';
import { parseSizeToken } from 'lib/pattern-import/sizes/tokens';
import type {
  ChainSet,
  PieceFamily,
  Sheet,
  SizeRun,
  StageIO,
  StageName,
} from 'lib/pattern-import/types';
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
  autopilotAnswer,
  autopilotApply,
  hookDriveCtx,
  resolverFor,
  type AutopilotAnswer,
} from 'components/managers/tech-card/components/pattern-import/autopilot';
import {
  driveTick,
  newDriveState,
} from 'components/managers/tech-card/components/pattern-import/auto-drive';

// e2e-entry: the guarded pdfjs loader (side effect) and the card id
import { CARD_ID } from './e2e-entry';
import { cardSizes, SCOPES } from './autopilot-entry';
import { analyse as moodAnalyse } from './mood-entry';
import { mountHook, rerender } from './react-hook-shim';
import { PALETTE, renderPng, type Label, type Stroke } from './sizes-render';
import {
  dartOf,
  provenCopy,
  rimTolMm,
  weakAsides,
} from 'components/managers/tech-card/components/pattern-import/auto-advance';
import { pointInPoly } from 'lib/pattern-import/pieces/geom';
import type { SetAside, Seed, PtMm } from 'lib/pattern-import/types';
import { seedLabel } from 'lib/pattern-import/pieces/seeds';
import { leakDiag } from './leak-diag';
import { famRender, leaks2Diag } from './leaks2-diag';
import { sizesepDump } from './sizesep-dump';
import { gfitArchive } from './gfit-archive';
import { classifyFeatures } from 'lib/pattern-import/semantics/features';
import { provenDarts } from 'lib/pattern-import/pieces/darts';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
export const ARCHIVE_DIR =
  process.env.PATIMPORT_ARCHIVE_DIR ?? '/Users/jekabolt/Downloads/archive 600 pcs';

/**
 * The neutral card: no name, no style, no model, no sheet — only sizes, every spelling the archive
 * prints that a card would carry: the letter run XXS–5XL and the US / EU numeric run 00–60.
 * (Paired sizes «0/2», «00-0» are not card sizes; the autopilot maps or asks as it would.)
 */
const NUMS = ['00', '0', ...Array.from({ length: 30 }, (_, i) => String(2 + 2 * i))];
export const NEUTRAL_CARD = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', ...NUMS];
/** Mood's old (G0) paired key — no "Size Line Key"; the mood probe judges with these labels. */
const G0_KEY = ['0/2', '4/6', '8/10', '12/14', '16/18', '20/22', '24/26', '28/30'];

// ── the document's own text (pdfjs, independent of the session) ──────────────────────────────

type DocText = {
  pages: number;
  /** "Size Line Key" labels (the fullscan reading: the word after SIZE that is not LINE). */
  key: string[] | null;
  keyPage: number | null;
  /** Overview piece letters ("A - FRONT"). */
  letters: string[];
  /** Lines naming a cut count ("Cut 2", "Cut 1 on fold"). */
  cutLines: number;
  error?: string;
};

const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;

async function docText(bytes: Uint8Array): Promise<DocText> {
  const out: DocText = { pages: 0, key: null, keyPage: null, letters: [], cutLines: 0 };
  try {
    const pdfjs = (await import(LEGACY)) as {
      getDocument: (o: Record<string, unknown>) => { promise: Promise<PdfDoc> };
    };
    type PdfDoc = {
      numPages: number;
      getPage: (n: number) => Promise<{
        getTextContent: () => Promise<{ items: { str?: string; hasEOL?: boolean }[] }>;
        cleanup: () => void;
      }>;
      destroy: () => Promise<void>;
    };
    const doc = await pdfjs.getDocument({
      data: bytes.slice(),
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
    out.pages = doc.numPages;
    const letters = new Set<string>();
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n);
      const tc = await pg.getTextContent();
      const lines: string[] = [];
      let cur = '';
      const words: string[] = [];
      for (const it of tc.items) {
        const s = it.str ?? '';
        cur += s;
        words.push(...s.split(/\s+/).filter(Boolean));
        if (it.hasEOL) {
          lines.push(cur);
          cur = '';
        } else if (s && !/\s$/.test(s)) cur += ' ';
      }
      if (cur.trim()) lines.push(cur);
      for (const l of lines) {
        const t = l.trim().replace(/\s+/g, ' ');
        const m = /^([A-Z])\s*[-–—]\s+\S/.exec(t);
        if (m) letters.add(m[1]);
        if (/\bcut\s+\d+\b/i.test(t)) out.cutLines++;
      }
      if (out.key == null && n <= 8 && /size\s*line\s*key/i.test(lines.join(' '))) {
        const labs: string[] = [];
        for (let k = 0; k < words.length - 1; k++)
          if (words[k].toUpperCase() === 'SIZE' && words[k + 1].toUpperCase() !== 'LINE')
            labs.push(words[k + 1]);
        out.key = [...new Set(labs)];
        out.keyPage = n;
      }
      pg.cleanup();
    }
    out.letters = [...letters].sort();
    await doc.destroy();
  } catch (e) {
    out.error = String((e as Error)?.message ?? e).slice(0, 200);
  }
  return out;
}

/** The size labels of a printed key, in size order (junk words such as TAPE left out). */
function keyLabels(key: string[] | null): string[] {
  if (!key) return [];
  const toks = key
    .map((l) => ({ l: l.toUpperCase(), t: parseSizeToken(l, true) }))
    .filter((x) => x.t);
  return toks
    .sort((a, b) =>
      a.t!.kind === b.t!.kind ? a.t!.value - b.t!.value : a.t!.kind === 'num' ? -1 : 1,
    )
    .map((x) => x.l);
}

/** Mood generation (MOOD-DIAG §1.1): G1 numeric 00–32 key, G2 letter key, G2p paired, G0 no key. */
export function moodGen(file: string, key: string[] | null): string | null {
  if (!/^(mdf|moodfabrics)/i.test(file)) return null;
  const labs = keyLabels(key);
  if (!key) {
    // the old generation (MDF0xx–2xx, «MoodFabrics.com-…-Pattern.pdf») draws no key; a new file
    // without one is a one-size piece (a bag, a mask) — not G0
    const n = /^(?:moodfabrics\.com-)?mdf0*(\d+)/i.exec(file);
    return (n ? +n[1] < 300 : /^moodfabrics\.com-/i.test(file)) ? 'G0' : 'no-key';
  }
  if (!labs.length) return 'other-key';
  const pairs = labs.filter((l) => /^\d+\s*[-/]\s*\d+$/.test(l)).length;
  const nums = labs.filter((l) => /^\d+$/.test(l)).length;
  const lets = labs.length - pairs - nums;
  if (pairs && !nums && !lets) return 'G2p';
  if (nums && lets) return 'mixed';
  if (nums) return 'G1';
  if (lets) return 'G2';
  return 'other-key';
}

// ── the session behind the wizard's client seam (the Session itself kept for the judging) ────

function sessionClient() {
  const box: { s: Session | null } = { s: null };
  const outs: Partial<Record<StageName, unknown>> = {};
  const ctx: StageCtx = { checkCancel: () => {}, progress: () => {} };
  const client: ImportClient = {
    kind: 'worker',
    async open(files) {
      box.s?.close();
      box.s = new Session(1, files);
      return { sessionId: 1, files: box.s.files };
    },
    async run(_id, stage, input) {
      if (!box.s) throw new Error('no session');
      if (stage === 'render-som') return { sheetPng: new Blob([]), crops: [], marks: [] } as never;
      if (stage === 'render-pages')
        return (await box.s.runStage(
          stage,
          { ...(input as StageIO['render-pages']['in']), pictures: false },
          ctx,
        )) as never;
      const out = await box.s.runStage(stage, input as never, ctx);
      outs[stage] = out;
      return out as never;
    },
    cancel() {},
    async close() {
      box.s?.close();
      box.s = null;
    },
    alive: () => true,
  };
  return { client, outs, box };
}

const countBy = (xs: string[]) =>
  xs.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {});

/** "pieces:answer ×3" for runs of the same tick. */
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

type Stop = { step: string; reason: string; why?: string };

/** The size labels an earlier run read on this file (ARCHIVE_CARD_READ), null when any is blank. */
function readSizesOf(rel: string): string[] | null {
  const p = process.env.ARCHIVE_CARD_READ;
  if (!p) return null;
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    if (!l.includes(JSON.stringify(rel))) continue;
    const r = JSON.parse(l) as { id: string; sizesRead?: { labels?: string[] } | null };
    if (r.id !== rel) continue;
    const labs = r.sizesRead?.labels ?? [];
    return labs.length && labs.every((x) => x.trim()) ? labs : null;
  }
  return null;
}

// ── one file ───────────────────────────────────────────────────────────────────────────────

export async function runFile(rel: string): Promise<Record<string, unknown>> {
  const T0 = Date.now();
  const path = resolve(ARCHIVE_DIR, rel);
  const file = basename(rel);
  const rec: Record<string, unknown> = {
    id: rel,
    cat: dirname(rel),
    file,
    mood: /^(mdf|moodfabrics)/i.test(file),
  };
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (e) {
    return { ...rec, verdict: 'crashed', error: `read: ${String(e)}` };
  }
  rec.bytes = bytes.byteLength;
  const text = await docText(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  const printedKey = keyLabels(text.key);
  const gen = moodGen(file, text.key);
  Object.assign(rec, {
    gen,
    pages: text.pages,
    printedKey: text.key ? printedKey : null,
    keyPage: text.keyPage,
    letters: text.letters,
    cutLines: text.cutLines,
    ...(text.error ? { textError: text.error } : {}),
  });

  // ARCHIVE_CARD=sheet — the matching card: the card carries exactly the sizes the sheet prints (its
  // Size Line Key; Mood's old G0 paired run), so the size map is what an operator's matching card
  // gives and the run shows how far the file gets once sizes are mapped. A file with no printed
  // key (and not G0) keeps the neutral card.
  // ARCHIVE_CARD=read (+ ARCHIVE_CARD_READ=<an earlier results.jsonl>): the card carries the sizes the
  // wizard READ on this sheet in that run, when every one is labelled — for the G0 files that print
  // a plain 2…22 run rather than the paired key, and the mixed keys read by their letter column.
  const own = gen === 'G0' ? G0_KEY : printedKey;
  const read = process.env.ARCHIVE_CARD === 'read' ? readSizesOf(rel) : null;
  const ownSizes = read ?? own;
  const matching = /^(sheet|read)$/.test(process.env.ARCHIVE_CARD ?? '') && ownSizes.length > 0;
  rec.card = matching ? { kind: read ? 'read' : 'sheet', sizes: ownSizes } : { kind: 'neutral' };
  const card: CardContext = {
    techCardId: CARD_ID,
    sizes: cardSizes(matching ? ownSizes : NEUTRAL_CARD),
    scopes: SCOPES,
    existingPieces: [],
    styleLabel: 'archive',
  };
  const { client, outs, box } = sessionClient();
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
  // The page-role question of the files step ("set aside as instructions but holds line work —
  // is it a pattern page?") has no answer headless (A9's AI page roles are a paid call): the FIRST
  // stop is recorded as the strict verdict, then it is answered the way clean suggested (the page
  // stays aside) to see how far the rest goes. ARCHIVE_PAGE_PASS=0 switches that off.
  const pagePass = process.env.ARCHIVE_PAGE_PASS !== '0';
  const pageAnswers: string[] = [];
  const answerOf = (snap: Parameters<ReturnType<typeof resolverFor>>[0]): AutopilotAnswer => {
    const a = autopilotAnswer({
      ...snap,
      card: api.runCard,
      baseSeeds: api.baseSeeds,
      presegmented: !!api.extracted.presegmented,
    } as never);
    if (
      pagePass &&
      a.stop &&
      a.reason?.step === 'files' &&
      /is it a pattern page\?/.test(a.reason.reason)
    ) {
      pageAnswers.push(a.reason.reason.slice(0, 300));
      return { proceed: true, assumptions: [] };
    }
    return a;
  };
  const st = newDriveState();
  let done: null | { ok: true } | { ok: false; stop: Stop } = null;
  const trace: string[] = [];
  let ticks = 0;
  try {
    await api.dispatch({ type: 'files', files: [new File([bytes], file)] });
    await settle();
    for (let t = 0; t < 400 && !done; t++) {
      ticks++;
      const step = api.session.step;
      const r = await driveTick(
        st,
        hookDriveCtx(() => api, settle, answerOf),
      );
      await settle();
      trace.push(
        `${step}:${r.kind === 'answered' ? 'answer' : r.kind === 'moved' ? 'next' : r.kind}`,
      );
      if (r.kind !== 'stopped') continue;
      if (r.why === 'auto-stop' && api.session.step === 'check') {
        const o = await autopilotApply(() => api, card, settle);
        trace.push(o.ok ? 'apply:done' : `${o.step}:stop`);
        done = o.ok
          ? { ok: true }
          : { ok: false, stop: { step: o.step, reason: o.reason, why: 'apply' } };
      } else
        done = {
          ok: false,
          stop: { step: r.step, reason: `${r.why}: ${r.reason ?? r.question ?? ''}`, why: r.why },
        };
    }
  } catch (e) {
    rec.error = toWireError(e).message.slice(0, 600);
  }
  const s = api.session;
  rec.trace = compress(trace).slice(-40);
  rec.ticks = ticks;
  if (pageAnswers.length) rec.pageRoleAnswers = pageAnswers;
  // verdict: refused = the files step refused the file itself (format, encryption, no vector)
  if (done?.ok) rec.verdict = 'apply';
  else if (rec.error) rec.verdict = 'crashed';
  else {
    const stop: Stop = done && !done.ok ? done.stop : { step: s.step, reason: 'tick budget spent' };
    rec.stop = stop;
    // what the session held when it stopped (an error or a notice the stop's words may not carry)
    if (s.error) rec.sessionError = String(s.error).slice(0, 300);
    if (api.notice) rec.notice = String(api.notice).slice(0, 300);
    rec.verdict = stop.step === 'files' && stop.why === 'error' ? 'refused' : 'stopped';
  }
  // strict = without the page-role pass: the first page-role question is where it stops
  rec.strictVerdict = pageAnswers.length ? 'stopped' : rec.verdict;
  if (pageAnswers.length) rec.strictStop = { step: 'files', reason: pageAnswers[0] };

  // what the session read
  rec.pageClasses = countBy(s.pages.map((p) => p.cls));
  rec.setAsidePages = (s.clean?.dropped ?? []).length;
  rec.sizesRead = s.sizes
    ? {
        labels: s.sizes.run.sizes.map((x) => x.label),
        encoding: (s.sizes as { encoding?: string }).encoding ?? null,
        expected: s.sizes.expected ?? null,
        map: s.sizes.map.entries.map((e) => `${e.source.label || '∅'}→${e.card?.token ?? '—'}`),
        // the matches the automatic map made itself (not an answer, not an assumption)
        auto: s.sizes.map.entries
          .filter((e) => e.origin === 'auto' && e.card)
          .map((e) => `${e.source.label || '∅'}→${e.card!.token}@${e.confidence ?? 1}`),
      }
    : null;
  if (printedKey.length && s.sizes) {
    const canon = (x: string) => x.toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
    const read = new Set(s.sizes.run.sizes.map((x) => canon(x.label)));
    rec.keyMatch = {
      printed: printedKey.length,
      read: read.size,
      found: printedKey.filter((l) => read.has(canon(l))).length,
      extra: [...read].filter((l) => !printedKey.map(canon).includes(l)).slice(0, 10),
    };
  }
  const S = box.s as unknown as {
    passport: { pieces: unknown[] } | null;
    families: PieceFamily[] | null;
    sheet: Sheet | null;
    chains: ChainSet | null;
    wallSet: ChainSet | null;
  } | null;
  const fams = S?.families ?? s.pieces?.families ?? [];
  const outcomes = countBy(fams.flatMap((f) => f.candidates.map((c) => c.outcome)));
  rec.pieces = {
    expectedPassport: S?.passport?.pieces?.length ?? null,
    expectedLetters: text.letters.length || null,
    seeds: s.pieces?.seeds.length ?? null,
    /** seed → label: outcome counts (the families as filled) */
    seedNames: (s.pieces?.seeds ?? []).map((x) => {
      const f = fams.find((y) => y.seed === x.id);
      const o = f ? countBy(f.candidates.map((c) => c.outcome)) : null;
      return `${x.id}:${x.origin}:${(seedLabel(x) ?? '').slice(0, 24)}${o ? ` ${JSON.stringify(o)}` : ' -'}`;
    }),
    // ARCHIVE_FAMS=1: each family's sizes — rank, outcome, area cm², seed point
    ...(process.env.ARCHIVE_FAMS
      ? {
          fams: fams.map((f) => ({
            seed: f.seed,
            at: (s.pieces?.seeds ?? []).find((x) => x.id === f.seed)?.at,
            c: f.candidates.map((c) => `${c.rank}:${c.outcome}:${Math.round(c.areaMm2 / 100)}`),
          })),
        }
      : {}),
    families: fams.length,
    /** Families whose every size closes / with a leak / with a refused (held back) size. */
    familiesClosed: fams.filter(
      (f) => f.candidates.length && f.candidates.every((c) => c.outcome === 'closed'),
    ).length,
    familiesLeak: fams.filter((f) => f.candidates.some((c) => c.outcome === 'leak')).length,
    familiesRefused: fams.filter((f) => f.candidates.some((c) => c.outcome === 'refused')).length,
    candidates: outcomes,
    /** GRADE P2: sizes repaired from the grade (by kind), and refused sizes carrying a grade hint */
    repaired: countBy(
      fams.flatMap((f) =>
        f.candidates.filter((c) => c.rankFrom === 'repair').map((c) => c.repair?.kind ?? '?'),
      ),
    ),
    familiesRepaired: fams.filter((f) => f.candidates.some((c) => c.rankFrom === 'repair')).length,
    gradeHints: countBy(
      fams.flatMap((f) =>
        f.candidates.filter((c) => c.gradeHint).flatMap((c) => c.gradeHint!.refusals.slice(0, 3)),
      ),
    ),
    setAside: (s.pieces?.setAside ?? []).length,
    /** held text seeds: label → the junk its outline was read as */
    heldText: (s.pieces?.setAside ?? [])
      .filter((a) => a.seed)
      .map((a) => `${(a.seed && seedLabel(a.seed)) ?? '?'}:${a.reason}:${a.areaMm2}`),
    named: s.semantics?.pieces.length ?? null,
  };
  // ARCHIVE_GRADEP2_PNG=<dir> (GRADE P2): a picture of every size the repair rebuilt
  const p2dir = process.env.ARCHIVE_GRADEP2_PNG;
  if (p2dir && S) {
    try {
      const labels =
        (box.s as unknown as { run: SizeRun | null }).run?.sizes.map((z) => z.label) ?? [];
      for (const f of fams)
        for (const c of f.candidates)
          if (c.gradeHint && process.env.ARCHIVE_GRADEP2_HINTS)
            renderHintPng(
              resolve(
                p2dir,
                `hint-${rel.replace(/[^\w.-]+/g, '_').slice(0, 60)}-seed${f.seed}-r${c.rank}.png`,
              ),
              rel,
              f,
              c,
              S.wallSet ?? S.chains,
              labels,
            );
          else if (c.rankFrom === 'repair' && c.repair)
            renderRepairPng(
              resolve(
                p2dir,
                `${rel.replace(/[^\w.-]+/g, '_').slice(0, 60)}-seed${f.seed}-r${c.rank}.png`,
              ),
              rel,
              f,
              c,
              S.wallSet ?? S.chains,
              labels,
            );
    } catch (e) {
      rec.gradep2PngError = String((e as Error)?.stack ?? e).slice(0, 400);
    }
  }
  // ARCHIVE_PERSIZE=1 (GRADE P0): per family per size how it closes today + the gfit grade check
  // (gfit-archive.ts); ARCHIVE_GFIT_PNG=<dir> a picture of each family the check flags
  // (ARCHIVE_GFIT_PNG_ALL=1: of every family)
  if (process.env.ARCHIVE_PERSIZE && S) {
    const tg = Date.now();
    try {
      const pd = process.env.ARCHIVE_GFIT_PNG;
      rec.gfit = gfitArchive({
        families: fams,
        seeds: s.pieces?.seeds ?? [],
        run: (box.s as unknown as { run: SizeRun | null }).run,
        set: S.wallSet ?? S.chains,
        sheet: S.sheet,
        key: gen === 'G0' ? G0_KEY : printedKey,
        raw: S.chains,
        ...(pd
          ? {
              png: {
                dir: pd,
                prefix: rel.replace(/[^\w.-]+/g, '_').slice(0, 60),
                all: !!process.env.ARCHIVE_GFIT_PNG_ALL,
              },
            }
          : {}),
      });
    } catch (e) {
      rec.gfitError = String((e as Error)?.stack ?? e).slice(0, 400);
    }
    rec.gfitMs = Date.now() - tg;
  }
  // the written files
  const wr = outs.write as StageIO['write']['out'] | undefined;
  if (wr) {
    const ids = new Set<string>();
    for (const sc of wr.scopes)
      for (const b of sc.manifest.blocks) ids.add(b.identity.replace(/^LIN_/, ''));
    rec.write = {
      scopes: wr.scopes.map((sc) => {
        const g = wr.gate[sc.target.scopeKey];
        return {
          scope: sc.target.label,
          passed: !!g?.passed,
          blocks: sc.manifest.blocks.length,
          pieces: new Set(sc.manifest.blocks.map((b) => b.identity)).size,
          sizes: sc.manifest.sizes.map((z) => `${z.sourceLabel ?? ''}→${z.token}`),
        };
      }),
      piecesWritten: ids.size,
      gateBlocks: [
        ...new Set(
          wr.scopes.flatMap((sc) =>
            (wr.gate[sc.target.scopeKey]?.checks ?? [])
              .filter((k) => !k.ok && k.severity === 'block')
              .map((k) => k.id),
          ),
        ),
      ],
      passed: wr.scopes.every((sc) => !!wr.gate[sc.target.scopeKey]?.passed),
    };
    // the mood probe's truth on the written blocks (Mood files)
    if (rec.mood && box.s) {
      const key = gen === 'G0' ? G0_KEY : printedKey;
      try {
        const m = moodAnalyse({ id: rel, gen: gen ?? '', path: rel, key }, box.s, wr) as Record<
          string,
          unknown
        >;
        rec.judge = {
          key: key.length,
          keyRead: m.keyRead,
          keyWithPen: m.keyWithPen,
          blocks: m.blocks,
          passing: m.passing,
          passingRight: m.passingRight,
          passingUnverified: m.passingUnverified,
          wrongPassing: m.wrongPassing,
          wrongBlocked: m.wrongBlocked,
          unmatched: m.unmatched,
          rightBlockedBy: m.rightBlockedBy,
          wrongList: m.wrongList,
        };
        rec.wrongPassing = m.wrongPassing;
        rec.wrongApplied = rec.verdict === 'apply' ? m.wrongPassing : 0;
      } catch (e) {
        rec.judge = { error: String((e as Error)?.stack ?? e).slice(0, 400) };
      }
    }
  }
  // the assumptions the run recorded
  const as = api.inputs.autopilot;
  rec.assumptions = {
    total: as.length,
    strong: as.filter((a) => a.strong).length,
    byKind: countBy(as.map((a) => a.kind)),
    strongByKind: countBy(as.filter((a) => a.strong).map((a) => a.kind)),
    list: as
      .slice(0, 30)
      .map((a) => `${a.strong ? '!' : ' '}${a.kind} · ${a.subject} → ${a.answer}`),
  };
  // ARCHIVE_WEAK=1: each piece-sized aside set aside on a guess, and which proof of provenCopy failed
  if (process.env.ARCHIVE_WEAK && s.pieces) {
    const weak = weakAsides(s.pieces.setAside, s.pieces.families, s.pieces.seeds);
    rec.weak = weak.map((a) =>
      diagnoseAside(a, s.pieces!.families, s.pieces!.seeds, S?.sheet?.texts ?? []),
    );
    // DARTS: does the host export the dart's legs as internal lines (layer 8)? per closed size:
    // internal features with a point within 4 mm of the dart's point
    const fset = S?.wallSet ?? S?.chains;
    const nearPt = (pts: readonly PtMm[], q: PtMm, r: number) =>
      pts.some((p, i) => {
        const b = pts[i + 1] ?? p;
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const L = dx * dx + dy * dy;
        const u = L ? Math.max(0, Math.min(1, ((q.x - p.x) * dx + (q.y - p.y) * dy) / L)) : 0;
        return Math.hypot(p.x + u * dx - q.x, p.y + u * dy - q.y) <= r;
      });
    if (fset && S?.sheet)
      weak.forEach((a, i) => {
        const d = a.dart;
        const r = (rec.weak as Record<string, unknown>[])[i];
        const dd = r.dartDiag as { hostSeed?: number | null } | undefined;
        const hs = r.fail === 'dart' ? (r.hostSeed as number | undefined) : dd?.hostSeed;
        const seedId =
          hs ??
          s.pieces!.seeds.find(
            (x) =>
              d?.host && Math.abs(x.at.x - d.host.x) < 0.01 && Math.abs(x.at.y - d.host.y) < 0.01,
          )?.id;
        if (!d || seedId == null) return;
        const fam = s.pieces!.families.find((f) => f.seed === seedId);
        r.l8 = (fam?.candidates ?? [])
          .filter((c) => c.outcome === 'closed' && c.outer.length > 2)
          .map((c) => {
            const darts = provenDarts([a], s.pieces!.families, s.pieces!.seeds);
            const fs = classifyFeatures(c, fset, S.sheet!, darts.length ? { darts } : {});
            const legs = fs.filter((f) => f.kind === 'internal' && f.label === 'dart');
            return {
              r: c.rank,
              legs: legs.length,
              internal: fs.filter((f) => f.kind === 'internal').length,
            };
          });
      });
    // ARCHIVE_CROPS=<dir>: a close-up PNG of each (the host's sizes in colour, its rim dotted)
    if (process.env.ARCHIVE_CROPS && S) {
      const set = S.wallSet ?? S.chains;
      weak.forEach((a, i) => {
        const d = (rec.weak as Record<string, unknown>[])[i];
        const fam = s.pieces!.families.find((f) => f.seed === d.hostSeed);
        const m = 40;
        const box = {
          minX: a.box.minX - m,
          minY: a.box.minY - m,
          maxX: a.box.maxX + m,
          maxY: a.box.maxY + m,
        };
        const strokes: Stroke[] = [];
        for (const c of set?.chains ?? [])
          if (c.pts.length > 1)
            strokes.push({ pts: c.pts, closed: !!c.closed, color: '#bbbbbb', width: 1 });
        for (const c of fam?.candidates ?? [])
          if (c.outer.length > 2)
            strokes.push({
              pts: c.outer,
              closed: true,
              color: PALETTE[c.rank % PALETTE.length],
              width: 1.5,
            });
        for (const p of a.copy?.rim ?? [])
          strokes.push({
            pts: [
              { x: p.x - 0.8, y: p.y },
              { x: p.x + 0.8, y: p.y },
            ],
            closed: false,
            color: '#000',
            width: 3,
          });
        for (const p of (d.off as PtMm[] | undefined) ?? [])
          strokes.push({
            pts: [
              { x: p.x - 1.5, y: p.y },
              { x: p.x + 1.5, y: p.y },
            ],
            closed: false,
            color: '#ff0000',
            width: 6,
          });
        const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
        const name = `${rel.replace(/[^\w.-]+/g, '_').slice(0, 60)}__${i}_${d.how}_${d.fail}.png`;
        try {
          renderPng(
            resolve(process.env.ARCHIVE_CROPS!, name),
            box,
            strokes,
            [
              {
                at: { x: box.minX + 2, y: box.maxY - 4 },
                text: `${d.how}/${d.fail} ${d.area}mm² clr ${d.clearMm} in ${d.inside} rim ${d.rimShare}% ${((d.texts as string[]) ?? []).join(' ').slice(0, 50)}`,
                color: '#000',
                size: 12,
              },
            ],
            Math.min(8, 900 / span),
          );
        } catch {
          /* a crop is a diagnostic only */
        }
      });
    }
  }
  // ARCHIVE_LEAKS=<dir>: every leaking size × piece classified at its mouth (+ close-ups there)
  if (process.env.ARCHIVE_LEAKS && S) {
    try {
      const names = new Map((s.pieces?.seeds ?? []).map((x) => [x.id, seedLabel(x) ?? '']));
      rec.leaks = leakDiag(
        rel,
        {
          ...S,
          run: (box.s as unknown as { run: SizeRun | null }).run,
          contRefused: (
            box.s as unknown as {
              pieceSession: {
                diag?: { continuity?: { refused: { seed: number; rank: number; why: string }[] } };
              } | null;
            }
          ).pieceSession?.diag?.continuity?.refused,
        },
        names,
        process.env.ARCHIVE_LEAKS === '1' ? null : process.env.ARCHIVE_LEAKS,
        Number(process.env.ARCHIVE_LEAKS_PNG ?? 6),
      );
      rec.leaksAside = (rec.leaks as { aside?: unknown }).aside;
    } catch (e) {
      rec.leaksError = String((e as Error)?.stack ?? e).slice(0, 400);
    }
  }
  // ARCHIVE_MASKPENS (LEAKS-2): the sheet's masked paths by kind and pen
  if (process.env.ARCHIVE_MASKPENS && S?.sheet) {
    const st = new Map(S.sheet.styles.map((x) => [x.id, x]));
    const m: Record<string, number> = {};
    for (const p of S.sheet.paths)
      if (p.background) {
        const x = st.get(p.style);
        const k = `${p.background}/${(x?.strokeRgb ?? []).join(',')}${x?.fill ? 'f' : ''}`;
        m[k] = (m[k] ?? 0) + 1;
      }
    rec.maskPens = m;
  }
  // ARCHIVE_MASKPENS (LEAKS-2): closed sizes of a family sharing ONE outline (the same area within
  // 0.3 % and bbox within 1 mm as another closed size) — a size closed on another size's line
  if (process.env.ARCHIVE_MASKPENS && S?.families) {
    const dup: Record<number, number> = {};
    for (const f of S.families) {
      const cl = f.candidates.filter((c) => c.outcome === 'closed' && c.outer.length > 2);
      let n = 0;
      cl.forEach((c, i) => {
        if (
          cl.some(
            (o, j) =>
              j !== i &&
              Math.abs(o.areaMm2 - c.areaMm2) <= 0.003 * Math.max(o.areaMm2, c.areaMm2) &&
              Math.abs(o.bbox.minX - c.bbox.minX) <= 1 &&
              Math.abs(o.bbox.maxX - c.bbox.maxX) <= 1 &&
              Math.abs(o.bbox.minY - c.bbox.minY) <= 1 &&
              Math.abs(o.bbox.maxY - c.bbox.maxY) <= 1,
          )
        )
          n++;
      });
      if (n) dup[f.seed] = n;
    }
    rec.dupClosed = dup;
  }
  // ARCHIVE_FAMPNG=<dir> + ARCHIVE_FAMPNG_PICK=<json {rel: [seed…]}> (LEAKS-2): whole families for
  // a before/after judgement by eye; ARCHIVE_FAMPNG_TAG names the side
  if (process.env.ARCHIVE_FAMPNG && process.env.ARCHIVE_FAMPNG_PICK && S) {
    const pick = (
      JSON.parse(readFileSync(process.env.ARCHIVE_FAMPNG_PICK, 'utf8')) as Record<string, number[]>
    )[rel];
    if (pick?.length)
      try {
        rec.famPng = famRender(
          rel,
          { ...S, run: (box.s as unknown as { run: SizeRun | null }).run },
          new Set(pick),
          process.env.ARCHIVE_FAMPNG,
          process.env.ARCHIVE_FAMPNG_TAG ?? 'x',
        );
      } catch (e) {
        rec.famPngError = String(e).slice(0, 200);
      }
  }
  // ARCHIVE_LEAKS2=<dir> (LEAKS-2): why each leaking size has no line of its own where its grade
  // puts it (+ ARCHIVE_LEAKS2_PNG=N close-ups over the PDF page)
  if (process.env.ARCHIVE_LEAKS2 && S) {
    try {
      const names = new Map((s.pieces?.seeds ?? []).map((x) => [x.id, seedLabel(x) ?? '']));
      const n = Number(process.env.ARCHIVE_LEAKS2_PNG ?? 0);
      rec.leaks2 = leaks2Diag(
        rel,
        { ...S, run: (box.s as unknown as { run: SizeRun | null }).run },
        names,
        n > 0
          ? {
              dir: process.env.ARCHIVE_LEAKS2,
              max: n,
              pdf: resolve(ARCHIVE_DIR, rel),
              ...(process.env.ARCHIVE_LEAKS2_PICK
                ? {
                    pick: new Set<string>(
                      (
                        JSON.parse(readFileSync(process.env.ARCHIVE_LEAKS2_PICK, 'utf8')) as Record<
                          string,
                          string[]
                        >
                      )[rel] ?? [],
                    ),
                  }
                : {}),
            }
          : null,
      );
    } catch (e) {
      rec.leaks2Error = String((e as Error)?.stack ?? e).slice(0, 400);
    }
  }
  // ARCHIVE_SIZESEP=<dir> (SIZESEP): the sheet's paths, chains, rows and candidates for the
  // engine-vs-key size pictures (scripts/pattern-import/sizesep-dump.ts)
  if (process.env.ARCHIVE_SIZESEP && S) {
    try {
      rec.sizesep = sizesepDump(
        rel,
        { ...S, run: (box.s as unknown as { run: SizeRun | null }).run },
        process.env.ARCHIVE_SIZESEP,
      );
    } catch (e) {
      rec.sizesepError = String((e as Error)?.stack ?? e).slice(0, 400);
    }
  }
  if (process.env.ARCHIVE_PNG && S) {
    try {
      rec.png = renderSheet(S as never, process.env.ARCHIVE_PNG, rec);
    } catch (e) {
      rec.pngError = String(e).slice(0, 200);
    }
  }
  rec.ms = Date.now() - T0;
  rec.peakRssMb = Math.round(process.resourceUsage().maxRSS / 1024);
  await client.close(1);
  return rec;
}

type BoxMm2 = { minX: number; minY: number; maxX: number; maxY: number };
/** Why provenCopy did not prove an aside (probe diagnostics; mirrors its steps). */
function diagnoseAside(
  a: SetAside,
  families: PieceFamily[],
  seeds: Seed[],
  texts: { text: string; bbox: { minX: number; minY: number; maxX: number; maxY: number } }[],
): Record<string, unknown> {
  const c = a.copy;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const out: Record<string, unknown> = {
    id: a.id,
    reason: a.reason,
    at: { x: r1(a.at.x), y: r1(a.at.y) },
    box: a.box,
    area: Math.round(a.areaMm2),
    how: c?.how ?? null,
    clearMm: c?.clearMm ?? null,
    host: c?.host ?? null,
  };
  const inBox = (p: PtMm, b: typeof a.box) =>
    p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
  out.texts = texts
    .filter((t) =>
      inBox({ x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 }, a.box),
    )
    .map((t) => t.text)
    .filter((t) => t.trim())
    .slice(0, 12);
  const closed = (f: PieceFamily) =>
    f.candidates.filter((x) => x.outcome === 'closed' && x.outer.length > 2);
  // the families whose closed outlines hold the aside's point
  out.holders = families
    .map((f) => ({
      seed: f.seed,
      n: closed(f).length,
      in: closed(f).filter((x) => pointInPoly(a.at, x.outer)).length,
    }))
    .filter((x) => x.in > 0);
  // DARTS: the face pass's dart account, and whether it is proven a dart of its piece
  if (a.dart) {
    out.dart = a.dart;
    const ev = dartOf(a, families, seeds);
    if (ev) return { ...out, fail: 'dart', dartEv: ev };
    const d = a.dart;
    const hs = d.host
      ? seeds.find(
          (x) => Math.abs(x.at.x - d.host!.x) < 0.01 && Math.abs(x.at.y - d.host!.y) < 0.01,
        )
      : undefined;
    const hf = hs ? families.find((f) => f.seed === hs.id) : undefined;
    const segD = (p: PtMm, q: readonly PtMm[]) => {
      let m = Infinity;
      for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
        const A = q[j];
        const B = q[i];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const L = dx * dx + dy * dy;
        const u = L ? Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / L)) : 0;
        m = Math.min(m, Math.hypot(A.x + u * dx - p.x, A.y + u * dy - p.y));
      }
      return Math.round(m * 10) / 10;
    };
    const mid = { x: (d.base[0].x + d.base[1].x) / 2, y: (d.base[0].y + d.base[1].y) / 2 };
    out.dartDiag = {
      hostSeed: hs?.id ?? null,
      sizes: (hf?.candidates ?? [])
        .filter((x) => x.outcome === 'closed' && x.outer.length > 2)
        .map((x) => ({
          r: x.rank,
          // rim samples within 2.5 cells of this outline: how many, and their place along the axis
          on: (() => {
            const ax = { x: mid.x - d.apex.x, y: mid.y - d.apex.y };
            const L2 = ax.x * ax.x + ax.y * ax.y || 1;
            const tol = Math.max(1.5, 2.5 * d.cellMm);
            return d.rim
              .filter((p) => segD(p, x.outer) <= tol)
              .map(
                (p) =>
                  Math.round((((p.x - d.apex.x) * ax.x + (p.y - d.apex.y) * ax.y) / L2) * 100) /
                  100,
              );
          })(),
          b0: segD(d.base[0], x.outer),
          b1: segD(d.base[1], x.outer),
          m: segD(mid, x.outer),
          ap: segD(d.apex, x.outer),
          apIn: pointInPoly(d.apex, x.outer),
        })),
      // the families whose closed outlines hold the point
      apexIn: families
        .filter((f) =>
          f.candidates.some((x) => x.outcome === 'closed' && pointInPoly(d.apex, x.outer)),
        )
        .map((f) => f.seed),
    };
  }
  if (!c) return { ...out, fail: 'no-account' };
  if (c.ownLabel) return { ...out, fail: 'own-label', ownLabel: c.ownLabel };
  if (a.reason !== 'size-copy') return { ...out, fail: `weak-reason:${a.reason}` };
  const h = c.host;
  if (!h) return { ...out, fail: 'no-host' };
  const sd = seeds.find((x) => Math.abs(x.at.x - h.x) < 0.01 && Math.abs(x.at.y - h.y) < 0.01);
  if (!sd) {
    const near = seeds
      .map((x) => ({ id: x.id, d: Math.hypot(x.at.x - h.x, x.at.y - h.y), o: x.origin }))
      .sort((p, q) => p.d - q.d)[0];
    return { ...out, fail: 'host-seed-missing', nearestSeed: near };
  }
  const fam = families.find((f) => f.seed === sd.id);
  if (!fam) return { ...out, fail: 'host-no-family', seed: sd.id };
  const sizes = closed(fam);
  out.hostSeed = sd.id;
  out.hostOutcomes = countBy(fam.candidates.map((x) => x.outcome));
  if (!sizes.length) return { ...out, fail: 'host-not-closed' };
  if (c.how === 'shape') return { ...out, fail: 'shape?!' };
  if (sizes.length < 2) return { ...out, fail: 'host-<2-sizes' };
  if (!c.rim?.length) return { ...out, fail: 'no-rim' };
  const inside = sizes.filter((x) => pointInPoly(a.at, x.outer)).length;
  const areas = sizes.map((x) => x.areaMm2);
  out.inside = `${inside}/${sizes.length}`;
  out.spread = Math.round(Math.max(...areas) - Math.min(...areas));
  // the rim share, re-measured here
  const tol = rimTolMm(c.cellMm);
  let on = 0;
  const off: { x: number; y: number; d: number }[] = [];
  for (const p of c.rim) {
    let best = Infinity;
    for (const o of sizes) {
      const q = o.outer;
      for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
        const A = q[j],
          B = q[i];
        const dx = B.x - A.x,
          dy = B.y - A.y;
        const L = dx * dx + dy * dy;
        const u = L ? Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.y - A.y) * dy) / L)) : 0;
        best = Math.min(best, Math.hypot(A.x + u * dx - p.x, A.y + u * dy - p.y));
      }
    }
    if (best <= tol) on++;
    else off.push({ x: p.x, y: p.y, d: Math.round(best * 10) / 10 });
  }
  // the off points: how far (a hair past tol, or far — another line closes it)
  out.offNear = off.filter((q) => q.d <= 2 * tol).length;
  out.offFar = off.length - (out.offNear as number);
  out.cell = c.cellMm;
  out.nearD = off.filter((q) => q.d <= 2 * tol).map((q) => q.d);
  out.off = off.filter((q) => q.d > 2 * tol).slice(0, 6);
  out.rimShare = Math.round((100 * on) / c.rim.length);
  out.rimN = c.rim.length;
  out.tol = tol;
  if (!inside) return { ...out, fail: 'outside-every-size' };
  if (inside === sizes.length) return { ...out, fail: 'inside-every-size' };
  if (a.areaMm2 > 1.05 * (Math.max(...areas) - Math.min(...areas)))
    return { ...out, fail: 'area>spread' };
  return {
    ...out,
    fail: (out.rimShare as number) >= 90 ? `proven?${provenCopy(a, families, seeds)}` : 'rim<90',
  };
}

/** The sheet's lines (grey) and every family's candidates: closed by rank colour, else red. */
function renderSheet(
  S: {
    sheet: Sheet | null;
    chains: ChainSet | null;
    wallSet: ChainSet | null;
    families: PieceFamily[] | null;
  },
  file: string,
  rec: Record<string, unknown>,
): string | null {
  const set = S.wallSet ?? S.chains;
  if (!set) return null;
  const strokes: Stroke[] = [];
  const labels: Label[] = [];
  let box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const c of set.chains) {
    if (c.pts.length < 2) continue;
    strokes.push({ pts: c.pts, closed: !!c.closed, color: '#c8c8c8', width: 0.6 });
    for (const p of c.pts)
      box = {
        minX: Math.min(box.minX, p.x),
        minY: Math.min(box.minY, p.y),
        maxX: Math.max(box.maxX, p.x),
        maxY: Math.max(box.maxY, p.y),
      };
  }
  if (!Number.isFinite(box.minX)) return null;
  for (const f of S.families ?? []) {
    for (const c of f.candidates) {
      if (c.outer.length < 3) continue;
      const ok = c.outcome === 'closed';
      strokes.push({
        pts: c.outer,
        closed: true,
        color: ok ? PALETTE[c.rank % PALETTE.length] : '#e00000',
        width: ok ? 1.2 : 2,
        ...(ok ? {} : { dash: '6 4' }),
      });
    }
    const top = f.candidates[0];
    if (top?.outer.length) {
      const o = countBy(f.candidates.map((c) => c.outcome));
      labels.push({
        at: top.outer[0],
        text: `seed ${f.seed}: ${Object.entries(o)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')}`,
        color: '#000',
        size: 14,
      });
    }
  }
  for (const w of (rec.weak as {
    box: BoxMm2;
    fail: string;
    area: number;
    how: string;
    texts: string[];
  }[]) ?? []) {
    const b = w.box;
    strokes.push({
      pts: [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY },
      ],
      closed: true,
      color: '#ff00cc',
      width: 2.5,
    });
    labels.push({
      at: { x: b.minX + 2, y: (b.minY + b.maxY) / 2 },
      text: `${w.how}/${w.fail} ${Math.round(w.area / 100)}cm² ${(w.texts ?? []).join(' ').slice(0, 30)}`,
      color: '#c00090',
      size: 13,
    });
  }
  const st = rec.stop as Stop | undefined;
  labels.push({
    at: { x: box.minX + 5, y: box.maxY - 5 },
    text: `${rec.id} · ${rec.verdict}${st ? ` · ${st.step}: ${st.reason.slice(0, 110)}` : ''}`,
    color: '#000',
    size: 18,
  });
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  renderPng(file, box, strokes, labels, Math.min(1, 2400 / span));
  return file;
}

export async function main(args: string[]): Promise<number> {
  for (const rel of args) {
    let r: Record<string, unknown>;
    try {
      r = await runFile(rel);
    } catch (e) {
      r = { id: rel, verdict: 'crashed', error: toWireError(e).message.slice(0, 600) };
    }
    // writeSync: the runner exits right after main — an async pipe write would be cut at 64 KB
    writeSync(1, `@@RESULT ${JSON.stringify(r)}\n`);
  }
  return 0;
}

/** GRADE P2 audit picture: the drawing, the other sizes, the size's own lines, the repaired outline. */
function renderRepairPng(
  file: string,
  id: string,
  fam: PieceFamily,
  c: PieceFamily['candidates'][number],
  set: ChainSet | null,
  labels: string[],
) {
  mkdirSync(dirname(file), { recursive: true });
  const r = c.repair!;
  const strokes: Stroke[] = [];
  const marks: Label[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of c.outer) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const box = { minX: minX - 25, minY: minY - 25, maxX: maxX + 25, maxY: maxY + 70 };
  for (const ch of set?.chains ?? []) {
    if (ch.pts.length < 2) continue;
    if (
      !ch.pts.some((p) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY)
    )
      continue;
    strokes.push({ pts: ch.pts, closed: ch.closed, color: '#c8c8c8', width: 0.8 });
  }
  for (const x of fam.candidates)
    if (x.rank !== c.rank && x.outcome === 'closed')
      strokes.push({
        pts: x.outer,
        closed: true,
        color: PALETTE[x.rank % PALETTE.length],
        width: 0.7,
      });
  if (r.was) strokes.push({ pts: r.was, closed: true, color: '#888', width: 5, dash: '6 4' });
  for (const w of c.walls) {
    const ch = set?.chains[w];
    if (ch) strokes.push({ pts: ch.pts, closed: ch.closed, color: '#06c', width: 1.3 });
  }
  strokes.push({ pts: c.outer, closed: true, color: '#0a0', width: 2 });
  for (const d of c.derived ?? []) {
    strokes.push({ pts: d.pts, color: '#e00', width: 3.5 });
    marks.push({ at: d.pts[d.pts.length >> 1], text: 'fill', color: '#e00', size: 12 });
  }
  const L = (k: number) => labels[k] ?? String(k);
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  // the zoom: where the repaired outline leaves both anchors it came from (> 0.5 mm) — on a strip
  // the end that tells the sizes apart; plus the filled holes
  const ringsOf = r.from.map((k) => fam.candidates.find((x) => x.rank === k)?.outer ?? []);
  const dTo = (p: PtMm, ring: PtMm[]) => {
    let m = Infinity;
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j];
      const b = ring[(j + 1) % ring.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1e-9;
      const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
      m = Math.min(m, Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy));
    }
    return m;
  };
  const step = Math.max(1, Math.floor(c.outer.length / 400));
  const apart = c.outer.filter((p, j) => j % step === 0 && ringsOf.every((rg) => dTo(p, rg) > 0.5));
  const focus = [...apart, ...(c.derived ?? []).flatMap((d) => d.pts)];
  if (focus.length) {
    let zx0 = Infinity;
    let zy0 = Infinity;
    let zx1 = -Infinity;
    let zy1 = -Infinity;
    for (const p of focus) {
      zx0 = Math.min(zx0, p.x);
      zy0 = Math.min(zy0, p.y);
      zx1 = Math.max(zx1, p.x);
      zy1 = Math.max(zy1, p.y);
    }
    const zb = { minX: zx0 - 30, minY: zy0 - 30, maxX: zx1 + 30, maxY: zy1 + 55 };
    const zs = Math.max(zb.maxX - zb.minX, zb.maxY - zb.minY);
    renderPng(file.replace(/\.png$/, '-zoom.png'), zb, strokes, marks, Math.min(12, 1400 / zs), [
      {
        color: '#000',
        text: `${id.slice(0, 60)} seed ${fam.seed}: ${L(c.rank)} from ${L(r.from[0])}+${L(r.from[1])} — zoom where it leaves both`,
      },
      {
        color: '#0a0',
        text: 'green = repaired; red = filled hole; colours = other sizes; blue = its walls',
      },
    ]);
  }
  renderPng(file, box, strokes, marks, Math.min(6, 1800 / span), [
    {
      color: '#000',
      text: `${id.slice(0, 70)} seed ${fam.seed}: size ${L(c.rank)} ${r.kind === 'leak' ? 'leaked' : "closed on another size's line"} -> repaired from ${L(r.from[0])}+${L(r.from[1])}`,
    },
    {
      color: '#0a0',
      text: `green = repaired outline; cover ${(r.cover * 100).toFixed(1)} %; holes ${r.holes} (${r.holesMm} mm, red); score ${r.score}; dev ${r.devMm} mm`,
    },
    {
      color: '#06c',
      text: 'blue = own/common lines it runs on; grey = the drawing; grey dashed thick = before; thin colours = other sizes',
    },
  ]);
}

/** GRADE P2: a refused size — where the grade puts it (dashed) over the drawing. */
function renderHintPng(
  file: string,
  id: string,
  fam: PieceFamily,
  c: PieceFamily['candidates'][number],
  set: ChainSet | null,
  labels: string[],
) {
  mkdirSync(dirname(file), { recursive: true });
  const h = c.gradeHint!;
  const strokes: Stroke[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of h.pred) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const box = { minX: minX - 25, minY: minY - 25, maxX: maxX + 25, maxY: maxY + 60 };
  for (const ch of set?.chains ?? []) {
    if (ch.pts.length < 2) continue;
    if (
      !ch.pts.some((p) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY)
    )
      continue;
    strokes.push({ pts: ch.pts, closed: ch.closed, color: '#999', width: 0.8 });
  }
  for (const x of fam.candidates)
    if (x.rank !== c.rank && x.outcome === 'closed')
      strokes.push({
        pts: x.outer,
        closed: true,
        color: PALETTE[x.rank % PALETTE.length],
        width: 0.6,
      });
  strokes.push({ pts: h.pred, closed: true, color: '#e00', width: 1.6, dash: '4 3' });
  const L = (k: number) => labels[k] ?? String(k);
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  renderPng(file, box, strokes, [], Math.min(5, 1600 / span), [
    {
      color: '#000',
      text: `${id.slice(0, 70)} seed ${fam.seed}: size ${L(c.rank)} ${c.outcome} — refused: ${h.refusals.join(', ')}`,
    },
    {
      color: '#e00',
      text: `red dashed = where the grade of ${L(h.from[0])}+${L(h.from[1])} puts it${h.extrapolated ? ' (extrapolated)' : ''}; grey = the drawing; colours = other sizes`,
    },
  ]);
}
