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
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Session, type StageCtx } from 'lib/pattern-import/worker/session';
import { toWireError } from 'lib/pattern-import/worker/errors';
import { parseSizeToken } from 'lib/pattern-import/sizes/tokens';
import type { ChainSet, PieceFamily, Sheet, StageIO, StageName } from 'lib/pattern-import/types';
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
    families: fams.length,
    /** Families whose every size closes / with a leak / with a refused (held back) size. */
    familiesClosed: fams.filter(
      (f) => f.candidates.length && f.candidates.every((c) => c.outcome === 'closed'),
    ).length,
    familiesLeak: fams.filter((f) => f.candidates.some((c) => c.outcome === 'leak')).length,
    familiesRefused: fams.filter((f) => f.candidates.some((c) => c.outcome === 'refused')).length,
    candidates: outcomes,
    setAside: (s.pieces?.setAside ?? []).length,
    named: s.semantics?.pieces.length ?? null,
  };
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
    console.log(`@@RESULT ${JSON.stringify(r)}`);
  }
  return 0;
}
