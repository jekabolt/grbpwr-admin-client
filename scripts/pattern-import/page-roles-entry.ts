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
import { readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { Session } from 'lib/pattern-import/worker/session';
import {
  classifyFilePages,
  clearPageRoleCache,
  pagesForCall,
  type PageRoleDeps,
} from 'lib/pattern-import/ai/pages';
import { AI_PAGES } from 'lib/pattern-import/clean/page-roles';
import type {
  AiPageHint,
  IRPage,
  PageClassification,
  SourceDoc,
  StageIO,
} from 'lib/pattern-import/types';
import { applyMasks, cleanPages } from 'lib/pattern-import/clean';
// the e2e entry installs pdf.js' legacy build (setPdfjsLoader)
import './e2e-entry';
import { fixturePageRoleDeps } from './page-roles-fixture';
import { mountHook, rerender } from './react-hook-shim';
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

/** Codex #5: every uploaded thumbnail is deleted after the call — answered or failed. */
async function discardSection() {
  for (const fails of [false, true]) {
    const up: number[] = [];
    const gone: number[] = [];
    let n = 100;
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
      { key: `discard:${fails}`, file: '0', fileName: 'x.pdf', thumbs },
      {
        upload: async () => {
          up.push(++n);
          return n;
        },
        classify: async () => {
          if (fails) throw new Error('server down');
          return { pages: [{ pageNo: 1, role: 'cover', confidence: 0.9, evidence: [] }] };
        },
        discard: async (ids) => gone.push(...ids),
      },
    );
    await new Promise((res) => setTimeout(res, 0));
    check(
      'synthetic',
      `every uploaded thumbnail is deleted after the call (${fails ? 'the call failed' : 'answered'})`,
      up.length === 3 &&
        JSON.stringify([...gone].sort()) === JSON.stringify([...up].sort()) &&
        r.status === (fails ? 'error' : 'ok'),
      { up, gone, status: r.status },
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
    doc.pages[i] = real;
    s.close();
  }
}

export async function main(args: string[]): Promise<number> {
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
  const bad = checks.filter((c) => !c.ok);
  for (const c of bad) console.log(`FAIL ${c.file} · ${c.check} · ${c.got.slice(0, 400)}`);
  console.log(`\n${checks.length - bad.length}/${checks.length} checks pass`);
  return bad.length ? 1 : 0;
}
