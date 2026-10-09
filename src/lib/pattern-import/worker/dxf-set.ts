// A SET of DXF files, one per size (owner decision 5: "file per size → merge into one DXF").
//
// CLO exports the seam allowance only for the current size, so the working habit is one export per
// size: `jacket_XS.dxf` … `jacket_XL.dxf`, each with the same pieces (`BP_XS`, `FP_R_XS`, …). The
// card already merges such a set (`lib/nesting/dxf/merge.ts`, the "merge sizes" door); the importer
// reuses that merger verbatim, so the set becomes ONE graded drawing and the rest of the run is the
// ordinary DXF fast path (blocks → pieces × sizes). What this module adds is the intake contract:
//
//   - every file is ONE size. The size is read from the blocks (all of them end in the same size
//     token), else from the file name (`fileSizeLabel`, the PDF set's reader), else it is unknown:
//     the file gets a placeholder size and the sizes step asks the operator which card size it is.
//     Blocks without a size token are renamed `NAME` → `NAME_<size>` before the merge, so the
//     merged drawing spells its sizes the way the DXF reader expects them.
//   - refused, with the reason in words: a file that carries several sizes, two files of one size
//     (CLO repeating the previous size), files that do not carry the same pieces, R12 / binary files
//     (the merger rewrites R2000 handles and refuses to invent them), mixed drawing units.
//   - after the merged drawing is read, `settleDxfSet` checks the reader saw exactly one size per
//     file, distinct across files — the claim the run rests on, proved on what was actually read.
//
// Positions are kept as drawn (inserts at the origin, no per-size offsets): per-size CLO exports
// share one frame, and nothing downstream measures one size against another's position.
import type { FileId, SizeMap, CardSize, LineClass } from '../types';
import { decodeDxfBytes, encodeDxfBytes, mergeDxfSheets } from 'lib/nesting/dxf/merge';
import { bareSize } from '../adapters/dxf';
import type { DxfFastPath, DxfSegmentation } from '../adapters/dxf';
import { fileSizeLabel, parseSizeToken } from '../sizes';
import { ImportError } from './errors';

export type DxfSetFile = { id: FileId; name: string; bytes: ArrayBuffer };

/** How the size of one file of the set is known. */
export type DxfSetSizeSource = 'blocks' | 'file-name' | 'placeholder';

export type DxfSetSize = {
  file: FileId;
  name: string;
  /** Size token as the merged drawing spells it (upper-case, decoration stripped). */
  token: string;
  from: DxfSetSizeSource;
};

export type DxfSet = {
  /** Name of the merged drawing (the session reads it as one DXF). */
  name: string;
  bytes: Uint8Array;
  sizes: DxfSetSize[];
  /** Block name in the merged drawing → the file that brought it. */
  blockFile: Map<string, FileId>;
  /** Said on the files step: files whose size needs the operator, and the merger's own notes. */
  notes: string[];
};

const R2000_PLUS = new Set(['AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032']);

const refuse = (message: string) => new ImportError('unsupported-format', message);

/** A size token as the DXF reader takes it from a block-name tail (letters or 1–3 digits). */
function sizeTokenOf(raw: string): string | null {
  const t = bareSize(raw);
  return t && parseSizeToken(t, true) ? t : null;
}

type Scan = { version: string; blocks: string[] };

/** $ACADVER and the block names (anonymous `*` blocks left out) of an ASCII DXF. */
function scanDxf(text: string, name: string): Scan {
  if (text.startsWith('AutoCAD Binary DXF'))
    throw refuse(`${name}: a binary DXF; a set of sizes is merged from ASCII DXF exports only`);
  const lines = text.split('\n');
  let version = '';
  let section = '';
  let entity = '';
  let named = true;
  const blocks: string[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const raw = lines[i].trim();
    if (raw === '') break; // the trailing newline; a gap mid-file is the merger's to refuse
    const code = Number(raw);
    if (!Number.isInteger(code))
      throw refuse(`${name}: not an ASCII DXF: line ${i + 1} carries “${raw}” instead of a code`);
    const value = lines[i + 1].replace(/\r$/, '');
    if (code === 0) {
      entity = value.trim();
      if (entity === 'BLOCK' && section === 'BLOCKS') named = false;
      if (entity === 'ENDSEC') section = '';
      continue;
    }
    if (code === 2 && entity === 'SECTION') section = value.trim();
    else if (code === 9 && value.trim() === '$ACADVER' && section === 'HEADER')
      version = (lines[i + 3] ?? '').replace(/\r$/, '').trim();
    else if (code === 2 && entity === 'BLOCK' && !named) {
      named = true;
      if (!value.startsWith('*')) blocks.push(value);
    }
  }
  return { version, blocks };
}

/** Rename blocks in an ASCII DXF: the BLOCK itself, its BLOCK_RECORD and every INSERT of it. */
function renameBlocks(text: string, rename: Map<string, string>): string {
  if (!rename.size) return text;
  const lines = text.split('\n');
  let section = '';
  let entity = '';
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    const cr = lines[i + 1].endsWith('\r') ? '\r' : '';
    const value = lines[i + 1].replace(/\r$/, '');
    if (code === 0) {
      entity = value.trim();
      if (entity === 'ENDSEC') section = '';
      continue;
    }
    if (code === 2 && entity === 'SECTION') {
      section = value.trim();
      continue;
    }
    const target =
      (code === 2 && entity === 'INSERT') ||
      (code === 2 && entity === 'BLOCK_RECORD' && section === 'TABLES') ||
      ((code === 2 || code === 3) && entity === 'BLOCK' && section === 'BLOCKS');
    if (!target) continue;
    const to = rename.get(value);
    if (to != null) lines[i + 1] = to + cr;
  }
  return lines.join('\n');
}

/**
 * What one file says about its size: `size` when every block ends in the same size token;
 * `several` when one piece is drawn in more than one size (an all-sizes file, not a set member).
 */
function sizeOfBlocks(blocks: string[]): { size: string | null; several: string[] } {
  const parts = blocks.map((b) => b.split('_'));
  const byStem = new Map<string, Set<string>>();
  const stemsOf = new Map<string, Set<string>>();
  for (const p of parts) {
    if (p.length < 2) continue;
    const tok = sizeTokenOf(p[p.length - 1]);
    if (!tok) continue;
    const stem = p.slice(0, -1).join('_').toUpperCase();
    (byStem.get(stem) ?? byStem.set(stem, new Set()).get(stem)!).add(tok);
    (stemsOf.get(tok) ?? stemsOf.set(tok, new Set()).get(tok)!).add(stem);
  }
  // As the DXF reader decides it (segment.ts sizeTailsByName): a number is a size only when two
  // pieces share it — `BP_1`, `BP_2` alone are copy numbers of the back, not sizes 1 and 2.
  const sizeLike = (t: string) => /\D/.test(t) || (stemsOf.get(t)?.size ?? 0) >= 2;
  const several = [...byStem.values()]
    .map((s) => [...s].filter(sizeLike))
    .find((s) => s.length >= 2);
  if (several) return { size: null, several };
  if (!blocks.length || parts.some((p) => p.length < 2)) return { size: null, several: [] };
  const tails = new Set(parts.map((p) => sizeTokenOf(p[p.length - 1]) ?? ''));
  const [only] = [...tails];
  return { size: tails.size === 1 && only ? only : null, several: [] };
}

const list = (xs: string[], n = 6) =>
  xs.length > n ? `${xs.slice(0, n).join(', ')} and ${xs.length - n} more` : xs.join(', ');

/**
 * Merge a set of per-size DXF files into one drawing (refusals are `ImportError`s with the reason
 * for the operator). Pure and synchronous: it runs where the session opens.
 */
export function mergeDxfSet(files: DxfSetFile[]): DxfSet {
  const read = files.map((f) => {
    const text = decodeDxfBytes(f.bytes);
    return { ...f, text, scan: scanDxf(text, f.name) };
  });
  const old = read.filter((r) => !R2000_PLUS.has(r.scan.version));
  if (old.length)
    throw refuse(
      `${list(old.map((r) => `${r.name} (${r.scan.version || 'no version'})`))}: several DXF files are merged from AAMA R2000+ exports only (AC1015 and newer, as CLO gives them out per size). Export the sizes as R2000, or all sizes into one DXF`,
    );
  for (const r of read)
    if (!r.scan.blocks.length)
      throw refuse(
        `${r.name}: no blocks; a set of sizes is merged from per-piece (AAMA) exports, one block per piece`,
      );

  // the size of every file
  const notes: string[] = [];
  const decided = read.map((r) => {
    const own = sizeOfBlocks(r.scan.blocks);
    if (own.several.length)
      throw refuse(
        `${r.name} carries several sizes (${own.several.join(', ')}). A set is one file per size; import a file with all sizes on its own`,
      );
    const fromName = fileSizeLabel(r.name);
    const named = fromName ? sizeTokenOf(fromName) : null;
    if (own.size) {
      if (named && named !== own.size)
        notes.push(
          `${r.name}: the file name says ${named}, the blocks say ${own.size}; the blocks win`,
        );
      return { r, token: own.size, from: 'blocks' as DxfSetSizeSource };
    }
    if (named) return { r, token: named, from: 'file-name' as DxfSetSizeSource };
    return { r, token: '', from: 'placeholder' as DxfSetSizeSource };
  });
  // placeholders: the file's place in the set, never a token another file already has
  const taken = new Set(decided.map((d) => d.token).filter(Boolean));
  let next = 1;
  for (const d of decided) {
    if (d.token) continue;
    while (taken.has(String(next))) next++;
    d.token = String(next);
    taken.add(d.token);
  }

  // one file per size
  const bySize = new Map<string, string[]>();
  for (const d of decided)
    (bySize.get(d.token) ?? bySize.set(d.token, []).get(d.token)!).push(d.r.name);
  const twice = [...bySize].filter(([, names]) => names.length > 1);
  if (twice.length)
    throw refuse(
      twice.map(([size, names]) => `${names.join(' and ')} are both size ${size}`).join('; ') +
        '. A set is one file per size (CLO sometimes repeats the previous size: export that size again)',
    );

  // the same pieces in every file
  const identities = decided.map((d) => {
    const ids = d.r.scan.blocks.map((b) =>
      (d.from === 'blocks' ? b.slice(0, b.lastIndexOf('_')) : b).toUpperCase(),
    );
    return { d, ids: new Set(ids) };
  });
  const all = new Set(identities.flatMap((x) => [...x.ids]));
  const short = identities
    .map((x) => ({ name: x.d.r.name, missing: [...all].filter((id) => !x.ids.has(id)).sort() }))
    .filter((x) => x.missing.length);
  if (short.length)
    throw refuse(
      `the files do not carry the same pieces: ${short.map((x) => `${x.name} has no ${list(x.missing)}`).join('; ')}. Export every size of the same pattern`,
    );

  // rename blocks of the files whose size is not in the block names, then merge
  const blockFile = new Map<string, FileId>();
  const sources = decided.map((d) => {
    const rename = new Map<string, string>();
    for (const b of d.r.scan.blocks) {
      const to = d.from === 'blocks' ? b : `${b}_${d.token}`;
      if (to !== b) rename.set(b, to);
      blockFile.set(to, d.r.id);
    }
    return { name: d.r.name, text: renameBlocks(d.r.text, rename) };
  });
  let merged: ReturnType<typeof mergeDxfSheets>;
  try {
    merged = mergeDxfSheets(sources);
  } catch (e) {
    throw refuse(`the DXF files cannot be merged: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (merged.skipped.length)
    throw new ImportError(
      'internal',
      `the merge dropped ${merged.skipped.length} blocks that two files share (${list(merged.skipped.map((s) => s.block))})`,
    );

  const sizes: DxfSetSize[] = decided.map((d) => ({
    file: d.r.id,
    name: d.r.name,
    token: d.token,
    from: d.from,
  }));
  // which size each file is, is on the files step's page table; only what needs a look is a note
  for (const s of sizes)
    if (s.from === 'placeholder')
      notes.push(
        `${s.name}: no size in the block names or the file name; pick its card size on the sizes step`,
      );
  notes.push(...merged.warnings.map((w) => `merge: ${w}`));
  const tokens = sizes.filter((s) => s.from !== 'placeholder').map((s) => s.token.toLowerCase());
  return {
    name: tokens.length ? `allsizes-${tokens.join('-')}.dxf` : 'allsizes.dxf',
    bytes: encodeDxfBytes(merged.text),
    sizes,
    blockFile,
    notes,
  };
}

/**
 * The merged drawing as the DXF reader saw it: every file must read as exactly one size, and no
 * two files as the same size (a PIECE NAME / SIZE label inside a block outranks its name). Returns
 * the sizes as read; refuses otherwise.
 */
export function settleDxfSet(set: DxfSet, seg: DxfSegmentation): DxfSetSize[] {
  const seen = new Map<FileId, Set<string>>();
  for (const p of seg.pieces) {
    const f = set.blockFile.get(p.block);
    if (f == null) continue;
    (seen.get(f) ?? seen.set(f, new Set()).get(f)!).add(p.size);
  }
  const out = set.sizes.map((s) => {
    const got = [...(seen.get(s.file) ?? [])];
    if (got.length !== 1 || !got[0])
      throw refuse(
        `${s.name}: its pieces did not read as one size (${got.map((g) => g || 'no size').join(', ') || 'no pieces'}). Name every block PIECE_SIZE (a number reads as a size only when two pieces carry it)`,
      );
    return { ...s, token: got[0] };
  });
  const twice = out.filter((s, i) => out.findIndex((o) => o.token === s.token) !== i);
  if (twice.length)
    throw refuse(
      `${list(twice.map((s) => s.name))} read as a size another file already has (${list([...new Set(twice.map((s) => s.token))])}). A set is one file per size`,
    );
  return out;
}

/**
 * The fast path of a merged set: the run is "one file per size", and every size row says which
 * file it came from (the sizes step shows the file next to the size).
 */
export function attributeSizes(fast: DxfFastPath, sizes: DxfSetSize[]): DxfFastPath {
  const byToken = new Map(sizes.map((s) => [s.token, s]));
  const classes: LineClass[] = fast.chains.classes.map((c) => {
    const s = c.role === 'size' && c.sizeLabel ? byToken.get(c.sizeLabel) : undefined;
    return s
      ? { ...c, evidence: [...c.evidence, { kind: 'file', file: s.file, label: s.name }] }
      : c;
  });
  return {
    ...fast,
    chains: { ...fast.chains, classes },
    run: {
      ...fast.run,
      encoding: 'file-per-size',
      sizes: fast.run.sizes.map((r) => ({ ...r, file: byToken.get(r.label)?.file ?? r.file })),
      evidence: [
        `one file per size: ${sizes.map((s) => `${s.name} = ${s.token}`).join(', ')}`,
        ...fast.run.evidence,
      ],
    },
  };
}

/**
 * A placeholder size (no size in the blocks or the file name) is never matched to the card on its
 * own: it is proposed by its place in the set and left for the operator to confirm. Operator
 * answers are applied after this and win.
 */
export function reviewPlaceholderSizes(
  map: SizeMap,
  sizes: DxfSetSize[],
  card: CardSize[],
): SizeMap {
  const unknown = new Map(sizes.filter((s) => s.from === 'placeholder').map((s) => [s.token, s]));
  if (!unknown.size) return map;
  const used = new Set(
    map.entries.flatMap((e) => (e.card && !unknown.has(e.source.label) ? [e.card.sizeId] : [])),
  );
  const ranked = [...card].sort((a, b) => a.rank - b.rank);
  const entries = map.entries.map((e) => {
    const s = unknown.get(e.source.label);
    if (!s) return e;
    const guess =
      ranked[sizes.findIndex((x) => x.file === s.file)] ?? ranked.find((c) => !used.has(c.sizeId));
    const pick = guess && !used.has(guess.sizeId) ? guess : null;
    if (pick) used.add(pick.sizeId);
    return {
      ...e,
      card: pick,
      origin: 'auto' as const,
      confidence: pick ? 0.3 : 0,
      evidence: [
        `${s.name}: no size in the block names or the file name; ${pick ? 'proposed by its place in the set, confirm or change it' : 'pick the card size'}`,
      ],
    };
  });
  const mapped = new Set(entries.flatMap((e) => (e.card ? [e.card.sizeId] : [])));
  return { entries, unmapped: card.filter((c) => !mapped.has(c.sizeId)) };
}
