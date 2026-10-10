// sizes/ — the source size run from a built ChainSet (DetectSizeRunFn; detection shared F3 → F5).
//
// buildChains already decided the encoding and ranked the size classes; this reads the run back
// off the classes: one SourceSize per role-'size' class in rank order (nesting-order evidence),
// labels from the class (legend/text/OCG/file), file labels for file-per-size sources, and
// 'single' when nothing was ranked. Text evidence = runs found in the sheet's text.
import type { ChainSet, DetectSizeRunFn, SizeEncoding, SourceSize } from 'lib/pattern-import/types';

import { rankOfClass } from '../chains/build';
import { fileSizeLabel } from './recover';
import { runsInText } from './tokens';

const ENCODINGS: SizeEncoding[] = [
  'ocg',
  'declared-dash',
  'subpath-dash',
  'separate-dash',
  'color',
  'file-per-size',
  'text-label',
  'dxf-block',
  'single',
];

/** Encoding as buildChains recorded it ("size encoding X, n sizes"), else from class evidence. */
function encodingOf(set: ChainSet): SizeEncoding {
  for (const w of set.warnings) {
    const m = w.match(/size encoding ([a-z-]+)/);
    if (m && (ENCODINGS as string[]).includes(m[1])) return m[1] as SizeEncoding;
  }
  const kinds = new Set(
    set.classes.filter((c) => c.role === 'size').flatMap((c) => c.evidence.map((e) => e.kind)),
  );
  if (kinds.has('ocg')) return 'ocg';
  if (kinds.has('file')) return 'file-per-size';
  if (kinds.has('color')) return 'color';
  if (kinds.has('declared-dash')) return 'declared-dash';
  if (kinds.has('text-label')) return 'text-label';
  if (kinds.has('recovered-motif')) return 'separate-dash';
  return 'single';
}

export const detectSizeRun: DetectSizeRunFn = (sheet, set, files) => {
  const sizeClasses = set.classes
    .filter((c) => c.role === 'size')
    .map((c, k) => ({ c, rank: rankOfClass(c) ?? k }))
    .sort((a, b) => a.rank - b.rank);
  const evidence = runsInText(sheet.texts.map((t) => t.text))
    .filter((r) => r.keyword || r.kind === 'legend')
    .map((r) => r.source);
  if (!sizeClasses.length) {
    const label = files.length === 1 ? fileSizeLabel(files[0].name) : null;
    return {
      encoding: 'single',
      sizes: [
        {
          label: label ?? '',
          rank: 0,
          classId: null,
          file: files.length === 1 ? files[0].id : null,
        },
      ],
      evidence,
    };
  }
  const encoding = encodingOf(set);
  const sizes: SourceSize[] = sizeClasses.map(({ c }, rank) => {
    const fileEv = c.evidence.find((e) => e.kind === 'file');
    const file = fileEv && fileEv.kind === 'file' ? fileEv.file : null;
    const fromFile =
      file != null ? fileSizeLabel(files.find((f) => f.id === file)?.name ?? '') : null;
    return { label: c.sizeLabel ?? fromFile ?? '', rank, classId: c.id, file };
  });
  return { encoding, sizes, evidence };
};
