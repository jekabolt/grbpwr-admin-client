// TEMPORARY STUB of the lane C1 flat picture API so the quiz compiles; the real file replaces it.

export function SpreadChoicePicture(_p: { kind: 'single' | 'table' }): JSX.Element {
  return <svg aria-hidden />;
}

export function TablePicture(_p: {
  lengthCm: number;
  widthCm: number | null;
  maxStackCm?: number | null;
}): JSX.Element {
  return <svg aria-hidden />;
}

export function KnifePicture(_p: { maxStackCm: number; stackCm?: number }): JSX.Element {
  return <svg aria-hidden />;
}

export function GarmentPile(_p: { qty: number }): JSX.Element {
  return <svg aria-hidden />;
}

export function LayersPicture(_p: {
  tableLengthCm: number;
  layCm: number;
  plies: number;
  plySizes: string[];
  stackCm: number;
  stackOk: boolean;
  faceToFace: boolean;
}): JSX.Element {
  return <svg aria-hidden />;
}

export function EndsPicture(_p: {
  endLossCm: number;
  layCm: number;
  tableLengthCm: number;
}): JSX.Element {
  return <svg aria-hidden />;
}

export function LayOnTablePicture(_p: {
  mode: 'single' | 'table';
  tableLengthCm: number;
  markerLengthCm: number;
  plies: number;
  fits: boolean;
}): JSX.Element {
  return <svg aria-hidden />;
}
