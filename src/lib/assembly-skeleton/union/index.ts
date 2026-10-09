// Union pictogram (lane C): layout of a unit's pieces along its seams → drawable picture.
export { unionLayout, resolveEdge, pieceKeyOf, type UnionOptions } from './layout';
export { unionPicture, type UnionPicture, type UnionShape } from './picture';
export { rasterize, intersectArea, pairOverlap, type Raster } from './overlap';
