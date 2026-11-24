// PATTERN-IMPORT · regression census entry (bundled by regress.mjs). One PDF in, ONE JSON line out:
//   { name, error?, sizeRows, emptyRows, litOpenCard, notClosed?, total? }
// Real pipeline: extract (cached) → classifyPages + assembleSheet → buildChainsDetailed →
// detectSizeRun → (FILL=1) proposeSeeds + fill. What it counts:
//   emptyRows    size rows of the legend with no line (`size-empty`)
//   litOpenCard  free ends the sizes step leaves open on the first four rows (litOutline)
//   notClosed    sizes the fill did not close, of `total`, over the pieces that close on some size;
//                `junkSeeds` are the seeds that close on none (not counted), `wholePieces` close on all
//                (FILL=1 only)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { litOutline } from 'components/managers/tech-card/components/pattern-import/steps/borrowed-edges';
import {
  DEFAULT_EXTRACT_OPTS,
  extractPdf,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import { assembleSheet, classifyPages } from 'lib/pattern-import/assemble';
import { buildChainsDetailed } from 'lib/pattern-import/chains/build';
import { proposeSeeds } from 'lib/pattern-import/pieces';
import { detectSizeRun } from 'lib/pattern-import/sizes/detect';
import type { SourceDoc } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { fillSample } from './pieces-run';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);

export async function main(argv: string[]) {
  const pdf = argv[0];
  const name = basename(pdf);
  const cache = resolve(process.env.REGRESS_CACHE ?? '/tmp/patimport-regress-cache');
  const cp = resolve(cache, `${name.replace(/\W+/g, '_')}.json`);
  const out: Record<string, unknown> = { name };
  try {
    let doc: SourceDoc;
    if (existsSync(cp)) doc = JSON.parse(readFileSync(cp, 'utf8')) as SourceDoc;
    else {
      const b = readFileSync(pdf);
      doc = await extractPdf(
        {
          id: '0',
          name,
          bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
        },
        DEFAULT_EXTRACT_OPTS,
      );
      writeFileSync(cp, JSON.stringify(doc));
    }
    const docs = [doc];
    const sheet = assembleSheet(docs, classifyPages(docs), 0);
    const texts = doc.pages.flatMap((p) => p.texts.map((t) => t.text));
    const { set, recover } = buildChainsDetailed(
      sheet,
      {
        joinGapMm: PATIMPORT.joinGapMm,
        joinAngleDeg: PATIMPORT.joinAngleDeg,
        joinLateralMm: PATIMPORT.joinLateralMm,
      },
      { extraTexts: texts, fileNames: new Map([['0', name]]) },
    );
    const run = detectSizeRun(sheet, set, [doc.file]);
    const rows = set.classes.filter((c) => c.role === 'size');
    const preview = set.chains.map((c) => Float32Array.from(c.pts.flatMap((p) => [p.x, p.y])));
    out.chains = set.chains.length;
    // dashes of size lines taken in by sizes/dash-train.ts (0 when the rule is off or finds none)
    out.dashTrains = (recover.diag.dashTrains as number | undefined) ?? 0;
    out.sizeRows = rows.length;
    // a size row of the legend with no line (not the reader's warning: that can be stale)
    out.emptyRows = rows.filter((r) => r.chains.length === 0).length;
    out.litOpenCard = rows
      .slice(0, 4)
      .reduce((a, r) => a + litOutline(set, preview, r).open.length, 0);
    if (process.env.FILL) {
      const seeds = proposeSeeds(sheet, set);
      const prep = {
        sample: { id: name, files: [name], sheet: 0 },
        sheet,
        set,
        run,
        docTexts: texts,
        files: [{ id: '0', name }],
        ms: { assemble: 0, chains: 0 },
      };
      const sr = fillSample(prep as never, seeds, null);
      // judged by the pieces that close on some size: a seed that closes on NO size is not a piece
      // the lines draw (a point put outside every outline), its leaks are not gaps
      let total = 0;
      let bad = 0;
      let junk = 0;
      let pieces = 0;
      let whole = 0;
      for (const f of sr.families) {
        const closed = f.candidates.filter((c) => c.outcome === 'closed').length;
        if (closed === 0) {
          junk++;
          continue;
        }
        pieces++;
        if (closed === f.candidates.length) whole++;
        total += f.candidates.length;
        bad += f.candidates.length - closed;
      }
      out.pieces = pieces;
      out.wholePieces = whole;
      out.junkSeeds = junk;
      out.notClosed = bad;
      out.total = total;
    }
  } catch (e) {
    out.error = String((e as Error).message ?? e).slice(0, 120);
  }
  console.log(`REGRESS ${JSON.stringify(out)}`);
}
