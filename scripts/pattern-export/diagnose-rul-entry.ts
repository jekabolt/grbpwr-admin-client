import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { readDxf, segmentDxf, bareSize } from 'lib/pattern-import/adapters/dxf';
import { buildAst } from 'lib/pattern-import/adapters/dxf/ast';
import { loadDxf } from 'lib/pattern-import/adapters/dxf/tags';
import { pieceBlocks } from 'lib/pattern-import/adapters/rul/model';

const bytesOf = (path: string): ArrayBuffer => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

export async function main(args: string[]): Promise<void> {
  const [path, match = ''] = args;
  const bytes = bytesOf(path);
  const read = await readDxf(
    { id: 'diagnose', name: basename(path), bytes },
    { sagittaMm: 0.05, keepFills: true },
  );
  const seg = segmentDxf(read);
  const sizes = seg.sizes.map((s) => s.raw.find((v) => v.trim()) ?? s.token);
  console.log(`sizes: ${sizes.join(' ')} sample: ${seg.sampleSize?.token ?? 'none'}`);
  const toks = new Set(sizes.map(bareSize));
  for (const p of pieceBlocks(buildAst(loadDxf(bytes).tok.tags))) {
    const parts = p.block.name.split('_');
    const tail = parts.at(-1) ?? '';
    const size = toks.has(bareSize(p.sizeLabel ?? tail)) ? p.sizeLabel ?? tail : '?';
    const stem = parts.slice(0, -1).join('_');
    if (match && stem.toLowerCase() !== match.toLowerCase()) continue;
    const groups = new Map<string, string[]>();
    p.entities
      .filter(
        (m) =>
          (m.kind === 'chain' || m.kind === 'point') &&
          !new Set(['2', '3', '84', '85', '86', '87']).has(m.layer),
      )
      .forEach((m) => {
        const key = `${m.raw.type}/L${m.layer}/${m.closed ? 'C' : 'O'}`;
        const pts = m.slots
          .slice(0, 10)
          .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
          .join(';');
        groups.set(key, [...(groups.get(key) ?? []), `${m.slots.length}[${pts}]`]);
      });
    const sig = [...groups].map(
      ([key, values]) => `${key} ×${values.length}: ${values.join(' | ')}`,
    );
    const labels = p.entities
      .filter((entity) => entity.kind === 'label')
      .map((entity) => entity.text)
      .filter(Boolean)
      .join(' | ');
    console.log(
      `${p.block.name}\tsize=${size}\tpiece=${p.pieceLabel ?? '-'}\tlabels=${labels}\n  ${sig.join('\n  ')}`,
    );
  }
}
