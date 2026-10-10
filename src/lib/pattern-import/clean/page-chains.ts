// clean/ (A8) — the line work of ONE input page, linked the way chains/ links a sheet, so the page
// detectors read the same strokes the legend would (a PDF that draws every segment as its own
// operation — wm: 800 one-segment paths a page — is useless path by path).
import type { Chain, IRPage, PathId, Sheet } from 'lib/pattern-import/types';

import { DEFAULT_CHAIN_OPTS } from '../chains/build';
import { bboxOf } from '../chains/geom';
import { makeChains } from '../chains/make';

/** A page as a one-tile sheet in its own frame (identity pose). */
export function pageAsSheet(pg: IRPage, paths = pg.paths): Sheet {
  return {
    id: 0,
    poses: [
      {
        file: pg.file,
        page: pg.page,
        toSheet: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        widthMm: pg.widthMm,
        heightMm: pg.heightMm,
        residualMm: 0,
      },
    ],
    pairs: [],
    bbox: { minX: 0, minY: 0, maxX: pg.widthMm, maxY: pg.heightMm },
    missing: [],
    paths,
    texts: pg.texts,
    rasters: pg.rasters,
    styles: pg.styles,
    warnings: [],
  };
}

export type PageChains = {
  page: IRPage;
  chains: Chain[];
  /** Source paths of each chain (page `IRPath.id`s). */
  pathsOf: PathId[][];
  box: { minX: number; minY: number; maxX: number; maxY: number }[];
};

export function pageChains(pg: IRPage): PageChains {
  const { chains } = makeChains(pageAsSheet(pg), DEFAULT_CHAIN_OPTS);
  return {
    page: pg,
    chains,
    pathsOf: chains.map((c) => [...new Set(c.ranges.map((r) => r.path))]),
    box: chains.map((c) => bboxOf(c.pts)),
  };
}

export const extentOf = (b: { minX: number; minY: number; maxX: number; maxY: number }) =>
  Math.max(b.maxX - b.minX, b.maxY - b.minY);
