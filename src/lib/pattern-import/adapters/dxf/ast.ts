// Tag stream → a raw, typed-enough AST: header variables, the tables a pattern reader needs
// (LAYER, LTYPE), block definitions and model-space entities. Every entity keeps ALL its tags so
// the decoders can read codes dxf-parser throws away; nothing is interpreted here except
// structure (POLYLINE→VERTEX…SEQEND, INSERT→ATTRIB…SEQEND).

import { DxfImportError } from './errors';
import { num, type Tag } from './tags';

export type RawEntity = {
  type: string;
  /** Drawing-operation index: file order over every top-level entity record (BLOCKS + ENTITIES).
   * This is `PathSource.op`. Children (VERTEX/ATTRIB/SEQEND) share their parent's op. */
  op: number;
  handle?: string;
  /** Layer as written (code 8), trimmed; '0' when absent. */
  layer: string;
  tags: Tag[];
  line: number;
  /** POLYLINE: VERTEX records. INSERT: ATTRIB records. */
  children: RawEntity[];
  /** SEQEND closed the child list (counted in the tally). */
  seqend: boolean;
  /** Paper-space entity (code 67 = 1). */
  paper: boolean;
};

export type RawBlock = {
  name: string;
  layer: string;
  flags: number;
  base: { x: number; y: number };
  entities: RawEntity[];
  line: number;
  handle?: string;
};

export type RawLayer = {
  name: string;
  color: number;
  trueColor: number | null;
  ltype: string;
  flags: number;
};
export type RawLtype = { name: string; dash: number[] };

export type RawDxf = {
  header: Record<string, Tag[]>;
  layers: RawLayer[];
  ltypes: Map<string, RawLtype>;
  blocks: Map<string, RawBlock>;
  /** Block definitions in file order (names may repeat in broken files; the map keeps the first). */
  blockOrder: RawBlock[];
  entities: RawEntity[];
  sections: string[];
  /** Records seen in BLOCKS/ENTITIES by type, including VERTEX/SEQEND/ATTRIB/ENDBLK — the tally's
   * “in” side, counted while walking, independent of any decoder. */
  recordsByType: Record<string, number>;
  warnings: string[];
};

export function buildAst(tags: Tag[]): RawDxf {
  const out: RawDxf = {
    header: {},
    layers: [],
    ltypes: new Map(),
    blocks: new Map(),
    blockOrder: [],
    entities: [],
    sections: [],
    recordsByType: {},
    warnings: [],
  };
  const op = { n: 0 };
  let i = 0;
  let sawEof = false;
  while (i < tags.length) {
    const t = tags[i];
    if (t.code === 0 && t.value.trim() === 'EOF') {
      sawEof = true;
      break;
    }
    if (t.code !== 0 || t.value.trim() !== 'SECTION') {
      throw new DxfImportError(
        'corrupt',
        `“${t.value.trim().slice(0, 30)}” outside any SECTION`,
        t.line,
      );
    }
    const nameTag = tags[i + 1];
    if (!nameTag || nameTag.code !== 2)
      throw new DxfImportError('corrupt', 'SECTION without a name', t.line);
    const name = nameTag.value.trim().toUpperCase();
    out.sections.push(name);
    let end = i + 2;
    while (end < tags.length && !(tags[end].code === 0 && tags[end].value.trim() === 'ENDSEC'))
      end++;
    if (end >= tags.length) {
      throw new DxfImportError(
        'corrupt',
        `section ${name} is never closed — the file is truncated`,
        t.line,
      );
    }
    const body = tags.slice(i + 2, end);
    if (name === 'HEADER') readHeader(body, out);
    else if (name === 'TABLES') readTables(body, out);
    else if (name === 'BLOCKS') readBlocks(body, out, op);
    else if (name === 'ENTITIES')
      out.entities.push(...readEntities(body, 0, body.length, out, op).list);
    i = end + 1;
  }
  if (!sawEof)
    out.warnings.push('the file has no EOF marker (every section is closed, so nothing is lost)');
  if (!out.sections.includes('ENTITIES') && !out.sections.includes('BLOCKS')) {
    throw new DxfImportError('corrupt', 'the file has neither an ENTITIES nor a BLOCKS section');
  }
  return out;
}

function readHeader(body: Tag[], out: RawDxf) {
  let cur: string | null = null;
  for (const t of body) {
    if (t.code === 9) {
      cur = t.value.trim();
      out.header[cur] = [];
    } else if (cur) out.header[cur].push(t);
  }
}

function readTables(body: Tag[], out: RawDxf) {
  let table = '';
  let rec: Tag[] | null = null;
  let recType = '';
  const flush = () => {
    if (!rec) return;
    if (recType === 'LAYER') {
      const name = str(rec, 2);
      if (name != null) {
        out.layers.push({
          name,
          color: int(rec, 62) ?? 7,
          trueColor: int(rec, 420),
          ltype: str(rec, 6) ?? 'CONTINUOUS',
          flags: int(rec, 70) ?? 0,
        });
      }
    } else if (recType === 'LTYPE') {
      const name = str(rec, 2);
      if (name != null) {
        const dash = rec.filter((t) => t.code === 49).map((t) => Math.abs(num(t)));
        out.ltypes.set(name.toUpperCase(), { name, dash });
      }
    }
    rec = null;
  };
  for (const t of body) {
    if (t.code === 0) {
      flush();
      const v = t.value.trim();
      if (v === 'TABLE') {
        table = '';
        continue;
      }
      if (v === 'ENDTAB') {
        table = '';
        continue;
      }
      recType = v;
      rec = [];
      continue;
    }
    if (rec) rec.push(t);
    else if (t.code === 2 && !table) table = t.value.trim();
  }
  flush();
}

function readBlocks(body: Tag[], out: RawDxf, op: { n: number }) {
  let i = 0;
  while (i < body.length) {
    const t = body[i];
    if (t.code !== 0) {
      i++;
      continue;
    }
    const v = t.value.trim();
    if (v !== 'BLOCK') {
      throw new DxfImportError('corrupt', `“${v}” in BLOCKS outside a BLOCK…ENDBLK pair`, t.line);
    }
    // BLOCK header tags up to the first entity / ENDBLK.
    let j = i + 1;
    const head: Tag[] = [];
    while (j < body.length && body[j].code !== 0) head.push(body[j++]);
    let end = j;
    while (end < body.length && !(body[end].code === 0 && body[end].value.trim() === 'ENDBLK'))
      end++;
    if (end >= body.length)
      throw new DxfImportError('corrupt', 'BLOCK is never closed by ENDBLK', t.line);
    const name = str(head, 2) ?? '';
    const block: RawBlock = {
      name,
      layer: str(head, 8) ?? '0',
      flags: int(head, 70) ?? 0,
      base: { x: numOr(head, 10, 0), y: numOr(head, 20, 0) },
      entities: readEntities(body, j, end, out, op).list,
      line: t.line,
      handle: str(head, 5) ?? undefined,
    };
    bump(out, 'BLOCK');
    bump(out, 'ENDBLK');
    out.blockOrder.push(block);
    if (out.blocks.has(name))
      out.warnings.push(`block “${name}” is defined twice — the first definition is used`);
    else out.blocks.set(name, block);
    // skip ENDBLK's own tags
    let k = end + 1;
    while (k < body.length && body[k].code !== 0) k++;
    i = k;
  }
}

function bump(out: RawDxf, type: string) {
  out.recordsByType[type] = (out.recordsByType[type] ?? 0) + 1;
}

function readEntities(
  body: Tag[],
  from: number,
  to: number,
  out: RawDxf,
  op: { n: number },
): { list: RawEntity[] } {
  const list: RawEntity[] = [];
  let i = from;
  const readOne = (): RawEntity => {
    const t = body[i];
    const type = t.value.trim().toUpperCase();
    const tags: Tag[] = [];
    i++;
    while (i < to && body[i].code !== 0) tags.push(body[i++]);
    bump(out, type);
    return {
      type,
      op: -1,
      handle: str(tags, 5) ?? undefined,
      layer: str(tags, 8) ?? '0',
      tags,
      line: t.line,
      children: [],
      seqend: false,
      paper: int(tags, 67) === 1,
    };
  };
  while (i < to) {
    if (body[i].code !== 0) {
      throw new DxfImportError('corrupt', `group ${body[i].code} outside an entity`, body[i].line);
    }
    const e = readOne();
    e.op = op.n++;
    const childType = e.type === 'POLYLINE' ? 'VERTEX' : e.type === 'INSERT' ? 'ATTRIB' : null;
    if (childType) {
      while (i < to && body[i].code === 0 && body[i].value.trim().toUpperCase() === childType) {
        const c = readOne();
        c.op = e.op;
        e.children.push(c);
      }
      const expectsSeqend = e.type === 'POLYLINE' || e.children.length > 0 || int(e.tags, 66) === 1;
      if (i < to && body[i].code === 0 && body[i].value.trim().toUpperCase() === 'SEQEND') {
        readOne();
        e.seqend = true;
      } else if (expectsSeqend) {
        if (e.type === 'POLYLINE' && i >= to) {
          throw new DxfImportError('corrupt', 'POLYLINE is never closed by SEQEND', e.line);
        }
        out.warnings.push(`${e.type} at line ${e.line} has no SEQEND`);
      }
    }
    list.push(e);
  }
  return { list };
}

// ── tag helpers ─────────────────────────────────────────────────────────────────────────────

export function str(tags: Tag[], code: number): string | null {
  const t = tags.find((x) => x.code === code);
  return t ? t.value.trim() : null;
}
export function rawStr(tags: Tag[], code: number): string | null {
  const t = tags.find((x) => x.code === code);
  return t ? t.value : null;
}
export function int(tags: Tag[], code: number): number | null {
  const t = tags.find((x) => x.code === code);
  if (!t) return null;
  return Math.trunc(num(t));
}
export function numOf(tags: Tag[], code: number): number | null {
  const t = tags.find((x) => x.code === code);
  return t ? num(t) : null;
}
export function numOr(tags: Tag[], code: number, d: number): number {
  return numOf(tags, code) ?? d;
}
