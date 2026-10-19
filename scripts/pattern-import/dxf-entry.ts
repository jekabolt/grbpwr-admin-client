// F8 probe entry — bundled by `scripts/pattern-import/dxf.mjs` (08-CONTRACT §7).
import type { DxfRead } from 'lib/pattern-import/adapters/dxf';

export * from 'lib/pattern-import/adapters/dxf';
export { __internals } from 'lib/pattern-import/adapters/dxf/segment';

/**
 * IR → minimal R12 DXF (POLYLINE / POINT / TEXT, one BLOCK per top-level insert, INSERT at the
 * origin, mm). Used for the idempotence round trip: DXF → IR → DXF → IR must be equal. Page-frame
 * coordinates are written verbatim, so a CLO file (blocks in world coordinates, inserts at 0,0)
 * comes back identical.
 */
export function reemitR12(read: DxfRead): string {
  const page = read.doc.pages[0];
  const pathById = new Map(page.paths.map((p) => [p.id, p]));
  const textById = new Map(page.texts.map((t) => [t.id, t]));
  const out: string[] = [];
  const E = (c: number, v: string | number) =>
    out.push(String(c).padStart(3), typeof v === 'number' ? fmt(v) : v);
  const esc = (s: string) =>
    s
      .replace(/[\r\n]/g, ' ')
      .replace(
        /[^\x20-\x7e]/g,
        (c) => `\\U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`,
      );
  const entities = (ids: number[], tids: number[]) => {
    for (const id of ids) {
      const p = pathById.get(id);
      if (!p) continue;
      const layer = page.styles[p.style]?.layer ?? '0';
      const pa = read.meta.points[id];
      if (p.pts.length === 1) {
        E(0, 'POINT');
        E(8, layer);
        E(10, p.pts[0].x);
        E(20, p.pts[0].y);
        E(30, pa ? pa.z : 0);
        if (pa?.angleDeg != null) E(50, pa.angleDeg);
        continue;
      }
      E(0, 'POLYLINE');
      E(8, layer);
      E(66, '1');
      E(70, p.closed ? '1' : '0');
      for (const q of p.pts) {
        E(0, 'VERTEX');
        E(8, layer);
        E(10, q.x);
        E(20, q.y);
      }
      E(0, 'SEQEND');
    }
    for (const id of tids) {
      const t = textById.get(id);
      if (!t) continue;
      E(0, 'TEXT');
      E(8, t.layer ?? '0');
      E(10, t.anchor.x);
      E(20, t.anchor.y);
      E(40, t.fontSizeMm);
      E(50, t.rotationDeg);
      E(1, esc(t.text));
    }
  };
  E(0, 'SECTION');
  E(2, 'HEADER');
  E(9, '$ACADVER');
  E(1, 'AC1009');
  E(9, '$INSUNITS');
  E(70, '4');
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'BLOCKS');
  const names = new Map<number, string>();
  const used = new Set<string>();
  for (const g of read.meta.groups) {
    if (g.kind !== 'insert' || !g.block) continue;
    let name = g.block;
    for (let k = 1; used.has(name); k++) name = `${g.block}__inst${k}`;
    used.add(name);
    names.set(g.index, name);
    E(0, 'BLOCK');
    E(8, '0');
    E(2, name);
    E(70, '0');
    E(10, 0);
    E(20, 0);
    entities(g.paths, g.texts);
    E(0, 'ENDBLK');
  }
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'ENTITIES');
  for (const g of read.meta.groups) {
    if (g.kind === 'insert') {
      E(0, 'INSERT');
      E(8, '0');
      E(2, names.get(g.index) ?? '');
      E(10, 0);
      E(20, 0);
    } else entities(g.paths, g.texts);
  }
  E(0, 'ENDSEC');
  E(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}

function fmt(v: number): string {
  const s = v.toFixed(9);
  return s === '-0.000000000' ? '0.000000000' : s;
}
