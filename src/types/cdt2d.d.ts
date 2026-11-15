declare module 'cdt2d' {
  export type Cdt2dPoint = [x: number, y: number];
  export type Cdt2dEdge = [startIndex: number, endIndex: number];
  export type Cdt2dTriangle = [a: number, b: number, c: number];

  export type Cdt2dOptions = Readonly<{
    delaunay?: boolean;
    interior?: boolean;
    exterior?: boolean;
    infinity?: boolean;
  }>;

  export type Cdt2dImplementation = (
    points: Cdt2dPoint[],
    edges: Cdt2dEdge[],
    options?: Cdt2dOptions,
  ) => Cdt2dTriangle[];

  const cdt2d: Cdt2dImplementation;
  export default cdt2d;
}
