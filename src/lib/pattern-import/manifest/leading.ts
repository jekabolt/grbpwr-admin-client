// The leading 999 comment block of a DXF: the manifest (index.ts) and the grade map
// (grade-map-block.ts) both live here, in front of the first section. Pure string scanning, no
// imports: main-thread and worker safe.

// ── the leading comment block ─────────────────────────────────────────────────────────────────

export type LeadingComments = {
  /** Offset where the leading 999 block ends (the first non-999 group starts here). */
  end: number;
  /** Offset where the content starts, after an optional BOM. */
  start: number;
  /** Every leading comment as [startOffset, endOffset, value]. */
  comments: { from: number; to: number; value: string }[];
};

// Walks group pairs from the top of the file while the group code is 999. Only this block is
// scanned: a 999 later in the file is somebody else's comment, and a manifest is only ever written
// in front of the first section.
export function leadingComments(text: string): LeadingComments {
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const comments: LeadingComments['comments'] = [];
  let pos = start;
  const lineAt = (from: number): { line: string; next: number } | null => {
    if (from >= text.length) return null;
    const nl = text.indexOf('\n', from);
    const endOfLine = nl < 0 ? text.length : nl;
    const raw = text.slice(from, endOfLine);
    return {
      line: raw.endsWith('\r') ? raw.slice(0, -1) : raw,
      next: nl < 0 ? text.length : nl + 1,
    };
  };
  for (;;) {
    const code = lineAt(pos);
    if (!code || code.line.trim() !== '999') break;
    const value = lineAt(code.next);
    if (!value) break;
    comments.push({ from: pos, to: value.next, value: value.line });
    pos = value.next;
  }
  return { end: pos, start, comments };
}

/** Tag of the grade map block (grade-map-block.ts): `999 / GRBPWR-GRADEMAP v1z i/n <base64>`. */
export const GRADEMAP_TAG = 'GRBPWR-GRADEMAP' as const;

export const isGradeMapTagged = (value: string) =>
  value === GRADEMAP_TAG || value.startsWith(`${GRADEMAP_TAG} `);
