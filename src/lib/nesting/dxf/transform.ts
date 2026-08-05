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
  // p' = Flip?·[R(rotRad)·S(sx,sy)·(p − base) + pos], per AutoCAD INSERT + OCS semantics:
  // extrusion (0,0,−1) expresses the WHOLE insert (rotation and position included) in the
  // mirrored OCS, so the flip applies AFTER rotation and to pos too — folding it into sx
  // yields Flip·R(−θ) and comes out rotated by 2θ on rotated mirrored inserts. base/pos
  // are stored in cm — every coordinate is scaled to cm at tessellation time.
  baseX: number;
  baseY: number;
  posX: number;
  posY: number;
  sx: number;
  sy: number;
  rotRad: number;
  mirror: boolean;
};

function applyXform(p: Pt, t: Xform): Pt {
  const x0 = (p.x - t.baseX) * t.sx;
  const y0 = (p.y - t.baseY) * t.sy;
  const c = Math.cos(t.rotRad);
  const s = Math.sin(t.rotRad);
  const x = x0 * c - y0 * s + t.posX;
  const y = x0 * s + y0 * c + t.posY;
  return t.mirror ? { x: -x, y } : { x, y };
}

function insertXform(ins: IInsertEntity, block: IBlock, u: number, col: number, row: number): Xform {
  return {
    baseX: (block.position?.x ?? 0) * u,
    baseY: (block.position?.y ?? 0) * u,
    posX: ((ins.position?.x ?? 0) + col * (ins.columnSpacing || 0)) * u,
    posY: ((ins.position?.y ?? 0) + row * (ins.rowSpacing || 0)) * u,
    sx: ins.xScale || 1,
    sy: ins.yScale || 1,
    rotRad: ((ins.rotation || 0) * Math.PI) / 180,
    mirror: !!ins.extrusionDirection && ins.extrusionDirection.z === -1,
  };
}

// Total block-instance budget per file: column/row arrays multiply at every nesting
// level, so depth alone does not bound work (a nested 100×100 is 10⁸ instances).
const MAX_INSTANCES = 10_000;

type Budget = { left: number; warned: boolean };

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
  budget: Budget,
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
          if (budget.left <= 0) {
            if (!budget.warned) {
              budget.warned = true;
              warnings.push(`слишком много вложенных вставок блоков (> ${MAX_INSTANCES}) — часть пропущена`);
            }
            return;
          }
          budget.left--;
          const t = insertXform(ins, block, u, ci, ri);
          expandInto(block.entities, blocks, u, tolCm, [...transforms, t], group, warnings, depth + 1, budget);
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
  const budget: Budget = { left: MAX_INSTANCES, warned: false };

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
          if (budget.left <= 0) {
            if (!budget.warned) {
              budget.warned = true;
              warnings.push(`слишком много вставок блоков (> ${MAX_INSTANCES}) — часть пропущена`);
            }
            break;
          }
          budget.left--;
          const group: EntityGroup = { blockName: ins.name, chains: [] };
          expandInto(block.entities, blocks, u, tolCm, [insertXform(ins, block, u, ci, ri)], group, warnings, 1, budget);
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
