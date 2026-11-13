// Write stage · the grade map block of a written DXF (GRADEMAP-DESIGN §2, P2). The map is built
// from the written file itself, read back through the card's parse path (`roundTrip`), so it holds
// the geometry the runtime will see. A .rul import upgrades the chains it graded to `exact`. Never
// throws: anything that goes wrong leaves the file as it was, with a note.

import { bareToken } from 'components/managers/tech-card/components/nesting/block-code';
import { gradeMapSources, gradeMapOfParsed, type GmSizeRef } from 'lib/grade-map/source';
import { exactFromRul } from 'lib/grade-map/rul';
import { gradeMapBytes } from 'lib/grade-map/serialize';
import type { GmFile } from 'lib/grade-map/types';
import type { RulPieceGrade } from '../adapters/rul/expand';
import { roundTrip } from '../gate/roundtrip';
import { writeGradeMapBlock } from '../manifest/grade-map-block';
import type { ManifestSize } from '../types';

/** The .rul grade an import expanded: per piece, every coordinate in every .rul size. */
export type RulGrades = { grades: readonly RulPieceGrade[]; sizes: readonly string[] };

export type WithGradeMap = {
  text: string;
  file: GmFile | null;
  /** Why a piece or the whole map is left out or kept derived (plain, for the import log). */
  notes: string[];
};

export function sizeRefsOf(sizes: readonly ManifestSize[]): GmSizeRef[] {
  return sizes
    .filter((s) => s.sizeId)
    .map((s) => ({
      id: s.sizeId,
      tokens: [s.token, s.sourceLabel, s.name].filter(Boolean),
      rank: s.rank,
    }));
}

export async function withGradeMap(
  dxfText: string,
  sizes: readonly ManifestSize[],
  rul: RulGrades | null = null,
): Promise<WithGradeMap> {
  const notes: string[] = [];
  try {
    const refs = sizeRefsOf(sizes);
    if (refs.length < 2) return { text: dxfText, file: null, notes: ['grade map: one size'] };
    const parsed = (await roundTrip(dxfText)).pieces;
    const built = gradeMapOfParsed(parsed, refs);
    if (!built) return { text: dxfText, file: null, notes: ['grade map: no graded piece'] };
    let file = built.file;
    for (const b of built.builds)
      for (const t of b.piece.tracks)
        if (t.trust === 'refused')
          notes.push(`grade map: ${b.piece.key} ${t.kind} ${t.layer} — ${t.reason}`);
    if (rul?.grades.length) file = upgradeRul(file, parsed, refs, rul, notes);
    const text = writeGradeMapBlock(dxfText, gradeMapBytes(file));
    return { text, file, notes };
  } catch (e) {
    notes.push(`grade map: not written — ${e instanceof Error ? e.message : String(e)}`);
    return { text: dxfText, file: null, notes };
  }
}

function upgradeRul(
  file: GmFile,
  parsed: Parameters<typeof gradeMapSources>[0],
  refs: readonly GmSizeRef[],
  rul: RulGrades,
  notes: string[],
): GmFile {
  const sources = new Map(gradeMapSources(parsed, refs).map((s) => [s.key.toLowerCase(), s]));
  const byToken = new Map<string, number>();
  for (const r of refs) for (const t of r.tokens) if (bareToken(t)) byToken.set(bareToken(t), r.id);
  const sizeIdOf = (name: string) => byToken.get(bareToken(name)) ?? 0;
  const grades = new Map(rul.grades.map((g) => [g.piece.trim().toLowerCase(), g]));
  // The writer renames pieces (identity codes), so a grade is found by name first, else by shape:
  // the one grade whose cut is the drawn cut in every size (exactFromRul's frame check).
  const used = new Set<RulPieceGrade>();
  const pieces = file.pieces.map((p) => {
    const src = sources.get(p.key.toLowerCase());
    if (!src) return p;
    const named = grades.get(p.key.trim().toLowerCase());
    const order = named ? [named] : rul.grades.filter((g) => !used.has(g));
    let last: string | null = null;
    for (const grade of order) {
      const r = exactFromRul(p, grade, rul.sizes, sizeIdOf, src.sizes, file.sizes);
      if (r.exact > 0) {
        used.add(grade);
        if (r.note) notes.push(`grade map: ${r.note}`);
        return r.piece;
      }
      last = r.note;
    }
    if (named && last) notes.push(`grade map: ${last}`);
    else if (!named) notes.push(`grade map: ${p.key}: no .rul grade fits — kept derived`);
    return p;
  });
  return { ...file, pieces };
}
