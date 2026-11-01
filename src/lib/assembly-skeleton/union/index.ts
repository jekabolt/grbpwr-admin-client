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
export {
  LOWER_LAYER_FILL,
  LOWER_LAYER_STROKE,
  LOWER_LAYER_STROKE_SCALE,
  STACKED_TWIN_OFFSET_MM,
  orderedLayerKeys,
  unionPictureOfLayout,
  unitLeaves,
  unitPictures,
  type OwnerLayerClaims,
  type UnitStep,
} from './unit-pictures';
