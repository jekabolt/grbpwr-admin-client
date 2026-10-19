// File-per-size sets (Redcafe 44…54, wm XS…XXXL): N PDFs → N SourceDocs in one session, ids
// '0'…'N-1' in the order given (the contract's FileId = 0-based index as string). Merging the
// sizes into one sheet/DXF is downstream (F2/F3/F5); here: extraction with one progress bar and a
// scale check ACROSS the set — files of one set printed at different scales must not be merged
// silently.

import type { ExtractOpts, Progress, ScaleCandidate, SourceDoc } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { extractPdfWith, type ExtractPdfDeps } from './extract';
import { detectScale } from './scale';

export async function extractPdfSet(
  files: { name: string; bytes: ArrayBuffer }[],
  opts: ExtractOpts,
  progress?: Progress,
  deps: ExtractPdfDeps = {},
): Promise<SourceDoc[]> {
  const docs: SourceDoc[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const doc = await extractPdfWith(
      { id: String(i), name: f.name, bytes: f.bytes },
      opts,
      progress &&
        ((done, total, note) =>
          progress(
            i * 1000 + (done / Math.max(1, total)) * 1000,
            files.length * 1000,
            `${f.name}: ${note ?? ''}`,
          )),
      deps,
    );
    docs.push(doc);
  }
  progress?.(files.length * 1000, files.length * 1000);
  return docs;
}

export type SetScale = {
  /** Best candidate per file, in file order. */
  perFile: ScaleCandidate[];
  /** All files' best factors agree within PATIMPORT.scaleWarnRatio. */
  consistent: boolean;
  warnings: string[];
};

export function detectScaleSet(docs: SourceDoc[]): SetScale {
  const perFile = docs.map((d) => detectScale(d)[0]);
  const warnings: string[] = [];
  const found = perFile.filter((c) => c.method !== 'none');
  let consistent = true;
  if (found.length) {
    const f0 = found[0].factor;
    for (let i = 0; i < perFile.length; i++) {
      const c = perFile[i];
      if (c.method === 'none') {
        warnings.push(`${docs[i].file.name}: no scale evidence — assumed same as the set`);
      } else if (Math.abs(c.factor / f0 - 1) > PATIMPORT.scaleWarnRatio) {
        consistent = false;
        warnings.push(
          `${docs[i].file.name}: factor ${c.factor.toFixed(5)} ≠ ${f0.toFixed(5)} of ${docs[0].file.name}`,
        );
      }
    }
  }
  return { perFile, consistent, warnings };
}
