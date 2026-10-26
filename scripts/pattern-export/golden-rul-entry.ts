// Real-file proof for tmp/plans/dxf-rul-export/golden. Export cases go through the browser writer,
// persist its ZIP, then use the same zip/parse/expand adapter chain as the upload session. Import
// cases take the vendor siblings through parse/expand and the ordinary DXF reader/segmenter.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { RUL_SINGLE_SIZE_REASON, exportDxfRulArchive } from 'lib/pattern-export/rul';
import { readDxf, segmentDxf, bareSize } from 'lib/pattern-import/adapters/dxf';
import { buildAst } from 'lib/pattern-import/adapters/dxf/ast';
import { modelLabelsOf, unitsOf } from 'lib/pattern-import/adapters/dxf/extract';
import { bulgePolyline } from 'lib/pattern-import/adapters/dxf/geometry';
import { loadDxf } from 'lib/pattern-import/adapters/dxf/tags';
import { expandRul, parseRul, zipRulPair, type RulTable } from 'lib/pattern-import/adapters/rul';
import {
  type ModelEntity,
  type PieceBlock,
  normalizedRulPieceName,
  pieceBlocks,
} from 'lib/pattern-import/adapters/rul/model';

type Pt = { x: number; y: number };
type Shape = { layer: string; kind: 'chain' | 'point'; closed: boolean; pts: Pt[] };
type Cell = { piece: string; size: string; original: Shape[]; imported: Shape[] };
type Family = { piece: string; bySize: Map<string, PieceBlock> };

const MARKER_LAYERS = new Set(['2', '3', '84', '85', '86', '87']);
const enc = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;
const bytesOf = (path: string): ArrayBuffer => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const stemOf = (path: string) => basename(path, extname(path));
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'case';
const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function ast(bytes: ArrayBuffer | string) {
  return buildAst(loadDxf(typeof bytes === 'string' ? enc(bytes) : bytes).tok.tags);
}

function mmPerUnit(bytes: ArrayBuffer | string): number {
  const raw = ast(bytes);
  return unitsOf(raw, modelLabelsOf(raw)).mmPerUnit;
}

function families(bytes: ArrayBuffer | string, sizes: readonly string[]): Map<string, Family> {
  const tokens = new Map(sizes.map((size) => [bareSize(size), size]));
  const blocks = pieceBlocks(ast(bytes));
  const parsed = blocks.map((block) => {
    const parts = block.block.name.split('_');
    const tail = parts.length > 1 ? parts.at(-1)! : '';
    const piece = parts.length > 1 ? parts.slice(0, -1).join('_') : block.block.name;
    return { block, tail, piece };
  });
  const tailSizes = new Map<string, Set<string>>();
  for (const { piece, tail } of parsed) {
    const size = tokens.get(bareSize(tail));
    if (size) (tailSizes.get(piece) ?? tailSizes.set(piece, new Set()).get(piece)!).add(size);
  }
  const exact = new Map<string, Family>();
  for (const { block, tail, piece } of parsed) {
    const family = exact.get(piece) ?? { piece, bySize: new Map<string, PieceBlock>() };
    exact.set(piece, family);
    if (bareSize(tail) === 'UNI') {
      for (const size of sizes) family.bySize.set(size, block);
      continue;
    }
    const tailSize = tokens.get(bareSize(tail));
    const labelSize = block.sizeLabel ? tokens.get(bareSize(block.sizeLabel)) : undefined;
    const size = (tailSizes.get(piece)?.size ?? 0) >= 2 ? tailSize : labelSize ?? tailSize;
    if (size) family.bySize.set(size, block);
  }
  const out = new Map<string, Family>();
  const aliases = new Map<string, Family[]>();
  for (const family of exact.values()) {
    const key = normalizedRulPieceName(family.piece).toUpperCase();
    aliases.set(key, [...(aliases.get(key) ?? []), family]);
  }
  for (const group of aliases.values()) {
    const allSizes = group.flatMap((family) => [...family.bySize.keys()]);
    if (group.length === 1 || new Set(allSizes).size !== allSizes.length) {
      for (const family of group) out.set(family.piece, family);
      continue;
    }
    const piece = normalizedRulPieceName(group[0].piece);
    const family: Family = { piece, bySize: new Map() };
    for (const item of group)
      for (const [size, block] of item.bySize) family.bySize.set(size, block);
    out.set(piece, family);
  }
  return out;
}

const shapeType = (m: ModelEntity) =>
  m.raw.type === 'LWPOLYLINE' || m.raw.type === 'POLYLINE'
    ? 'POLYLINE'
    : m.raw.type === 'POINT' && m.layer === '4'
      ? 'LINE'
      : m.raw.type;
const entitySig = (m: ModelEntity) => `${m.layer}|${shapeType(m)}|${m.closed ? 1 : 0}`;
const markerSig = (p: PieceBlock) =>
  p.entities
    .filter((m) => (m.kind === 'chain' || m.kind === 'point') && MARKER_LAYERS.has(m.layer))
    .map((m) => `${entitySig(m)}:${m.slots.length}`)
    .sort()
    .join(';');

function shapesOf(piece: PieceBlock, unit: number, markers: boolean): Shape[] {
  return piece.entities
    .map((m, index) => ({ m, index }))
    .filter(
      ({ m }) =>
        (m.kind === 'chain' || m.kind === 'point') && (markers || !MARKER_LAYERS.has(m.layer)),
    )
    .sort((a, b) => entitySig(a.m).localeCompare(entitySig(b.m)) || a.index - b.index)
    .map(({ m }) => {
      if (m.raw.type === 'POINT' && m.layer === '4' && m.slots.length) {
        const at = m.slots[0];
        const depth = Number(m.raw.tags.find((tag) => tag.code === 30)?.value ?? 0) || 5 / unit;
        const angle =
          (Number(m.raw.tags.find((tag) => tag.code === 50)?.value ?? 0) * Math.PI) / 180;
        return {
          layer: m.layer,
          kind: 'chain' as const,
          closed: false,
          pts: [
            { x: at.x * unit, y: at.y * unit },
            {
              x: (at.x + depth * Math.cos(angle)) * unit,
              y: (at.y + depth * Math.sin(angle)) * unit,
            },
          ],
        };
      }
      let slots = m.slots;
      if (m.raw.type === 'LWPOLYLINE' || m.raw.type === 'POLYLINE') {
        const vertices: { x: number; y: number; bulge: number }[] = [];
        if (m.raw.type === 'LWPOLYLINE') {
          for (const tag of m.raw.tags) {
            if (tag.code === 10) vertices.push({ x: Number(tag.value), y: 0, bulge: 0 });
            else if (tag.code === 20 && vertices.length)
              vertices[vertices.length - 1].y = Number(tag.value);
            else if (tag.code === 42 && vertices.length)
              vertices[vertices.length - 1].bulge = Number(tag.value);
          }
        } else {
          for (const child of m.raw.children) {
            if (child.type !== 'VERTEX') continue;
            vertices.push({
              x: Number(child.tags.find((tag) => tag.code === 10)?.value ?? 0),
              y: Number(child.tags.find((tag) => tag.code === 20)?.value ?? 0),
              bulge: Number(child.tags.find((tag) => tag.code === 42)?.value ?? 0),
            });
          }
        }
        slots = bulgePolyline(vertices, m.closed, 0.02 / unit).map((p) => ({
          ...m.slots[0],
          x: p.x,
          y: p.y,
        }));
      }
      return {
        layer: m.layer,
        kind: m.kind as 'chain' | 'point',
        closed: m.closed,
        pts: slots.map((p) => ({ x: p.x * unit, y: p.y * unit })),
      };
    });
}

function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const d2 = vx * vx + vy * vy;
  const t = d2 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / d2)) : 0;
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

function pointPolylineDistance(p: Pt, q: Shape): number {
  if (!q.pts.length) return Infinity;
  if (q.pts.length === 1) return Math.hypot(p.x - q.pts[0].x, p.y - q.pts[0].y);
  let best = Infinity;
  const segments = q.closed ? q.pts.length : q.pts.length - 1;
  for (let i = 0; i < segments; i++)
    best = Math.min(best, pointSegmentDistance(p, q.pts[i], q.pts[(i + 1) % q.pts.length]));
  return best;
}

function shapeError(a: Shape, b: Shape): number {
  if (a.kind !== b.kind || a.layer !== b.layer || a.closed !== b.closed) return Infinity;
  if (a.kind === 'chain') {
    let error = 0;
    for (const p of a.pts) error = Math.max(error, pointPolylineDistance(p, b));
    for (const p of b.pts) error = Math.max(error, pointPolylineDistance(p, a));
    return error;
  }
  if (a.pts.length !== b.pts.length) return Infinity;
  return a.pts.reduce(
    (error, p, i) => Math.max(error, Math.hypot(p.x - b.pts[i].x, p.y - b.pts[i].y)),
    0,
  );
}

function cellError(cell: Cell): number {
  const signature = (shape: Shape) => `${shape.layer}|${shape.kind}|${shape.closed ? 1 : 0}`;
  const keys = [...new Set([...cell.original, ...cell.imported].map(signature))];
  let error = 0;
  for (const key of keys) {
    const original = cell.original.filter((shape) => signature(shape) === key);
    const imported = cell.imported.filter((shape) => signature(shape) === key);
    if (imported.length < original.length) return Infinity;
    const rows = original.length + 1;
    const cols = imported.length + 1;
    const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(Infinity));
    const take = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
    for (let j = 0; j < cols; j++) dp[0][j] = 0;
    for (let i = 1; i < rows; i++)
      for (let j = 1; j < cols; j++) {
        const match = Math.max(dp[i - 1][j - 1], shapeError(original[i - 1], imported[j - 1]));
        const skip = dp[i][j - 1];
        if (match < skip) {
          dp[i][j] = match;
          take[i][j] = true;
        } else dp[i][j] = skip;
      }
    if (!Number.isFinite(dp[original.length][imported.length])) return Infinity;
    error = Math.max(error, dp[original.length][imported.length]);
    const used = new Set<number>();
    let i = original.length;
    let j = imported.length;
    while (i > 0 && j > 0) {
      if (take[i][j]) {
        used.add(j - 1);
        i--;
        j--;
      } else j--;
    }
    const carriers = cell.original.filter(
      (shape) => shape.kind === 'chain' && ['1', '8', '14'].includes(shape.layer),
    );
    for (let k = 0; k < imported.length; k++) {
      if (used.has(k)) continue;
      const extra = imported[k];
      if (extra.layer !== '4' || extra.kind !== 'chain' || !extra.pts.length) return Infinity;
      const onLine = Math.min(
        ...carriers.map((shape) => pointPolylineDistance(extra.pts[0], shape)),
      );
      if (!Number.isFinite(onLine)) return Infinity;
      error = Math.max(error, onLine);
    }
  }
  return error;
}

function shapePath(shape: Shape, tx: (p: Pt) => Pt): string {
  if (!shape.pts.length) return '';
  const pts = shape.pts.map(tx);
  if (shape.kind === 'point')
    return pts
      .map((p) => `<circle cx='${p.x.toFixed(2)}' cy='${p.y.toFixed(2)}' r='1.6'/>`)
      .join('');
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('');
  return `<path d='${d}${shape.closed ? 'Z' : ''}'/>`;
}

function overlaySvg(cells: Cell[], title: string, onlyExpanded = false): string {
  const pieces = [...new Set(cells.map((c) => c.piece))];
  const sizes = [...new Set(cells.map((c) => c.size))];
  const cw = 180;
  const ch = 150;
  const top = 34;
  const width = Math.max(cw, sizes.length * cw);
  const height = top + Math.max(1, pieces.length) * ch;
  const body: string[] = [];
  const refused = !onlyExpanded && cells.length > 0 && cells.every((cell) => !cell.imported.length);
  cells.forEach((cell) => {
    const col = sizes.indexOf(cell.size);
    const row = pieces.indexOf(cell.piece);
    const all = [...cell.original, ...cell.imported].flatMap((s) => s.pts);
    const minX = Math.min(...all.map((p) => p.x));
    const maxX = Math.max(...all.map((p) => p.x));
    const minY = Math.min(...all.map((p) => p.y));
    const maxY = Math.max(...all.map((p) => p.y));
    const scale = Math.min(1, 154 / Math.max(1, maxX - minX), 112 / Math.max(1, maxY - minY));
    const ox = col * cw + 13 + (154 - (maxX - minX) * scale) / 2;
    const oy = top + row * ch + 25 + (112 - (maxY - minY) * scale) / 2;
    const tx = (p: Pt) => ({ x: ox + (p.x - minX) * scale, y: oy + (maxY - p.y) * scale });
    body.push(
      `<rect x='${col * cw}' y='${top + row * ch}' width='${cw}' height='${ch}' fill='none' stroke='#e3e3e3'/>`,
      `<text x='${col * cw + 6}' y='${top + row * ch + 14}'>${xml(cell.piece)} · ${xml(cell.size)}</text>`,
    );
    if (!onlyExpanded)
      body.push(`<g class='original'>${cell.original.map((s) => shapePath(s, tx)).join('')}</g>`);
    body.push(`<g class='imported'>${cell.imported.map((s) => shapePath(s, tx)).join('')}</g>`);
  });
  return `<?xml version='1.0' encoding='UTF-8'?>
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}' width='${width}' height='${height}'>
<style>text{font:10px ui-monospace,monospace;fill:#222}.original{fill:none;stroke:#999;stroke-width:1.5;opacity:.8}.imported{fill:none;stroke:#d22;stroke-width:.8;opacity:.9}</style>
<rect width='100%' height='100%' fill='white'/><text x='8' y='16'>${xml(title)}</text>
<text x='8' y='29'>${onlyExpanded ? 'expanded sizes' : refused ? 'export refused · original grey only' : 'original grey · re-imported red'}</text>${body.join('')}</svg>\n`;
}

async function refusalOverlay(id: string, input: string, outdir: string): Promise<void> {
  const source = bytesOf(input);
  const read = await readDxf(
    { id, name: basename(input), bytes: source },
    { sagittaMm: 0.05, keepFills: true },
  );
  const seg = segmentDxf(read);
  const sizes = seg.sizes.map((size) => size.raw.find((raw) => raw.trim()) ?? size.token);
  const sourceFamilies = families(source, sizes);
  const unit = mmPerUnit(source);
  const cells: Cell[] = [];
  for (const family of sourceFamilies.values())
    for (const size of sizes) {
      const piece = family.bySize.get(size);
      if (!piece) continue;
      cells.push({
        piece: family.piece,
        size,
        original: shapesOf(piece, unit, true),
        imported: [],
      });
    }
  if (cells.length) writeFileSync(join(outdir, `${safe(id)}.svg`), overlaySvg(cells, id));
}

function failure(outdir: string, id: string, error: unknown): number {
  const reason = error instanceof Error ? error.message : String(error);
  mkdirSync(outdir, { recursive: true });
  const report = join(outdir, `${safe(id)}.txt`);
  if (!existsSync(report)) writeFileSync(report, `case: ${id}\nFAIL: ${reason}\n`);
  console.log(`FAIL ${reason.replace(/\s+/g, ' ').slice(0, 500)}`);
  return 1;
}

async function exportCase(id: string, input: string, outdir: string): Promise<number> {
  const source = bytesOf(input);
  let result: Awaited<ReturnType<typeof exportDxfRulArchive>>;
  try {
    result = await exportDxfRulArchive(source, basename(input));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason !== RUL_SINGLE_SIZE_REASON) throw error;
    const read = await readDxf(
      { id, name: basename(input), bytes: source },
      { sagittaMm: 0.05, keepFills: true },
    );
    const seg = segmentDxf(read);
    const sourceBlocks = pieceBlocks(ast(source));
    const tails = new Set(
      sourceBlocks.map((block) => bareSize(block.block.name.split('_').at(-1) ?? '')),
    );
    const oneSizeToken =
      seg.sizes.length === 1
        ? seg.sizes[0].raw.find((value) => value.trim()) ?? seg.sizes[0].token
        : tails.size === 1 && ['OS', 'UNI'].includes([...tails][0])
          ? [...tails][0]
          : null;
    if (!seg.presegmented || !sourceBlocks.length || !oneSizeToken) throw error;
    await refusalOverlay(id, input, outdir);
    writeFileSync(
      join(outdir, `${safe(id)}.txt`),
      [`case: ${id}`, `source sizes: 1 (${oneSizeToken})`, `expected refusal: ${reason}`, ''].join(
        '\n',
      ),
    );
    console.log(`expected refusal: ${reason}`);
    console.log('PASS');
    return 0;
  }
  const zipPath = join(outdir, result.fileName);
  writeFileSync(zipPath, Buffer.from(await result.blob.arrayBuffer()));

  // Read the bytes back from disk and enter through the exact ZIP/RUL adapter chain used by the
  // upload session before its ordinary DXF reader takes over.
  const pair = zipRulPair(bytesOf(zipPath));
  if (!pair) throw new Error('the importer did not recognise the written ZIP as a DXF + RUL pair');
  const table = parseRul(pair.rul.bytes, pair.rul.name);
  const expanded = expandRul({
    dxf: pair.dxf.bytes,
    dxfName: pair.dxf.name,
    rul: table,
    rulName: pair.rul.name,
  });
  const importedBytes = enc(expanded.text);
  const importedRead = await readDxf(
    { id, name: pair.dxf.name, bytes: importedBytes },
    { sagittaMm: 0.05, keepFills: true },
  );
  const importedSeg = segmentDxf(importedRead);
  if (!importedSeg.presegmented || importedSeg.sizes.length !== result.sizes.length)
    throw new Error(
      `the UI DXF path read ${importedSeg.sizes.length}/${result.sizes.length} expanded sizes`,
    );

  const original = families(source, result.sizes);
  const imported = families(importedBytes, result.sizes);
  const originalUnit = mmPerUnit(source);
  const importedUnit = mmPerUnit(importedBytes);
  const cells: Cell[] = [];
  const rows: { piece: string; size: string; error: number; detail: string }[] = [];
  for (const family of original.values()) {
    const back = imported.get(family.piece);
    if (!back) throw new Error(`${family.piece}: no piece came back from the RUL`);
    const basePiece = family.bySize.get(result.base);
    if (!basePiece) throw new Error(`${family.piece}: no base-size block ${result.base}`);
    const sig = markerSig(basePiece);
    const markers =
      !!sig && result.sizes.every((size) => markerSig(family.bySize.get(size)!) === sig);
    for (const size of result.sizes) {
      const a = family.bySize.get(size);
      const b = back.bySize.get(size);
      if (!a || !b) throw new Error(`${family.piece} ${size}: missing before or after the RUL`);
      const cell: Cell = {
        piece: family.piece,
        size,
        original: shapesOf(a, originalUnit, markers),
        imported: shapesOf(b, importedUnit, markers),
      };
      const error = cellError(cell);
      const errors =
        cell.original.length === cell.imported.length
          ? cell.original.map((shape, i) => ({
              i,
              shape,
              error: shapeError(shape, cell.imported[i]),
            }))
          : [];
      const worst = errors.sort((a, b) => b.error - a.error)[0];
      cells.push(cell);
      rows.push({
        piece: family.piece,
        size,
        error,
        detail: worst
          ? `${worst.i}:${worst.shape.layer}/${worst.shape.kind}/${worst.shape.pts.length}`
          : cell.original.length === cell.imported.length
            ? '-'
            : 'union insertion',
      });
    }
  }
  if (original.size !== result.pieces)
    throw new Error(
      `the writer reports ${result.pieces} pieces, the source comparison found ${original.size}`,
    );
  const maxError = Math.max(0, ...rows.map((r) => r.error));
  const report = [
    `case: ${id}`,
    `base size: ${result.base}`,
    `rule count: ${result.rules}`,
    `pieces: ${result.pieces}`,
    `sizes: ${result.sizes.length} (${result.sizes.join(' ')})`,
    `writer proof max err mm: ${result.maxErrMm.toFixed(6)}`,
    `nudges: ${result.nudges}`,
    `insertions: ${result.insertions}`,
    '',
    'piece\tsize\tmax err mm\tworst shape',
    ...rows.map(
      (r) =>
        `${r.piece}\t${r.size}\t${Number.isFinite(r.error) ? r.error.toFixed(6) : 'INF'}\t${r.detail}`,
    ),
    '',
    `MAX\t\t${Number.isFinite(maxError) ? maxError.toFixed(6) : 'INF'}`,
    '',
  ].join('\n');
  writeFileSync(join(outdir, `${safe(id)}.txt`), report);
  writeFileSync(join(outdir, `${safe(id)}.svg`), overlaySvg(cells, id));
  if (!Number.isFinite(maxError) || maxError > 0.1)
    throw new Error(`round-trip max error ${maxError.toFixed(3)} mm exceeds 0.1 mm`);
  console.log(`max error ${maxError.toFixed(6)} mm`);
  console.log('PASS');
  return 0;
}

async function importCase(id: string, input: string, outdir: string): Promise<number> {
  const dxf = bytesOf(input);
  const rulPath = input.slice(0, -extname(input).length) + '.rul';
  const rulName = basename(rulPath);
  const table: RulTable = parseRul(bytesOf(rulPath), rulName);
  const basePieces = pieceBlocks(ast(dxf));
  const expanded = expandRul({ dxf, dxfName: basename(input), rul: table, rulName });
  const expandedBytes = enc(expanded.text);
  const read = await readDxf(
    { id, name: basename(input), bytes: expandedBytes },
    { sagittaMm: 0.05, keepFills: true },
  );
  const seg = segmentDxf(read);
  const expected = basePieces.length * table.sizes.length;
  const got = pieceBlocks(ast(expandedBytes));
  const complete =
    seg.presegmented &&
    expanded.blocks.length === expected &&
    got.length === expected &&
    seg.pieces.length === expected &&
    seg.sizes.length === table.sizes.length;
  const unit = mmPerUnit(expandedBytes);
  const expandedFamilies = families(expandedBytes, table.sizes);
  const cells: Cell[] = [];
  for (const family of expandedFamilies.values())
    for (const size of table.sizes) {
      const piece = family.bySize.get(size);
      if (!piece) continue;
      cells.push({
        piece: family.piece,
        size,
        original: [],
        imported: shapesOf(piece, unit, true),
      });
    }
  const declared = table.declaredSizes ?? table.sizes;
  const report = [
    `pieces: ${basePieces.length}`,
    `sizes: ${table.sizes.length}`,
    `blocks: ${got.length}/${expected}`,
    `declared: ${declared.length} (${declared.join(' ')})`,
    `expanded: ${table.sizes.join(' ')}`,
    ...(table.warnings.length ? [`warnings: ${table.warnings.join(' | ')}`] : []),
    '',
  ].join('\n');
  writeFileSync(join(outdir, `${safe(id)}.txt`), report);
  writeFileSync(join(outdir, `${safe(id)}.svg`), overlaySvg(cells, id, true));
  if (!complete)
    throw new Error(
      `expanded ${got.length}/${expected} piece-size blocks and ${seg.sizes.length}/${table.sizes.length} sizes`,
    );
  console.log(`pieces ${basePieces.length} sizes ${table.sizes.length}`);
  console.log('PASS');
  return 0;
}

export async function main(args: string[]): Promise<number> {
  const [id, input, outdir] = args;
  if (!id || !input || !outdir) {
    console.log('FAIL usage: golden-rul <id> <input.dxf> <outdir>');
    return 2;
  }
  mkdirSync(outdir, { recursive: true });
  try {
    return id.endsWith('-export')
      ? await exportCase(id, input, outdir)
      : id.endsWith('-import')
        ? await importCase(id, input, outdir)
        : failure(outdir, id, new Error('case id must end in -export or -import'));
  } catch (error) {
    if (id.endsWith('-export')) {
      try {
        await refusalOverlay(id, input, outdir);
      } catch {
        // The refusal text is still the authoritative artifact if even the source cannot render.
      }
    }
    return failure(outdir, id, error);
  }
}
