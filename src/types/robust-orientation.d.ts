declare module 'robust-orientation' {
  type Point2 = readonly [number, number];
  export default function robustOrientation(a: Point2, b: Point2, c: Point2): number;
}
