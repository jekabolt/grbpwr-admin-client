// PATTERN-IMPORT · A9 probe — the AI page roles on the corpus PDFs, with the RECORDED answers
// (fixtures/page-roles.json via page-roles-fixture.ts; no picture, no network, nothing paid):
//   · coverage: every page a call sends has a recorded answer;
//   · the rule per file: pages set aside by AI + geometry, pages still a question, and no page of
//     the tile grid set aside (the tile count is the one without the AI);
//   · controls on every file the call is made for: geometry alone (no AI) sets nothing aside by
//     itself; the AI alone (its confidence below 0.85) neither; the AI's `pattern_*` on a page set
//     aside keeps it a question, with the AI's role on it;
//   · MUTATION "the AI was wrong": a real tile answered `instructions` 0.99 stays a tile.
//   node scripts/pattern-import/page-roles.mjs              (yarn patimport:page-roles)
//   node scripts/pattern-import/page-roles.mjs dump a.pdf…  the per-page stats (fixture authoring)
//   node scripts/pattern-import/page-roles.mjs ink a.pdf /abs/b.pdf…  the page reading's truth and
//     mutations only (clean/page-ink.ts), on corpus or absolute paths
import { readFileSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import { Session } from 'lib/pattern-import/worker/session';
import {
  classifyFilePages,
  clearPageRoleCache,
  pagesForCall,
  type PageRoleDeps,
} from 'lib/pattern-import/ai/pages';
import { AI_PAGES, aiAsides, exclusionOf } from 'lib/pattern-import/clean/page-roles';
import { reducedCopy, shapesOf } from 'lib/pattern-import/clean/reduced-copy';
import { PAGE_INK, pageInk, tilePensOf } from 'lib/pattern-import/clean/page-ink';
import { pageChains } from 'lib/pattern-import/clean/page-chains';
import { PATIMPORT } from 'lib/pattern-import/types';
import { mediaLeftovers } from 'lib/pattern-import/ai/discard';
import type {
  AiPageHint,
  IRPage,
  PageClassification,
  PtMm,
  SourceDoc,
  StageIO,
  Style,
} from 'lib/pattern-import/types';
import { applyMasks, cleanPages } from 'lib/pattern-import/clean';
// the e2e entry installs pdf.js' legacy build (setPdfjsLoader)
import './e2e-entry';
import { fixturePageRoleDeps } from './page-roles-fixture';
import { mountHook, rerender } from './react-hook-shim';
import { notPatternEvidence } from 'components/managers/tech-card/components/pattern-import/autopilot/policy';
import {
  useImportSession,
  type ImportSessionApi,
} from 'components/managers/tech-card/components/pattern-import/use-import-session';
import type { ImportClient } from 'components/managers/tech-card/components/pattern-import/client';
import { stubBuildDraft } from 'components/managers/tech-card/components/pattern-import/stub-client';

const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const ctx = { checkCancel: () => {}, progress: () => {} };

type Check = { file: string; check: string; ok: boolean; got: string };
const checks: Check[] = [];
const check = (file: string, name: string, ok: boolean, got: unknown) =>
  checks.push({ file, check: name, ok, got: typeof got === 'string' ? got : JSON.stringify(got) });

function open(rel: string) {
  const b = readFileSync(resolve(CORPUS, rel));
  return new Session(1, [
    {
      name: basename(rel),
      bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    },
  ]);
}

/** The hook's call (use-import-session.ts `askPageRoles`) on one file: hints, or none. */
async function ask(
  s: Session,
  cl: StageIO['clean']['out'],
  name: string,
  deps: PageRoleDeps,
): Promise<AiPageHint[]> {
  const asked = new Set(cl.dropped.filter((d) => d.status === 'suggest').map((d) => d.page));
  if (!asked.size) return [];
  const { pages, left } = pagesForCall(
    cl.classes.filter((c) => c.file === '0').sort((a, b) => a.page - b.page),
    asked,
  );
  const thumbs = await s.runStage(
    'render-pages',
    {
      pages: pages.map((p) => ({ file: '0', page: p.page })),
      maxPx: AI_PAGES.thumbPx,
      pictures: false,
    },
    ctx,
  );
  clearPageRoleCache();
  const r = await classifyFilePages(
    { key: `${name}:${Math.random()}`, file: '0', fileName: name, thumbs: thumbs.pages, left },
    deps,
  );
  return r.hints;
}

async function dump(files: string[]) {
  for (const f of files) {
    const s = open(`pdf/${f}`);
    await s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx);
    const cl = await s.runStage('clean', { edits: [] }, ctx);
    const asked = new Set(cl.dropped.filter((d) => d.status === 'suggest').map((d) => d.page));
    const { pages, left } = pagesForCall(
      cl.classes.filter((c) => c.file === '0'),
      asked,
    );
    const st = await s.runStage(
      'render-pages',
      { pages: pages.map((p) => ({ file: '0', page: p.page })), maxPx: 1024, pictures: false },
      ctx,
    );
    console.log(
      `\n=== ${f}: ${cl.classes.length} pages, asked ${[...asked].map((p) => p + 1).join(',')} · sent ${pages.length} left ${left} · marks ${JSON.stringify(cl.tileMarks?.map((m) => [m.tile, m.sigs.length]))}`,
    );
    for (const p of st.pages) {
      const c = cl.classes.find((x) => x.page === p.page)!;
      const d = cl.dropped.find((x) => x.page === p.page);
      console.log(
        `p${p.page + 1} ${c.cls}${c.sheet != null ? '#' + c.sheet : ''} ${c.confidence} ${Math.round(p.widthMm)}x${Math.round(p.heightMm)} line ${p.lineLengthM}m faces ${p.pieceSizedOutlines} marks ${p.hasTileMarks} chars ${p.textChars}${d ? ` | DROP ${d.status} geo=${JSON.stringify(d.geo ?? [])}` : ''} | ${p.textExcerpt.slice(0, 90)}`,
      );
    }
    s.close();
  }
}

async function oneFile(f: string) {
  const name = f;
  const s = open(`pdf/${f}`);
  try {
    await s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx);
    const base = await s.runStage('clean', { edits: [] }, ctx);
    const tiles = (cl: StageIO['clean']['out']) =>
      cl.classes.filter((c) => c.cls === 'tile').map((c) => c.page);
    const asked = base.dropped.filter((d) => d.status === 'suggest');
    // geometry alone: nothing set aside by itself on a page holding line work
    check(
      name,
      'geometry alone sets no page aside by itself',
      !base.dropped.some((d) => d.aiAside),
      base.dropped.filter((d) => d.aiAside).map((d) => d.page + 1),
    );
    if (!asked.length) return { file: f, called: false };
    inkChecks(name, s, base);
    // Codex #2: "does not register" only against a connected reference covering the page's sheet —
    // a page of no sheet in a file of two (polupalto's instructions before Bogen A / B), or tiles
    // that do not register by recurrence (r4454, stitched at their edges), give no such evidence
    const apart = (d: (typeof asked)[number]) =>
      (d.geo ?? []).some((g) => /^registers with none/.test(g));
    if (name === 'polupalto.pdf')
      check(
        name,
        'mixed reference (2 sheets, page in none) → no registration evidence',
        asked.filter((d) => d.page <= 3).every((d) => !apart(d)),
        asked.map((d) => [d.page + 1, d.geo]),
      );
    if (name === 'r4454.pdf')
      check(
        name,
        'tiles that do not register by recurrence → no registration evidence',
        asked.every((d) => !apart(d)),
        asked.map((d) => [d.page + 1, d.geo]),
      );
    if (name === 'robe.pdf')
      check(
        name,
        'one connected sheet → "registers with none" on the instruction pages',
        asked.every((d) => apart(d)),
        asked.map((d) => [d.page + 1, d.geo]),
      );
    const fx = fixturePageRoleDeps();
    const hints = await ask(s, base, name, fx.deps);
    const call = fx.log.calls[0];
    // Codex #5: the call sends only the pages in question and one reference tile
    {
      const tilesSent = (call?.sent ?? []).filter((n) => tiles(base).includes(n - 1));
      const askedSent = (call?.sent ?? []).filter((n) => asked.some((d) => d.page === n - 1));
      check(
        name,
        'the call sends only the pages in question + one reference tile',
        !!call && tilesSent.length === 1 && askedSent.length + 1 === call.sent.length,
        { sent: call?.sent, tiles: tilesSent },
      );
    }
    check(
      name,
      'every page the call sends has a recorded answer',
      !!call && call.missing.length === 0,
      call ? { sent: call.sent.length, missing: call.missing } : 'no call',
    );
    const withAi = await s.runStage('clean', { edits: [], aiHints: { pages: hints } }, ctx);
    check(
      name,
      'no page of the tile grid is set aside by the AI',
      JSON.stringify(tiles(withAi)) === JSON.stringify(tiles(base)) &&
        !withAi.dropped.some((d) => tiles(base).includes(d.page)),
      { before: tiles(base).length, after: tiles(withAi).length },
    );
    const aside = withAi.dropped.filter((d) => d.aiAside).map((d) => d.page + 1);
    // Codex #6: scored against the INDEPENDENT truth — no ground-truth pattern page set aside
    // (by the reader or the AI), every page the AI set aside is truly not pattern
    check(
      name,
      'truth: no ground-truth pattern page is set aside',
      withAi.dropped.every((d) => truthOf(name, d.page + 1) !== 'pattern'),
      withAi.dropped.filter((d) => truthOf(name, d.page + 1) === 'pattern').map((d) => d.page + 1),
    );
    check(
      name,
      'truth: every page set aside by AI + geometry is truly not pattern',
      aside.every((n) => truthOf(name, n) === 'not'),
      aside.map((n) => [n, truthOf(name, n)]),
    );
    const still = withAi.dropped.filter((d) => d.status === 'suggest');
    // every page set aside by AI + geometry: AI ≥ 0.85, a non-pattern role, an EXCLUSIONARY fact
    check(
      name,
      'set aside only on AI ≥ 0.85 (not pattern) + an exclusionary geometric fact',
      withAi.dropped
        .filter((d) => d.aiAside)
        .every(
          (d) =>
            !!d.ai &&
            d.ai.confidence >= AI_PAGES.autoMin &&
            !/^pattern/.test(d.ai.role) &&
            !!d.exclusion,
        ),
      withAi.dropped.filter((d) => d.aiAside).map((d) => [d.page + 1, d.ai, d.exclusion]),
    );
    // the AI alone: the same answers at 0.8 set nothing aside
    const weak = hints.map((h) => ({ ...h, confidence: 0.8 }));
    const w = await s.runStage('clean', { edits: [], aiHints: { pages: weak } }, ctx);
    check(
      name,
      'the AI below 0.85 sets nothing aside (a suggestion)',
      !w.dropped.some((d) => d.aiAside) &&
        w.dropped.filter((d) => d.status === 'suggest').length === asked.length,
      w.dropped.filter((d) => d.aiAside).map((d) => d.page + 1),
    );
    // the AI says pattern on every page in question: they stay questions, the role on them
    const pat = asked.map((d) => ({
      file: d.file,
      page: d.page,
      role: 'pattern_sheet' as const,
      confidence: 0.95,
      evidence: ['control'],
    }));
    const p = await s.runStage('clean', { edits: [], aiHints: { pages: pat } }, ctx);
    check(
      name,
      "the AI's pattern_* keeps a page set aside a question (read-as-tile offered)",
      asked.every((a) => {
        const d = p.dropped.find((x) => x.page === a.page);
        return d?.status === 'suggest' && d.ai?.role === 'pattern_sheet';
      }),
      p.dropped.map((d) => [d.page + 1, d.status, d.ai?.role]),
    );
    // Codex #3: the cache is file-neutral — the same file read again as file 2 gets the cached
    // answer remapped to its current index, with no second call
    {
      const fx2 = fixturePageRoleDeps();
      const thumbs = (
        await s.runStage(
          'render-pages',
          { pages: asked.map((d) => ({ file: '0', page: d.page })), maxPx: 256, pictures: false },
          ctx,
        )
      ).pages;
      const key = `cache-probe:${name}`;
      const a = await classifyFilePages({ key, file: '0', fileName: name, thumbs }, fx2.deps);
      const b = await classifyFilePages({ key, file: '1', fileName: name, thumbs }, fx2.deps);
      check(
        name,
        'cache: one call; the second read as file 2 is remapped to file 2',
        fx2.log.calls.length === 1 &&
          !!b.cached &&
          b.hints.length === a.hints.length &&
          b.hints.every((h) => h.file === '1') &&
          a.hints.every((h) => h.file === '0'),
        {
          calls: fx2.log.calls.length,
          a: a.hints.map((h) => h.file),
          b: b.hints.map((h) => h.file),
        },
      );
    }
    // MUTATION: a real tile answered "instructions" 0.99 stays in the tile grid
    const mu = fixturePageRoleDeps('tile-instructions');
    const mh = await ask(s, base, name, mu.deps);
    const m = await s.runStage('clean', { edits: [], aiHints: { pages: mh } }, ctx);
    const hit = mu.log.mutated[0];
    check(
      name,
      'MUTATION: a real tile the AI calls instructions 0.99 is NOT set aside',
      !!hit &&
        m.classes.find((c) => c.page === hit.pageNo - 1)?.cls === 'tile' &&
        !m.dropped.some((d) => d.page === hit.pageNo - 1) &&
        m.notes.some((n) => n.includes(`page ${hit.pageNo}: the AI reads it as instructions`)),
      hit
        ? { page: hit.pageNo, cls: m.classes.find((c) => c.page === hit.pageNo - 1)?.cls }
        : 'no tile in the call',
    );
    return {
      file: f,
      called: true,
      sent: call?.sent.length ?? 0,
      asked: asked.map((d) => d.page + 1),
      aside,
      still: still.map(
        (d) =>
          `${d.page + 1}:${d.ai ? `${d.ai.role} ${d.ai.confidence}` : 'no AI'}${d.geo?.length ? ' +geo' : ''}`,
      ),
    };
  } finally {
    s.close();
  }
}

/**
 * Codex #4 through the REAL wizard hook: an edit that changes the tile reference set makes the
 * file's AI answers stale (they only suggest); "keep aside" (a role edit to the class it has)
 * changes nothing; "ask the AI again" makes them count again.
 */
async function staleSection(f: string) {
  let sess: Session | null = null;
  const ctx2 = { checkCancel: () => {}, progress: () => {} };
  const client: ImportClient = {
    kind: 'worker',
    async open(files) {
      sess = new Session(1, files);
      return { sessionId: 1, files: sess.files };
    },
    async run(_id, stage, input) {
      if (!sess) throw new Error('no session');
      const i =
        stage === 'render-pages'
          ? { ...(input as StageIO['render-pages']['in']), pictures: false }
          : input;
      return (await sess.runStage(stage, i as never, ctx2)) as never;
    },
    cancel() {},
    async close() {
      sess?.close();
      sess = null;
    },
    alive: () => true,
  };
  const fx = fixturePageRoleDeps();
  clearPageRoleCache();
  let api!: ImportSessionApi;
  mountHook(() => {
    api = useImportSession({
      client,
      card: { techCardId: 1, sizes: [], scopes: [], existingPieces: [], styleLabel: 'probe' },
      namer: async () => [],
      buildDraft: stubBuildDraft,
      applyDraft: async () => ({ ok: true, uploaded: [] }),
      pageRoles: fx.deps,
    });
  });
  const settle = async () => {
    for (let k = 0; k < 4; k++) await Promise.resolve();
    rerender();
  };
  const b = readFileSync(resolve(CORPUS, `pdf/${f}`));
  await api.dispatch({ type: 'files', files: [new File([b], f)] });
  await settle();
  const asideNow = () =>
    (api.session.clean?.dropped ?? []).filter((d) => d.aiAside).map((d) => d.page);
  const first = asideNow();
  check(f, 'hook: the AI + a reduced copy sets the overview aside', first.length > 0, first);
  // "keep aside" on an instruction page: its role stays, nothing the answers depend on moved
  const instr = api.session.clean!.dropped.find(
    (d) => d.cls === 'instructions' && d.status === 'suggest',
  )!;
  await api.dispatch({
    type: 'clean',
    edits: [{ file: instr.file, page: instr.page, role: instr.cls }],
  });
  await settle();
  check(
    f,
    'hook: "keep aside" does not make the answers stale',
    !api.pageRolesStale && JSON.stringify(asideNow()) === JSON.stringify(first),
    { stale: api.pageRolesStale, aside: asideNow() },
  );
  // a tile set aside by the operator: the tile reference set moved — stale, only a suggestion
  const tile = api.session.clean!.classes.find((c) => c.cls === 'tile')!;
  const edits = [
    ...api.inputs.cleanEdits,
    { file: tile.file, page: tile.page, role: 'instructions' as const },
  ];
  await api.dispatch({ type: 'clean', edits });
  await settle();
  check(
    f,
    'hook: a tile set aside makes the answers stale — nothing set aside on them',
    api.pageRolesStale &&
      asideNow().length === 0 &&
      (api.session.clean?.dropped ?? []).some((d) => d.ai?.stale),
    { stale: api.pageRolesStale, aside: asideNow() },
  );
  await api.dispatch({ type: 'page-roles' });
  await settle();
  check(
    f,
    'hook: "ask the AI again" — fresh answers count again, the edits kept',
    !api.pageRolesStale && asideNow().length > 0 && api.inputs.cleanEdits.length === 2,
    { stale: api.pageRolesStale, aside: asideNow(), calls: fx.log.calls.length },
  );
  await client.close(1);
}

/**
 * Codex #5 + re-check #2: every uploaded thumbnail is deleted after the call — answered, failed,
 * or timed out with an upload still in flight (deleted when it settles); a failed delete is
 * retried once, and what is still left is logged (`mediaLeftovers`) for the backend sweep.
 */
async function discardSection() {
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
  type Case = {
    label: string;
    fails?: boolean;
    slowUpload?: number;
    timeoutMs?: number;
    delFails?: number;
  };
  const cases: Case[] = [
    { label: 'answered' },
    { label: 'the call failed', fails: true },
    { label: 'timed out with uploads still in flight', slowUpload: 60, timeoutMs: 20 },
    { label: 'a delete failing once is retried', delFails: 1 },
    { label: 'a delete failing twice is logged as left', delFails: 2 },
  ];
  for (const c of cases) {
    const up: number[] = [];
    const gone: number[] = [];
    let n = 100 + cases.indexOf(c) * 10;
    let delCalls = 0;
    const leftBefore = mediaLeftovers().length;
    const thumbs = [0, 1, 2].map((page) => ({
      file: '0',
      page,
      widthMm: 210,
      heightMm: 297,
      lineLengthM: 0,
      pieceSizedOutlines: 0,
      textChars: 0,
      textExcerpt: '',
      png: new Blob([`page ${page}`], { type: 'image/png' }),
    }));
    clearPageRoleCache();
    const r = await classifyFilePages(
      { key: `discard:${c.label}`, file: '0', fileName: 'x.pdf', thumbs, timeoutMs: c.timeoutMs },
      {
        upload: async () => {
          if (c.slowUpload) await sleep(c.slowUpload);
          up.push(++n);
          return n;
        },
        classify: async () => {
          if (c.fails) throw new Error('server down');
          return { pages: [{ pageNo: 1, role: 'cover', confidence: 0.9, evidence: [] }] };
        },
        discard: async (ids) => {
          delCalls++;
          if (c.delFails && delCalls <= c.delFails) return ids;
          gone.push(...ids);
          return [];
        },
      },
    );
    await sleep((c.slowUpload ?? 0) * 3 + 30);
    const left = mediaLeftovers().slice(leftBefore);
    const all = (x: number[]) => JSON.stringify([...x].sort());
    const ok =
      c.delFails === 2
        ? left.length === up.length && gone.length === 0 && delCalls === 2
        : up.length > 0 &&
          all(gone) === all(up) &&
          left.length === 0 &&
          (c.delFails !== 1 || delCalls === 2) &&
          r.status === (c.fails ? 'error' : c.timeoutMs ? 'timeout' : 'ok');
    check('synthetic', `uploads deleted — ${c.label}`, ok, {
      up,
      gone,
      left,
      delCalls,
      status: r.status,
    });
  }
}

// ── STOPS: the page-ink reading (clean/page-ink.ts) on the pages set aside that hold line work ──

/**
 * On every corpus file with a page set aside "to check": (1) truth — no ground-truth pattern page
 * is ink-explained; (2) MUTATION "a real piece on an instruction page" — every page the reading
 * explains, with the file's largest tile piece copied onto it at 1:1 in its own pen, is no longer
 * explained; and with that piece in a foreign hairline pen, neither, when it is larger than a
 * drawing.
 */
function inkChecks(name: string, s: Session, base: StageIO['clean']['out']) {
  const docs = (s as unknown as { docs: SourceDoc[] }).docs;
  const doc = docs[0];
  const asked = base.dropped.filter((d) => d.status === 'suggest');
  const explained = asked.filter((d) => d.ink?.explained);
  INK_ROWS.push({
    file: name,
    asked: asked.length,
    explained: explained.map((d) => `p${d.page + 1}`),
    unexplained: asked
      .filter((d) => !d.ink?.explained)
      .map((d) => `p${d.page + 1}: ${d.ink?.unexplained ?? '(no tiles)'}`),
  });
  check(
    name,
    'truth: no ground-truth pattern page is ink-explained',
    explained.every((d) => truthOf(name, d.page + 1) !== 'pattern'),
    explained.filter((d) => truthOf(name, d.page + 1) === 'pattern').map((d) => d.page + 1),
  );
  if (!explained.length) return;
  const tilePages = base.classes.filter((c) => c.cls === 'tile').map((c) => c.page);
  const tilePcs = doc.pages.filter((p) => tilePages.includes(p.page)).map((p) => pageChains(p));
  const pens = tilePensOf(tilePcs);
  const shapes = tilePcs.flatMap((pc) => shapesOf(pc.chains, PATIMPORT.minPieceAreaMm2));
  // a real piece at 1:1: the largest closed non-rectangular outline closing on one tile, else (no
  // piece closes on one tile) the longest curved line of the tiles — a piece's edge
  type Cut = { pts: PtMm[]; closed: boolean; style: Style; ext: number; size: number };
  let closed: Cut | null = null;
  let open: Cut | null = null;
  /** Every closed non-rectangular piece on one tile (the small-piece mutations). */
  const pieces: Cut[] = [];
  for (const pc of tilePcs)
    pc.chains.forEach((c, i) => {
      const b = pc.box[i];
      const ext = Math.max(b.maxX - b.minX, b.maxY - b.minY);
      const st = pc.page.styles.find((x) => x.id === c.style);
      // on the page (a path drawn far off the page, clipped away on paper, is no piece edge)
      const onPage =
        b.minX >= -1 &&
        b.minY >= -1 &&
        b.maxX <= pc.page.widthMm + 1 &&
        b.maxY <= pc.page.heightMm + 1;
      if (!st || !(st.widthMm > 0) || ext < 30 || !onPage) return;
      if (!c.closed) {
        const curved = Math.min(b.maxX - b.minX, b.maxY - b.minY) > 5;
        if (curved && c.lengthMm >= 100 && (!open || c.lengthMm > open.size))
          open = { pts: c.pts, closed: false, style: st, ext, size: c.lengthMm };
        return;
      }
      let a = 0;
      for (let k = 0, j = c.pts.length - 1; k < c.pts.length; j = k++)
        a += (c.pts[j].x + c.pts[k].x) * (c.pts[j].y - c.pts[k].y);
      a = Math.abs(a) / 2;
      if (a < PATIMPORT.minPieceAreaMm2 || a >= 0.93 * (b.maxX - b.minX) * (b.maxY - b.minY))
        return;
      pieces.push({ pts: c.pts, closed: true, style: st, ext, size: a });
      if (!closed || a > closed.size)
        closed = { pts: c.pts, closed: true, style: st, ext, size: a };
    });
  // no piece and no curved edge on any one tile (a sheet of straight segments only): the mutations
  // below still run with the synthetic pocket; only the 1:1 copies of a tile piece are skipped
  const p = (closed ?? open) as Cut | null;
  for (const d of explained) {
    const pg = doc.pages.find((x) => x.page === d.page)!;
    const inject = (style: Style) => {
      const sid = Math.max(0, ...pg.styles.map((x) => x.id)) + 1;
      const pid = Math.max(0, ...pg.paths.map((x) => x.id)) + 1;
      const mut: IRPage = {
        ...pg,
        styles: [...pg.styles, { ...style, id: sid }],
        paths: [
          ...pg.paths,
          {
            id: pid,
            pts: p!.pts.map((q) => ({ ...q })),
            closed: p!.closed,
            style: sid,
            src: { file: pg.file, page: pg.page, op: 990000, sub: 0 },
          },
        ],
      };
      return pageInk(pageChains(mut), pens, shapes, mut);
    };
    const cls = base.classes.find((c) => c.file === d.file && c.page === d.page);
    if (cls?.cls === 'overview') {
      // an overview's role IS the lattice the reading explains: the reading never decides it on
      // its own (policy.ts inkRole — Codex r3), whatever it explains (a full-size template drawn
      // over the lattice reads as a drawing by the lattice's detail inside it)
      const ev = notPatternEvidence(
        { ...d, reducedCopy: undefined, ink: { explained: '13 rules, 1 drawing' } } as never,
        base.classes as never,
      );
      check(
        name,
        `MUTATION p${d.page + 1}: an overview whose every line is explained (no reduced copy) → no ink evidence`,
        !ev || !ev.includes('every line on it is explained'),
        ev ?? '',
      );
    } else ink5(name, d.page, pg, pieces, p, pens, shapes);
    if (!p) continue;
    const own = inject(p.style);
    check(
      name,
      `MUTATION p${d.page + 1}: a tile ${p.closed ? 'piece' : 'piece edge'} at 1:1 in its own pen on it → not explained`,
      !own.explained && !!own.unexplained,
      own.unexplained ?? own.explained,
    );
    const drawMax = PAGE_INK.hairlineMaxShare * Math.max(pg.widthMm, pg.heightMm);
    if (p.ext > drawMax) {
      const foreign = inject({ ...p.style, widthMm: 0.05, strokeRgb: [200, 30, 30], dash: null });
      check(
        name,
        `MUTATION p${d.page + 1}: the same piece (${Math.round(p.ext)} mm) in a foreign hairline → not explained`,
        !foreign.explained,
        foreign.unexplained ?? foreign.explained,
      );
    }
  }
}
const INK_ROWS: { file: string; asked: number; explained: string[]; unexplained: string[] }[] = [];

/**
 * PAGES (night 19.10) — the page reading learnt rules past the edge, bars, tones, the parts of one
 * drawing, the size line key and the tile map; every one of them is checked against a real piece
 * placed on the explained page (each must leave it NOT explained):
 *   · a small tile piece (a drawing's size) in a pen of its own at the page's centre, or at its
 *     clearest spot when the page draws there (tones and parts never reach a piece drawn with a pen
 *     of its own; a bare outline laid OVER a drawing reads as that drawing — a known limit);
 *   · the same with a WHITE fill under it (a mask, as tile sheets draw it — never a tone);
 *   · the largest piece crossing the page's right edge (straight rules pass the edge, a piece not);
 *   · a waistband: a rectangle in the tile sheet's pen with its name and cut, and with a size key's
 *     words — «Size Line Key», four «SIZE n» labels — but no sample lines.
 * Codex r3 added: the small piece over a grey fill of its own box, with a diagonal grainline in its
 * pen, a named waistband holding a complete key (labels and samples), a straight piece edge in the
 * tile sheet's pen off the page, a coded 44 mm square with four placement marks. An overview page
 * is checked at the policy instead (its reading never decides it). Then: the small piece with its
 * grainline, arrowheads, three notches and a print-size «POCKET / CUT 2» (as much detail as a
 * drawing — the label tells a piece).
 */
function ink5(
  name: string,
  page: number,
  pg: IRPage,
  pieces: { pts: PtMm[]; style: Style; ext: number; size: number }[],
  big: { pts: PtMm[]; closed: boolean; style: Style; ext: number } | null,
  pens: ReturnType<typeof tilePensOf>,
  shapes: ReturnType<typeof shapesOf>,
) {
  const tag = `MUTATION p${page + 1}`;
  const drawMax = PAGE_INK.drawingMaxShare * Math.min(pg.widthMm, pg.heightMm);
  const box = (q: PtMm[]) => ({
    minX: Math.min(...q.map((v) => v.x)),
    minY: Math.min(...q.map((v) => v.y)),
    maxX: Math.max(...q.map((v) => v.x)),
    maxY: Math.max(...q.map((v) => v.y)),
  });
  const moved = (q: PtMm[], dx: number, dy: number) => q.map((v) => ({ x: v.x + dx, y: v.y + dy }));
  type Add = { pts: PtMm[]; closed: boolean; style: Omit<Style, 'id'> };
  const read = (
    adds: Add[],
    texts: { text: string; at: PtMm }[] = [],
    rasters: IRPage['rasters'] = [],
  ) => {
    let sid = Math.max(0, ...pg.styles.map((x) => x.id));
    let pid = Math.max(0, ...pg.paths.map((x) => x.id));
    let tid = Math.max(0, ...pg.texts.map((x) => x.id));
    const styles = [...pg.styles];
    const paths = [...pg.paths];
    for (const a of adds) {
      styles.push({ ...a.style, id: ++sid } as Style);
      paths.push({
        id: ++pid,
        pts: a.pts,
        closed: a.closed,
        style: sid,
        src: { file: pg.file, page: pg.page, op: 990000 + pid, sub: 0 },
      });
    }
    const mut: IRPage = {
      ...pg,
      styles,
      paths,
      rasters: [...pg.rasters, ...rasters],
      texts: [
        ...pg.texts,
        ...texts.map((t) => ({
          id: ++tid,
          text: t.text,
          anchor: t.at,
          bbox: { minX: t.at.x, minY: t.at.y, maxX: t.at.x + 2 * t.text.length, maxY: t.at.y + 3 },
          fontSizeMm: 3,
          rotationDeg: 0,
          layer: null,
          src: { file: pg.file, page: pg.page, op: 990000 + tid, sub: 0 },
        })),
      ] as IRPage['texts'],
    };
    return pageInk(pageChains(mut), pens, shapes, mut);
  };
  const own: Omit<Style, 'id'> = {
    strokeRgb: [200, 30, 30],
    widthMm: 0.18,
    dash: null,
    layer: null,
    fill: false,
    clip: null,
  };
  // the file's smallest tile piece of a drawing's size, else (no piece closes on one tile — Mood's
  // pieces run across tiles) a shield-shaped patch pocket 45×55 mm, a real piece all the same
  const pocket = {
    pts: [
      { x: 0, y: 55 },
      { x: 45, y: 55 },
      { x: 45, y: 15 },
      { x: 22.5, y: 0 },
      { x: 0, y: 15 },
    ],
    style: own as Style,
    ext: 55,
    size: 2137,
  };
  const small = pieces.filter((x) => x.ext <= drawMax).sort((a, b) => a.size - b.size)[0] ?? pocket;
  if (small) {
    const b = box(small.pts);
    // where a real piece is printed: at the page's centre unless the page draws there (its lines
    // inside the piece's box would read as the inner detail of a drawing — a piece is never printed
    // over an illustration), else at the clearest spot of a 10 mm grid
    const pcs = pageChains(pg);
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const busy = (x0: number, y0: number) =>
      pcs.box.filter(
        (o) => o.minX >= x0 - 1 && o.maxX <= x0 + w + 1 && o.minY >= y0 - 1 && o.maxY <= y0 + h + 1,
      ).length;
    let spot = { x: (pg.widthMm - w) / 2, y: (pg.heightMm - h) / 2, n: 0, where: 'at the centre' };
    spot.n = busy(spot.x, spot.y);
    if (spot.n >= PAGE_INK.drawingDetail)
      for (let y0 = 10; y0 + h <= pg.heightMm - 10; y0 += 10)
        for (let x0 = 10; x0 + w <= pg.widthMm - 10; x0 += 10) {
          const n = busy(x0, y0);
          if (n < spot.n) spot = { x: x0, y: y0, n, where: `at a clear spot (${x0}, ${y0})` };
        }
    const at = moved(small.pts, spot.x - b.minX, spot.y - b.minY);
    const r = read([{ pts: at, closed: true, style: own }]);
    // Codex r3: a tinted fill of its own box under it (a grey appliqué / pocket template)
    const grey = read([
      {
        pts: at,
        closed: true,
        style: { ...own, strokeRgb: [200, 200, 200], widthMm: 0, fill: true },
      },
      { pts: at, closed: true, style: own },
    ]);
    check(
      name,
      `${tag}: the same small piece over a grey fill of its own box → not explained`,
      !grey.explained,
      grey.unexplained ?? grey.explained,
    );
    // Codex r3: its grainline — a diagonal 100 mm line in the piece's own pen across it (an open
    // line of a drawing's size is a "drawing"; it must never make the piece a part of one)
    const ab = box(at);
    const cx = (ab.minX + ab.maxX) / 2;
    const cy = (ab.minY + ab.maxY) / 2;
    const grain = read([
      { pts: at, closed: true, style: own },
      {
        pts: [
          { x: cx - 36, y: cy - 36 },
          { x: cx + 36, y: cy + 36 },
        ],
        closed: false,
        style: own,
      },
    ]);
    check(
      name,
      `${tag}: the same small piece with a diagonal grainline in its pen → not explained`,
      !grain.explained,
      grain.unexplained ?? grain.explained,
    );
    // a real piece carries its marks: a grainline with its arrowheads, notches, its name and cut
    // at print size — inner detail as rich as a drawing's, told apart by the label
    const marks: Add[] = [
      {
        pts: [
          { x: cx, y: cy - 0.3 * h },
          { x: cx, y: cy + 0.3 * h },
        ],
        closed: false,
        style: own,
      },
      ...[-1, 1].flatMap((e) =>
        [-1, 1].map((sx) => ({
          pts: [
            { x: cx, y: cy + e * 0.3 * h },
            { x: cx + sx * 2, y: cy + e * (0.3 * h - 3) },
          ],
          closed: false,
          style: own,
        })),
      ),
      ...at.slice(0, 3).map((v) => {
        const dx = cx - v.x;
        const dy = cy - v.y;
        const l = Math.hypot(dx, dy) || 1;
        return {
          pts: [v, { x: v.x + (4 * dx) / l, y: v.y + (4 * dy) / l }],
          closed: false,
          style: own,
        };
      }),
    ];
    const labelled = read(
      [{ pts: at, closed: true, style: own }, ...marks],
      [
        { text: 'POCKET', at: { x: cx - 8, y: cy + 4 } },
        { text: 'CUT 2', at: { x: cx - 6, y: cy - 4 } },
      ],
    );
    check(
      name,
      `${tag}: the same small piece with its grainline, notches and «POCKET / CUT 2» → not explained`,
      !labelled.explained,
      labelled.unexplained ?? labelled.explained,
    );
    check(
      name,
      `${tag}: a small tile piece (${Math.round(small.ext)} mm) in a pen of its own ${spot.where} → not explained`,
      !r.explained,
      r.unexplained ?? r.explained,
    );
    const masked = read([
      {
        pts: at,
        closed: true,
        style: { ...own, strokeRgb: [255, 255, 255], widthMm: 0, fill: true },
      },
      { pts: at, closed: true, style: own },
    ]);
    check(
      name,
      `${tag}: the same small piece over a white mask → not explained`,
      !masked.explained,
      masked.unexplained ?? masked.explained,
    );
    // a photo behind it (a raster over the whole page): no tone of its own
    const photo = read(
      [{ pts: at, closed: true, style: own }],
      [],
      [
        {
          id: 990001,
          page: pg.page,
          file: pg.file,
          bbox: { minX: 0, minY: 0, maxX: pg.widthMm, maxY: pg.heightMm },
          widthPx: 1000,
          heightPx: 1000,
          dpi: 100,
          pageCover: 1,
        } as IRPage['rasters'][number],
      ],
    );
    check(
      name,
      `${tag}: the same small piece over a page-wide photo → not explained`,
      !photo.explained,
      photo.unexplained ?? photo.explained,
    );
  }
  if (big?.closed) {
    const b = box(big.pts);
    const r = read([
      {
        pts: moved(
          big.pts,
          pg.widthMm - (b.minX + b.maxX) / 2,
          pg.heightMm / 2 - (b.minY + b.maxY) / 2,
        ),
        closed: true,
        style: big.style,
      },
    ]);
    check(
      name,
      `${tag}: the largest piece across the page's right edge → not explained`,
      !r.explained,
      r.unexplained ?? r.explained,
    );
  }
  const pen = pens[0];
  if (pen) {
    const w = 36;
    const h = Math.min(200, 0.7 * pg.heightMm);
    const x0 = pg.widthMm / 2 - w / 2;
    const y0 = pg.heightMm / 2 - h / 2;
    const rect = [
      { x: x0, y: y0 },
      { x: x0 + w, y: y0 },
      { x: x0 + w, y: y0 + h },
      { x: x0, y: y0 + h },
    ];
    const style: Omit<Style, 'id'> = {
      strokeRgb: pen.rgb,
      widthMm: pen.w,
      dash: pen.dashed ? pen.motif ?? [2, 1] : null,
      layer: null,
      fill: false,
      clip: null,
    };
    const label = (k: number, text: string) => ({
      text,
      at: { x: x0 + 4, y: y0 + h - 10 - 8 * k },
    });
    const plain = read(
      [{ pts: rect, closed: true, style }],
      [label(0, 'WAISTBAND'), label(1, 'CUT 1 ON FOLD')],
    );
    check(
      name,
      `${tag}: a waistband in the tile sheet's pen with its name and cut → not explained`,
      !plain.explained,
      plain.unexplained ?? plain.explained,
    );
    const keyWords = ['Size Line Key', 'SIZE 00', 'SIZE 02', 'SIZE 04', 'SIZE 06', 'SIZE 08'];
    const keyed = read(
      [{ pts: rect, closed: true, style }],
      keyWords.map((t, k) => label(k, t)),
    );
    // Codex r3: a named waistband holding a complete legend — labels, each with a sample line of
    // its own pen beside it
    const samplePens: Omit<Style, 'id'>[] = [
      { ...style, dash: [4, 1] },
      { ...style, dash: [2, 1] },
      { ...style, dash: [6, 1, 1, 1] },
      { ...style, dash: [1, 1] },
      { ...style, dash: null },
    ];
    const legend = read(
      [
        { pts: rect, closed: true, style },
        ...keyWords.slice(1).map((_, k) => {
          const at = label(k + 1, '').at;
          return {
            pts: [
              { x: at.x + 16, y: at.y + 1 },
              { x: at.x + 30, y: at.y + 1 },
            ],
            closed: false,
            style: samplePens[k],
          };
        }),
      ],
      [...keyWords.map((t, k) => label(k, t)), label(6, 'WAISTBAND'), label(7, 'CUT 1 ON FOLD')],
    );
    check(
      name,
      `${tag}: a named waistband holding a complete size key (labels + sample lines) → not explained`,
      !legend.explained,
      legend.unexplained ?? legend.explained,
    );
    // Codex r3: a straight edge of a piece in the tile sheet's pen running off the page
    const edge = read([
      {
        pts: [
          { x: pg.widthMm - 60, y: pg.heightMm / 2 },
          { x: pg.widthMm + 90, y: pg.heightMm / 2 },
        ],
        closed: false,
        style,
      },
    ]);
    check(
      name,
      `${tag}: a straight piece edge in the tile sheet's pen running off the page → not explained`,
      !edge.explained,
      edge.unexplained ?? edge.explained,
    );
    check(
      name,
      `${tag}: a waistband holding a size key's words but no sample lines → not explained`,
      !keyed.explained,
      keyed.unexplained ?? keyed.explained,
    );
    // a small square piece in the tile sheet's pen labelled with the pattern's code: its cut and
    // its grainline say it is a piece, not a code stamp (44 mm: no test square's side)
    const sq = 44;
    const sx = pg.widthMm / 2 - sq / 2;
    const sy = pg.heightMm / 2 - sq / 2;
    const square = [
      { x: sx, y: sy },
      { x: sx + sq, y: sy },
      { x: sx + sq, y: sy + sq },
      { x: sx, y: sy + sq },
    ];
    const grain = [
      { x: sx + sq / 2, y: sy + 4 },
      { x: sx + sq / 2, y: sy + sq - 4 },
    ];
    const coded = read(
      [
        { pts: square, closed: true, style },
        { pts: grain, closed: false, style },
      ],
      [
        { text: 'MDF000', at: { x: sx + 4, y: sy + 30 } },
        { text: 'CUT 2', at: { x: sx + 4, y: sy + 22 } },
      ],
    );
    check(
      name,
      `${tag}: a 44 mm square piece in the tile sheet's pen with the pattern's code, its cut and a grainline → not explained`,
      !coded.explained,
      coded.unexplained ?? coded.explained,
    );
    const bare = read(
      [{ pts: square, closed: true, style }],
      [{ text: 'MDF000', at: { x: sx + 4, y: sy + 30 } }],
    );
    check(
      name,
      `${tag}: a 44 mm square in the tile sheet's pen with only the pattern's code (no logo) → not explained`,
      !bare.explained,
      bare.unexplained ?? bare.explained,
    );
    // Codex r3: the code and four short placement marks (no lettered logo)
    const marks = read(
      [
        { pts: square, closed: true, style },
        ...[
          [8, 8],
          [36, 8],
          [8, 36],
          [36, 36],
        ].map(([x, y]) => ({
          pts: [
            { x: sx + x - 2.5, y: sy + y },
            { x: sx + x + 2.5, y: sy + y },
          ],
          closed: false,
          style,
        })),
      ],
      [{ text: 'MDF000', at: { x: sx + 14, y: sy + 20 } }],
    );
    check(
      name,
      `${tag}: a 44 mm square in the tile sheet's pen with the pattern's code and four placement marks → not explained`,
      !marks.explained,
      marks.unexplained ?? marks.explained,
    );
  }
}

// ── Codex #6: independent page truth (fixtures/page-truth.json) ──────────────────────────────

type Truth = { pattern: string[]; not: Record<string, string> };
let TRUTH: Record<string, Truth> | null = null;
const inRange = (k: string, n: number) => {
  const m = /^(\d+)(?:-(\d+))?$/.exec(k);
  return !!m && n >= +m[1] && n <= +(m[2] ?? m[1]);
};
/** 'pattern' / 'not' / null (not looked at) for a 1-based page. */
function truthOf(file: string, pageNo: number): 'pattern' | 'not' | null {
  TRUTH ??= (
    JSON.parse(
      readFileSync(
        resolve(
          process.env.PATIMPORT_REPO ?? process.cwd(),
          'scripts/pattern-import/fixtures/page-truth.json',
        ),
        'utf8',
      ),
    ) as { files: Record<string, Truth> }
  ).files;
  const t = TRUTH[file];
  if (!t) return null;
  if (t.pattern.some((k) => inRange(k, pageNo))) return 'pattern';
  if (Object.keys(t.not).some((k) => inRange(k, pageNo))) return 'not';
  return null;
}

/** The session's docs and the classifier's pages after one clean run (probe access). */
async function docsOf(rel: string) {
  const s = open(rel);
  await s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx);
  const base = await s.runStage('clean', { edits: [] }, ctx);
  const inner = s as unknown as { docs: SourceDoc[]; extractPages: PageClassification[] };
  applyMasks(inner.docs, []);
  return { s, docs: inner.docs, classes: inner.extractPages, base };
}

const clonePage = (pg: IRPage, over: Partial<IRPage> = {}): IRPage => ({
  ...pg,
  paths: pg.paths.map((p) => ({ ...p, pts: p.pts.map((q) => ({ ...q })) })),
  texts: pg.texts.map((t) => ({ ...t })),
  ...over,
});

/**
 * MUTATIONS "the AI was wrong": a GROUND-TRUTH pattern page the deterministic reader set aside, the
 * AI answering instructions / overview 0.99 — it must stay a question (status 'suggest', never set
 * aside by itself): a full-size sheet on another format, a text-heavy pattern sheet, a sheet
 * without the tile chrome, a file of one page (no tile grid), a smaller-size sheet (the tiles'
 * pieces at 0.85).
 */
async function mutationsSection() {
  const run = (
    label: string,
    docs: SourceDoc[],
    classes: PageClassification[],
    target: { file: string; page: number },
    role: 'instructions' | 'overview',
  ) => {
    const cls = classes.map((c) =>
      c.file === target.file && c.page === target.page
        ? {
            file: c.file,
            page: c.page,
            cls: 'instructions' as const,
            confidence: 0.8,
            why: 'MUTATION: set aside by the reader',
          }
        : c,
    );
    const out = cleanPages(docs, cls, {
      edits: [],
      aiHints: { pages: [{ ...target, role, confidence: 0.99, evidence: ['MUTATION'] }] },
    });
    const d = out.dropped.find((x) => x.file === target.file && x.page === target.page);
    // STOPS: the page-ink reading (no AI) never explains a real pattern page's line work
    check(
      'mutation',
      `${label}: the page-ink reading does not explain its line work`,
      !!d && !d.ink?.explained,
      d?.ink ?? 'not dropped',
    );
    check(
      'mutation',
      `${label}: AI ${role} 0.99 on a real pattern page → still a question`,
      !!d && d.status === 'suggest' && !d.aiAside,
      d
        ? { status: d.status, aiAside: d.aiAside, exclusion: d.exclusion, geo: d.geo }
        : 'not dropped',
    );
  };
  // robe: tiles 170×257; p20 is a real tile (page-truth)
  {
    const { s, docs, classes } = await docsOf('pdf/robe.pdf');
    const doc = docs[0];
    const i = doc.pages.findIndex((p) => p.page === 19);
    check(
      'mutation',
      'robe p20 is a ground-truth pattern page',
      truthOf('robe.pdf', 20) === 'pattern',
      '',
    );
    const real = doc.pages[i];
    // 1 · a full-size sheet on another format (A3 paper, the same 1:1 line work)
    doc.pages[i] = clonePage(real, { widthMm: 420, heightMm: 297 });
    run(
      'a full-size sheet on another format',
      docs,
      classes,
      { file: '0', page: 19 },
      'instructions',
    );
    // 2 · a text-heavy pattern sheet: the instruction page's words printed on the tile
    const words = doc.pages.find((p) => p.page === 3)!.texts;
    doc.pages[i] = clonePage(real, {
      texts: [...real.texts, ...words.map((t, k) => ({ ...t, id: 900000 + k }))],
    });
    run('a text-heavy pattern sheet', docs, classes, { file: '0', page: 19 }, 'instructions');
    // the same two out of reach of the registration guard: alone in a second file (no tiles)
    const alone: [string, IRPage][] = [
      [
        'a full-size sheet on another format, alone in its file',
        clonePage(real, { file: '1', page: 0, widthMm: 420, heightMm: 297 }),
      ],
      [
        'a text-heavy pattern sheet, alone in its file',
        clonePage(real, {
          file: '1',
          page: 0,
          texts: words.map((t, k) => ({ ...t, id: 900000 + k })),
        }),
      ],
    ];
    for (const [label, pg] of alone)
      run(
        label,
        [...docs, { ...doc, file: { ...doc.file, id: '1' }, pages: [pg] }],
        [...classes, { file: '1', page: 0, cls: 'tile', confidence: 0.9, why: 'single page' }],
        { file: '1', page: 0 },
        'instructions',
      );
    doc.pages[i] = real;
    s.close();
  }
  // reef: tiles carry chrome (corner marks, frame); p10 is a real tile — its chrome removed
  {
    const { s, docs, classes, base } = await docsOf('pdf/reef.pdf');
    const doc = docs[0];
    const i = doc.pages.findIndex((p) => p.page === 9);
    check(
      'mutation',
      'reef p10 is a ground-truth pattern page',
      truthOf('reef.pdf', 10) === 'pattern',
      '',
    );
    const chrome = new Set(
      (base.pages.find((p) => p.page === 9)?.items ?? [])
        .filter((it) => ['tile-frame', 'regmark', 'tile-label'].includes(it.kind))
        .flatMap((it) => it.paths),
    );
    check('mutation', 'reef p10 carries tile chrome to remove', chrome.size > 0, chrome.size);
    doc.pages[i] = clonePage(doc.pages[i], {
      paths: doc.pages[i].paths.filter((p) => !chrome.has(p.id)),
    });
    run('a sheet without the tile chrome', docs, classes, { file: '0', page: 9 }, 'instructions');
    s.close();
  }
  // blazer: real tiles with whole pieces on them (p12: 3 piece-sized outlines)
  {
    const { s, docs, classes } = await docsOf('pdf/blazer.pdf');
    const doc = docs[0];
    const real = doc.pages.find((p) => p.page === 11)!;
    check(
      'mutation',
      'blazer p12 is a ground-truth pattern page',
      truthOf('blazer.pdf', 12) === 'pattern',
      '',
    );
    // 4 · a file of ONE page (no tile grid): the real sheet alone
    run(
      'a one-page file (no tile grid)',
      [{ ...doc, pages: [clonePage(real, { page: 0 })] }],
      [{ file: '0', page: 0, cls: 'tile', confidence: 0.9, why: 'single page' }],
      { file: '0', page: 0 },
      'overview',
    );
    // 5 · a smaller-size sheet: the same pieces at 0.85 (a smaller garment size, not a reduced copy)
    const k = 0.85;
    const i = doc.pages.findIndex((p) => p.page === 11);
    doc.pages[i] = clonePage(real, {
      paths: real.paths.map((p) => ({ ...p, pts: p.pts.map((q) => ({ x: q.x * k, y: q.y * k })) })),
    });
    run(
      'a smaller-size sheet (pieces at 0.85)',
      docs,
      classes,
      { file: '0', page: 11 },
      'overview',
    );
    // 0.6: inside what a reduced copy may match (≤ 0.7), above the rule's 0.5 — the bound keeps it
    const k2 = 0.6;
    doc.pages[i] = clonePage(real, {
      paths: real.paths.map((p) => ({
        ...p,
        pts: p.pts.map((q) => ({ x: q.x * k2, y: q.y * k2 })),
      })),
    });
    run('a smaller-size sheet (pieces at 0.6)', docs, classes, { file: '0', page: 11 }, 'overview');
    // Codex re-check #1: a real pattern sheet at 1:2, its pieces uniformly reduced — a question
    doc.pages[i] = clonePage(real, {
      paths: real.paths.map((p) => ({
        ...p,
        pts: p.pts.map((q) => ({ x: q.x * 0.5, y: q.y * 0.5 })),
      })),
    });
    run(
      'a pattern sheet at 0.5 (pieces uniformly reduced)',
      docs,
      classes,
      { file: '0', page: 11 },
      'overview',
    );
    doc.pages[i] = real;
    s.close();
  }
}

/**
 * Codex re-check #3: the pieces of a reduced copy are counted only inside the accepted scale
 * cluster. Four copies of ONE tile piece at 0.30 + a DIFFERENT piece at 0.60: one piece at the
 * copy's scale, and a piece-sized outline outside it — no exclusion (MUTATION: a real page the AI
 * calls an overview 0.99 stays a question). Control: both pieces at 0.30 — a reduced copy.
 */
function clusterSection() {
  const A = { hu: [1, 2, 3, 4], areaMm2: 40000 };
  const B = { hu: [5, 6, 7, 8], areaMm2: 40000 };
  const tiles = [A, A, A, A, B].map((t) => ({ ...t, hu: [...t.hu] }));
  const at = (t: typeof A, k: number) => ({ hu: [...t.hu], areaMm2: t.areaMm2 * k * k });
  const st = {
    file: '0',
    page: 0,
    widthMm: 210,
    heightMm: 297,
    lineLengthM: 5,
    pieceSizedOutlines: 5,
    textChars: 0,
    textExcerpt: '',
  };
  // the page draws a piece-sized closed outline (so rule (b) cannot apply: only the copy decides)
  const sq = [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 60 },
    { x: 0, y: 60 },
  ];
  const pc = {
    chains: [{ closed: true, pts: sq, lengthMm: 240 }],
  } as unknown as Parameters<typeof exclusionOf>[0];
  const mixed = reducedCopy(
    [at(A, 0.3), at(A, 0.3), at(A, 0.3), at(A, 0.3), at(B, 0.6)],
    tiles,
    PATIMPORT.minPieceAreaMm2,
  );
  check(
    'synthetic',
    'cluster: 4 × piece A at 0.30 + piece B at 0.60 → 1 piece in the cluster, B outside it',
    !!mixed && mixed.scale === 0.3 && mixed.pieces === 1 && mixed.clustered === false,
    mixed,
  );
  const ex = exclusionOf(pc, st, mixed, 'apart');
  check(
    'mutation',
    'cluster: that page with the AI at overview 0.99 → no exclusion (a question)',
    ex === null && !aiAsides({ status: 'suggest' }, { role: 'overview', confidence: 0.99 }, ex),
    { mixed, ex },
  );
  const both = reducedCopy(
    [at(A, 0.3), at(A, 0.3), at(A, 0.3), at(B, 0.3)],
    tiles,
    PATIMPORT.minPieceAreaMm2,
  );
  check(
    'synthetic',
    'cluster control: A and B both at 0.30 → a reduced copy of 2 pieces',
    !!both &&
      both.pieces === 2 &&
      both.clustered === true &&
      exclusionOf(pc, st, both, 'apart') !== null,
    both,
  );
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === 'cluster') {
    clusterSection();
    for (const c of checks)
      console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.file} · ${c.check} · ${c.got.slice(0, 300)}`);
    return checks.every((c) => c.ok) ? 0 : 1;
  }
  if (args[0] === 'discard') {
    await discardSection();
    for (const c of checks)
      console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.file} · ${c.check} · ${c.got.slice(0, 300)}`);
    return checks.every((c) => c.ok) ? 0 : 1;
  }
  if (args[0] === 'mutations') {
    await mutationsSection();
    for (const c of checks)
      console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.file} · ${c.check} · ${c.got.slice(0, 300)}`);
    return checks.every((c) => c.ok) ? 0 : 1;
  }
  if (args[0] === 'stale') {
    await staleSection(args[1] ?? 'robe.pdf');
    for (const c of checks)
      console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.file} · ${c.check} · ${c.got.slice(0, 300)}`);
    return checks.every((c) => c.ok) ? 0 : 1;
  }
  if (args[0] === 'ink') {
    // the page reading's truth + mutations on any PDFs (absolute paths: the golden Mood files)
    for (const f of args.slice(1)) {
      const s = open(isAbsolute(f) ? f : `pdf/${f}`);
      try {
        await s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx);
        inkChecks(basename(f), s, await s.runStage('clean', { edits: [] }, ctx));
      } catch (e) {
        check(f, 'runs', false, String((e as Error)?.stack ?? e).slice(0, 300));
      }
      s.close();
    }
    for (const r of INK_ROWS)
      console.log(
        `ink ${r.file.slice(0, 40).padEnd(40)} asked ${r.asked} · explained ${r.explained.join(',') || '—'}${r.unexplained.length ? ` · still a question: ${r.unexplained.map((u) => u.slice(0, 140)).join(' | ')}` : ''}`,
      );
    for (const c of checks)
      console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.file} · ${c.check} · ${c.got.slice(0, 300)}`);
    return checks.every((c) => c.ok) ? 0 : 1;
  }
  if (args[0] === 'dump') {
    await dump(args.slice(1));
    return 0;
  }
  const files = args.length
    ? args
    : readdirSync(resolve(CORPUS, 'pdf'))
        .filter((f) => f.endsWith('.pdf'))
        .sort();
  const rows = [];
  if (!args.length) await staleSection('robe.pdf');
  await discardSection();
  clusterSection();
  if (!args.length) await mutationsSection();
  for (const f of files) {
    const t = Date.now();
    try {
      const r = await oneFile(f);
      rows.push(r);
      console.log(
        `${f.padEnd(28)} ${((Date.now() - t) / 1000).toFixed(1).padStart(6)}s ${r.called ? `called · sent ${r.sent} · asked ${r.asked?.join(',')} · AI+geometry aside ${r.aside?.join(',') || '—'} · still a question ${r.still?.join(' ') || '—'}` : 'no call (no page set aside holds line work)'}`,
      );
    } catch (e) {
      check(f, 'runs', false, String((e as Error)?.stack ?? e).slice(0, 300));
    }
  }
  for (const r of INK_ROWS)
    console.log(
      `ink ${r.file.padEnd(28)} asked ${r.asked} · explained ${r.explained.join(',') || '—'}${r.unexplained.length ? ` · still a question: ${r.unexplained.map((u) => u.slice(0, 140)).join(' | ')}` : ''}`,
    );
  const bad = checks.filter((c) => !c.ok);
  for (const c of bad) console.log(`FAIL ${c.file} · ${c.check} · ${c.got.slice(0, 400)}`);
  console.log(`\n${checks.length - bad.length}/${checks.length} checks pass`);
  return bad.length ? 1 : 0;
}
