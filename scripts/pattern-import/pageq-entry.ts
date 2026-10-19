// PATTERN-IMPORT · PAGEQ probe (child) — the files step's page-role question on ONE PDF, no AI:
// extract + clean as the wizard hook runs them, then per page set aside "to check" the autopilot's
// evidence that it is not pattern (policy.ts `notPatternEvidence`).
//   live:   main([abs.pdf, rel])  → one line "@@PAGEQ {…}"; with PAGEQ_CACHE=<dir> it also keeps
//           the page-ink inputs of every page read (clean/page-ink.ts PAGE_INK_TAP) + the policy's
//           inputs, gzipped, so the reading can be replayed on them in seconds;
//   replay: main(['--replay', cacheDir, out.jsonl]) → the same records from the cache with the
//           CURRENT page-ink + policy code (exact as long as only those two changed).
// PAGEQ_DIAG=1: every unexplained line of a page asked about. Driven by pageq.mjs.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Session } from 'lib/pattern-import/worker/session';
import { pageChains } from 'lib/pattern-import/clean/page-chains';
import { PAGE_INK_TAP, pageInk, pageInkItems, type Pen } from 'lib/pattern-import/clean/page-ink';
import type { Shape } from 'lib/pattern-import/clean/reduced-copy';
import { PATIMPORT } from 'lib/pattern-import/types';
import type {
  CleanOutput,
  ImportSession,
  IRPage,
  PageClassification,
} from 'lib/pattern-import/types';
import { notPatternEvidence } from 'components/managers/tech-card/components/pattern-import/autopilot/policy';
// the e2e entry installs pdf.js' legacy build (setPdfjsLoader)
import './e2e-entry';

const ctx = { checkCancel: () => {}, progress: () => {} };

type Dropped = CleanOutput['dropped'][number];
type Tapped = { pg: IRPage; pens: readonly Pen[]; shapes: readonly Shape[] };
type Cache = {
  file: string;
  pages: number;
  tiles: number;
  classes: PageClassification[];
  dropped: Dropped[];
  /** Per page read by page-ink (key "file:page"): the page, the file's tile pens and shapes. */
  ink: Record<string, { pg: IRPage; pens: number; shapes: number }>;
  pens: (readonly Pen[])[];
  shapes: (readonly Shape[])[];
};

/** The record of one file: per page asked about, the evidence (or none = the question). */
function recordOf(
  file: string,
  classes: PageClassification[],
  dropped: Dropped[],
  diag: (d: Dropped) => string[],
) {
  const pages = classes as unknown as ImportSession['pages'];
  const check = dropped.filter((d) => d.status === 'suggest');
  const asked = check.map((d) => {
    const c = classes.find((p) => p.file === d.file && p.page === d.page);
    const ev = notPatternEvidence(d as never, pages);
    return {
      p: d.page + 1,
      cls: d.cls,
      conf: c?.confidence ?? null,
      ink: c?.ink ? { m: c.ink.strokeM, t: c.ink.texts, r: c.ink.raster } : null,
      face: !!d.face,
      copy: d.reducedCopy ?? null,
      ev,
      explained: d.ink?.explained ?? null,
      unexplained: d.ink?.unexplained ?? null,
      ...(ev || !process.env.PAGEQ_DIAG ? {} : { all: diag(d).slice(0, 12) }),
    };
  });
  const blind = asked.find((x) => !x.ev);
  return { file, asked, question: blind ? blind.p : null };
}

async function live(file: string, rel: string) {
  const t0 = Date.now();
  const b = readFileSync(file);
  const s = new Session(1, [
    {
      name: basename(file),
      bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    },
  ]);
  const tapped = new Map<string, Tapped>();
  PAGE_INK_TAP.fn = (pc, pens, shapes) =>
    tapped.set(`${pc.page.file}:${pc.page.page}`, { pg: pc.page, pens, shapes });
  let rec: Record<string, unknown> = { file: rel };
  try {
    await s.runStage('extract', { opts: { sagittaMm: PATIMPORT.sagittaMm, keepFills: true } }, ctx);
    const cl = await s.runStage('clean', { edits: [] }, ctx);
    const diag = (d: Dropped) => {
      const t = tapped.get(`${d.file}:${d.page}`);
      if (!t) return [];
      return pageInkItems(pageChains(t.pg), t.pens, t.shapes, t.pg)
        .filter((x) => !x.kind)
        .map((x) => x.why ?? 'unexplained');
    };
    rec = {
      ...recordOf(rel, cl.classes, cl.dropped, diag),
      pages: cl.classes.length,
      tiles: cl.classes.filter((c) => c.cls === 'tile').length,
    };
    if (process.env.PAGEQ_CACHE) {
      const pens: (readonly Pen[])[] = [];
      const shapes: (readonly Shape[])[] = [];
      const ink: Cache['ink'] = {};
      for (const [k, t] of tapped) {
        let pi = pens.indexOf(t.pens);
        if (pi < 0) pi = pens.push(t.pens) - 1;
        let si = shapes.indexOf(t.shapes);
        if (si < 0) si = shapes.push(t.shapes) - 1;
        ink[k] = { pg: t.pg, pens: pi, shapes: si };
      }
      const cache: Cache = {
        file: rel,
        pages: cl.classes.length,
        tiles: rec.tiles as number,
        classes: cl.classes,
        dropped: cl.dropped.map((d) => {
          const { ink: _ink, ...rest } = d;
          return rest as Dropped;
        }),
        ink,
        pens,
        shapes,
      };
      const name = rel.replace(/[^\w.-]+/g, '_').slice(-180);
      writeFileSync(
        resolve(process.env.PAGEQ_CACHE, `${name}.json.gz`),
        gzipSync(JSON.stringify(cache)),
      );
    }
  } catch (e) {
    rec.error = String((e as Error)?.stack ?? e).slice(0, 400);
  }
  rec.ms = Date.now() - t0;
  PAGE_INK_TAP.fn = null;
  s.close();
  console.log(`@@PAGEQ ${JSON.stringify(rec)}`);
}

/** The clean stage's page reading re-run on a cached file (clean/index.ts `inkPass`). */
function replayOne(c: Cache) {
  const dropped = c.dropped.map((d) => ({ ...d }));
  for (const d of dropped) {
    const t = c.ink[`${d.file}:${d.page}`];
    if (d.status !== 'suggest' || !t) continue;
    const r = pageInk(pageChains(t.pg), c.pens[t.pens], c.shapes[t.shapes], t.pg);
    d.ink = {
      ...(r.explained ? { explained: r.explained } : {}),
      ...(r.unexplained ? { unexplained: r.unexplained } : {}),
    };
  }
  const diag = (d: Dropped) => {
    const t = c.ink[`${d.file}:${d.page}`];
    if (!t) return [];
    return pageInkItems(pageChains(t.pg), c.pens[t.pens], c.shapes[t.shapes], t.pg)
      .filter((x) => !x.kind)
      .map((x) => x.why ?? 'unexplained');
  };
  return { ...recordOf(c.file, c.classes, dropped, diag), pages: c.pages, tiles: c.tiles };
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === '--replay') {
    const [, dir, out] = args;
    const only = args.slice(3);
    const lines: string[] = [];
    for (const f of readdirSync(dir)
      .filter((x) => x.endsWith('.json.gz'))
      .sort()) {
      const c = JSON.parse(gunzipSync(readFileSync(resolve(dir, f))).toString()) as Cache;
      if (only.length && !only.some((o) => c.file.includes(o))) continue;
      try {
        lines.push(JSON.stringify(replayOne(c)));
      } catch (e) {
        lines.push(JSON.stringify({ file: c.file, error: String(e).slice(0, 300) }));
      }
    }
    writeFileSync(out, lines.join('\n') + '\n');
    console.log(`replayed ${lines.length} → ${out}`);
    return 0;
  }
  await live(args[0], args[1] ?? args[0]);
  return 0;
}
