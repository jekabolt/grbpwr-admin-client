// PATTERN-IMPORT · `asks` metric entry (bundled by asks.mjs). One PDF in, ONE `@@RESULT` line out:
//   { name, card, verdict: 'apply' | 'stopped' | 'crashed', stop?: { step, reason }, ticks, ms }
// The REAL wizard hook, driven by the autopilot (autopilot-entry.ts `runCase`), on a card whose
// sizes are the ones the file's own legend reads (detectSizeRun) — so a stop is a question the
// file asks, not a card that does not match it. `asks` = 0 when the run reaches apply, else the
// first stop the operator would have to answer (step + reason).
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { DEFAULT_EXTRACT_OPTS, extractPdf } from 'lib/pattern-import/adapters/pdf';
import { assembleSheet, classifyPages } from 'lib/pattern-import/assemble';
import { buildChainsDetailed } from 'lib/pattern-import/chains/build';
import { detectSizeRun } from 'lib/pattern-import/sizes/detect';
import { PATIMPORT } from 'lib/pattern-import/types';

import { runCase } from './autopilot-entry';

/** The size labels the file's legend reads, in rank order (the card the file asks for). */
async function sizesOf(pdf: string): Promise<string[]> {
  const b = readFileSync(pdf);
  const name = basename(pdf);
  const doc = await extractPdf(
    {
      id: '0',
      name,
      bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    },
    DEFAULT_EXTRACT_OPTS,
  );
  const docs = [doc];
  const sheet = assembleSheet(docs, classifyPages(docs), 0);
  const { set } = buildChainsDetailed(
    sheet,
    {
      joinGapMm: PATIMPORT.joinGapMm,
      joinAngleDeg: PATIMPORT.joinAngleDeg,
      joinLateralMm: PATIMPORT.joinLateralMm,
    },
    {
      extraTexts: doc.pages.flatMap((p) => p.texts.map((t) => t.text)),
      fileNames: new Map([['0', name]]),
    },
  );
  return detectSizeRun(sheet, set, [doc.file])
    .sizes.map((s) => s.label)
    .filter(Boolean);
}

export async function main(argv: string[]): Promise<number> {
  const pdf = argv[0];
  const name = basename(pdf);
  const t0 = Date.now();
  let out: Record<string, unknown>;
  try {
    const labels = await sizesOf(pdf);
    // a file whose legend reads no size: a one-size card, the autopilot's own default
    const card = labels.length ? labels : ['M'];
    const r = (await runCase({ id: name, group: 'pdf', files: [pdf], card }, null)) as Record<
      string,
      unknown
    >;
    out = {
      name,
      card,
      verdict: r.verdict,
      stop: r.stop ?? null,
      ticks: r.ticks ?? null,
      trace: r.trace ?? null,
      error: r.error ?? null,
    };
  } catch (e) {
    out = { name, verdict: 'crashed', error: String((e as Error)?.stack ?? e).slice(0, 600) };
  }
  out.ms = Date.now() - t0;
  console.log(`@@RESULT ${JSON.stringify(out)}`);
  return 0;
}
