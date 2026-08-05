// INSERT/block expansion. AAMA/ASTM garment DXF puts each pattern piece in its own BLOCK
// with one INSERT in model space — the block name IS the piece name — so expansion keeps
// entities grouped per INSERT instance instead of flattening the file.
import type { IBlock, IEntity, IInsertEntity } from 'dxf-parser';
import type { Pt } from '../types';
import { entityToChain } from './entities';

export type LayeredChain = { pts: Pt[]; closed: boolean; layer: string };

export type EntityGroup = {
  // Block name when the group came from an INSERT; null for loose model-space entities.
  blockName: string | null;
  chains: LayeredChain[];
};

type Xform = {
  // p' = R(rotRad)·S(sx,sy)·(p − base) + pos, per AutoCAD INSERT semantics. base/pos are
  // stored in cm — every coordinate is scaled to cm at tessellation time.
  baseX: number;
  baseY: number;
  posX: number;
  posY: number;
  sx: number;
  sy: number;
  rotRad: number;
};

function applyXform(p: Pt, t: Xform): Pt {
  const x0 = (p.x - t.baseX) * t.sx;
  const y0 = (p.y - t.baseY) * t.sy;
  const c = Math.cos(t.rotRad);
  const s = Math.sin(t.rotRad);
  return { x: x0 * c - y0 * s + t.posX, y: x0 * s + y0 * c + t.posY };
}

function insertXform(ins: IInsertEntity, block: IBlock, u: number, col: number, row: number): Xform {
  // extrusionDirection.z === -1 mirrors about the Y axis (OCS flip) — negate X scale.
  const mirror = ins.extrusionDirection && ins.extrusionDirection.z === -1 ? -1 : 1;
  return {
    baseX: (block.position?.x ?? 0) * u,
    baseY: (block.position?.y ?? 0) * u,
    posX: ((ins.position?.x ?? 0) + col * (ins.columnSpacing || 0)) * u,
    posY: ((ins.position?.y ?? 0) + row * (ins.rowSpacing || 0)) * u,
    sx: (ins.xScale || 1) * mirror,
    sy: ins.yScale || 1,
    rotRad: ((ins.rotation || 0) * Math.PI) / 180,
  };
}

const MAX_DEPTH = 8;

function expandInto(
  entities: IEntity[],
  blocks: Record<string, IBlock>,
  u: number,
  tolCm: number,
  transforms: Xform[],
  group: EntityGroup,
  warnings: string[],
  depth: number,
): void {
  for (const e of entities) {
    if (e.type === 'INSERT') {
      const ins = e as IInsertEntity;
      const block = blocks[ins.name];
      if (!block || !block.entities) continue;
      if (depth >= MAX_DEPTH) {
        warnings.push(`блок «${ins.name}» вложен глубже ${MAX_DEPTH} уровней — пропущен`);
        continue;
      }
      const cols = Math.max(1, ins.columnCount || 1);
      const rows = Math.max(1, ins.rowCount || 1);
      for (let ci = 0; ci < cols; ci++) {
        for (let ri = 0; ri < rows; ri++) {
          const t = insertXform(ins, block, u, ci, ri);
          expandInto(block.entities, blocks, u, tolCm, [...transforms, t], group, warnings, depth + 1);
        }
      }
      continue;
    }
    const chain = entityToChain(e, u, tolCm);
    if (!chain || chain.pts.length < 2) continue;
    // Innermost transform first — the chain lives in the deepest block's coordinates.
    let pts = chain.pts;
    for (let i = transforms.length - 1; i >= 0; i--) {
      const t = transforms[i];
      pts = pts.map((p) => applyXform(p, t));
    }
    group.chains.push({ pts, closed: chain.closed, layer: String(e.layer ?? '0') });
  }
}

// Model space → groups. INSERTs become one group per instance (piece identity); loose
// entities pool into a single fallback group split later by containment analysis.
export function expandGroups(
  modelEntities: IEntity[],
  blocks: Record<string, IBlock>,
  u: number,
  tolCm: number,
  warnings: string[],
): EntityGroup[] {
  const groups: EntityGroup[] = [];
  const loose: EntityGroup = { blockName: null, chains: [] };

  for (const e of modelEntities) {
    if (e.type === 'INSERT') {
      const ins = e as IInsertEntity;
      const block = blocks[ins.name];
      if (!block || !block.entities) {
        warnings.push(`INSERT ссылается на отсутствующий блок «${ins.name}»`);
        continue;
      }
      const cols = Math.max(1, ins.columnCount || 1);
      const rows = Math.max(1, ins.rowCount || 1);
      for (let ci = 0; ci < cols; ci++) {
        for (let ri = 0; ri < rows; ri++) {
          const group: EntityGroup = { blockName: ins.name, chains: [] };
          expandInto(block.entities, blocks, u, tolCm, [insertXform(ins, block, u, ci, ri)], group, warnings, 1);
          if (group.chains.length > 0) groups.push(group);
        }
      }
      continue;
    }
    const chain = entityToChain(e, u, tolCm);
    if (!chain || chain.pts.length < 2) continue;
    loose.chains.push({ pts: chain.pts, closed: chain.closed, layer: String(e.layer ?? '0') });
  }

  if (loose.chains.length > 0) groups.push(loose);
  return groups;
}
