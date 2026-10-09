// File name → which adapter reads it (08-CONTRACT §2 adapters). EPS is refused by F12
// (`UnsupportedFormat`); the files step says so before anything is read.
import type { SourceFileInfo } from 'lib/pattern-import/types';

const KIND_OF_EXT: Record<string, SourceFileInfo['kind']> = {
  pdf: 'pdf',
  dxf: 'dxf',
  png: 'raster',
  jpg: 'raster',
  jpeg: 'raster',
  tif: 'raster',
  tiff: 'raster',
  plt: 'hpgl',
  hpgl: 'hpgl',
  hpg: 'hpgl',
  svg: 'svg',
  ai: 'ai',
};

export function kindOfName(name: string): SourceFileInfo['kind'] | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return KIND_OF_EXT[ext] ?? null;
}
