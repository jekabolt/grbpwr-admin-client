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

export async function main(args: string[]): Promise<number> {
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
