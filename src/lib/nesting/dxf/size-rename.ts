// Size names of an ASCII DXF: read them, rename them, drop sizes — on the latin1 view of the bytes.
//
// A graded DXF names each size in the BLOCK NAME tail (BP_1_XS, BP_1_S…); AAMA exports also put a
// `SIZE: XS` text inside the block and `SAMPLE SIZE: M` in the annotation. The card reads sizes
// from the block names only (nesting/block-code.ts), so renaming a size means renaming every place
// a block name lives: the BLOCK itself (codes 2 and 3), its BLOCK_RECORD (R2000+), and each INSERT
// that places it. Dropping a size removes those three; nothing else references a block.
//
// Like insunits.ts: edits splice the string, everything outside them stays byte for byte.
// Pure, dependency-free (runs under node as is).

import { dxfPairs, type DxfPair } from './insunits';

/** One named block of the file, with the `SIZE: x` text drawn inside it (null = none). */
export type DxfBlockInfo = { name: string; sizeText: string | null };

const SIZE_TEXT = /^(\s*(?:SAMPLE\s+)?SIZE\s*:\s*)(.*?)(\s*)$/i;

type Group = { type: string; pairs: DxfPair[]; start: number; end: number };

function* groups(s: string): Generator<Group & { section: string }> {
  let cur: Group | null = null;
  let section = '';
  let pendingSection = false;
  const close = (end: number) => {
    const g = cur!;
    g.end = end;
    return g;
  };
  for (const p of dxfPairs(s)) {
    if (p.code === 0) {
      if (cur) yield { ...close(p.start), section };
      const v = p.value.trim();
      if (v === 'ENDSEC') section = '';
      pendingSection = v === 'SECTION';
      cur = { type: v, pairs: [p], start: p.start, end: p.next };
      continue;
    }
    if (!cur) cur = { type: '', pairs: [], start: p.start, end: p.next };
    if (pendingSection && p.code === 2) {
      section = p.value.trim();
      pendingSection = false;
    }
    cur.pairs.push(p);
    cur.end = p.next;
  }
  if (cur) yield { ...cur, section };
}

const nameOf = (g: Group) => g.pairs.find((p) => p.code === 2)?.value.trim() ?? '';

/** DXF symbol names are case-insensitive: every lookup goes through this key. */
export const blockKey = (name: string) => name.trim().toLowerCase();

/** Drawn entities in ENTITIES other than INSERTs (a blockless R12 sheet draws here). */
export function looseEntityCount(s: string): number {
  let n = 0;
  for (const g of groups(s)) {
    if (
      g.section === 'ENTITIES' &&
      g.type &&
      !['INSERT', 'SECTION', 'ENDSEC', 'ATTRIB', 'SEQEND'].includes(g.type)
    )
      n++;
  }
  return n;
}

/** Named blocks (not *Model_Space / *Paper_Space) in file order, with their `SIZE:` text. */
export function readDxfBlocks(s: string): DxfBlockInfo[] {
  const out: DxfBlockInfo[] = [];
  let open: DxfBlockInfo | null = null;
  for (const g of groups(s)) {
    if (g.section !== 'BLOCKS') continue;
    if (g.type === 'BLOCK') {
      const name = nameOf(g);
      open = name && !name.startsWith('*') ? { name, sizeText: null } : null;
      if (open) out.push(open);
      continue;
    }
    if (g.type === 'ENDBLK') {
      open = null;
      continue;
    }
    if (!open || open.sizeText != null || (g.type !== 'TEXT' && g.type !== 'MTEXT')) continue;
    for (const p of g.pairs) {
      if (p.code !== 1) continue;
      const m = p.value.match(SIZE_TEXT);
      if (m && !/sample/i.test(m[1]) && m[2]) open.sizeText = m[2];
    }
  }
  return out;
}

export type SizeRewrite = {
  /** Block name → new block name. Keys compare case-insensitively. */
  rename: ReadonlyMap<string, string>;
  /** Blocks to remove, with their record and every INSERT of them. */
  drop: ReadonlySet<string>;
  /** `SIZE: x` / `SAMPLE SIZE: x` texts: lower-cased old size → new size. */
  sizeText?: ReadonlyMap<string, string>;
};

type Edit = { from: number; to: number; text: string };

/** The file with blocks renamed and dropped as `plan` says. Nothing else changes. */
export function rewriteDxfBlocks(s: string, plan: SizeRewrite): string {
  const rename = new Map([...plan.rename].map(([k, v]) => [blockKey(k), v]));
  const drop = new Set([...plan.drop].map(blockKey));
  const parts: string[] = [];
  let cursor = 0;
  let droppingBlock = false;
  let droppingAttribs = false;

  const keep = (g: Group, edits: Edit[]) => {
    let at = g.start;
    parts.push(s.slice(cursor, g.start));
    for (const e of edits) {
      parts.push(s.slice(at, e.from), e.text);
      at = e.to;
    }
    parts.push(s.slice(at, g.end));
    cursor = g.end;
  };
  const skip = (g: Group) => {
    parts.push(s.slice(cursor, g.start));
    cursor = g.end;
  };

  for (const g of groups(s)) {
    if (droppingBlock) {
      skip(g);
      if (g.type === 'ENDBLK') droppingBlock = false;
      continue;
    }
    if (droppingAttribs) {
      skip(g);
      if (g.type === 'SEQEND') droppingAttribs = false;
      continue;
    }
    const named =
      (g.type === 'BLOCK' && g.section === 'BLOCKS') ||
      (g.type === 'BLOCK_RECORD' && g.section === 'TABLES') ||
      g.type === 'INSERT';
    if (named) {
      const name = blockKey(nameOf(g));
      if (drop.has(name)) {
        skip(g);
        if (g.type === 'BLOCK') droppingBlock = true;
        if (g.type === 'INSERT' && g.pairs.some((p) => p.code === 66 && p.value.trim() === '1'))
          droppingAttribs = true;
        continue;
      }
      const to = rename.get(name);
      const edits: Edit[] = [];
      if (to != null) {
        for (const p of g.pairs) {
          const nameCode = p.code === 2 || (g.type === 'BLOCK' && p.code === 3);
          if (nameCode && blockKey(p.value) === name)
            edits.push({ from: p.valueStart, to: p.valueEnd, text: to });
        }
      }
      keep(g, edits);
      continue;
    }
    const edits: Edit[] = [];
    if (plan.sizeText && (g.type === 'TEXT' || g.type === 'MTEXT')) {
      for (const p of g.pairs) {
        if (p.code !== 1) continue;
        const m = p.value.match(SIZE_TEXT);
        const to = m ? plan.sizeText.get(m[2].toLowerCase()) : undefined;
        if (m && to != null)
          edits.push({ from: p.valueStart, to: p.valueEnd, text: `${m[1]}${to}${m[3]}` });
      }
    }
    keep(g, edits);
  }
  parts.push(s.slice(cursor));
  return parts.join('');
}
