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
import type { AiPageHint, StageIO } from 'lib/pattern-import/types';
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

export async function main(args: string[]): Promise<number> {
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
