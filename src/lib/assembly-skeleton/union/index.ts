// Union pictogram (lane C): layout of a unit's pieces along its seams → drawable picture.
export {
  unionLayout,
  orderSideAlongOutline,
  resolveEdge,
  pieceKeyOf,
  pieceTilt,
  runOf,
  sidewaysTrials,
  tiltOf,
  type RunPart,
  type UnionOptions,
} from './layout';
export { unionPicture, type UnionPicture, type UnionShape } from './picture';
export {
  fitLayerToHostUnion,
  type LayerOutlineFit,
  type LayerOutlineFitOptions,
} from './layer-fit';
export { rasterize, intersectArea, pairOverlap, unionRaster, type Raster } from './overlap';
export { unitLeaves, unitPictures, type UnitStep } from './unit-pictures';
