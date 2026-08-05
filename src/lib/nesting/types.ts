// Shared contract of the nesting (раскладка) feature. This is the ONLY module under
// lib/nesting/ that main-thread UI code may import — everything else (dxf-parser,
// clipper2-js, the geometry) must stay reachable only from the worker graph so none of it
// lands in the main bundle.

export type Pt = { x: number; y: number };

export type Unit = 'auto' | 'mm' | 'cm' | 'in';

// Rotations are whole degrees CCW. Grain runs along the strip (+X), so 0/180 are always
// allowed and 90/270 only when the operator explicitly permits cross-grain.
export type RotationDeg = 0 | 90 | 180 | 270;

export type ParseOpts = {
  // Manual override; 'auto' reads $INSUNITS and falls back to mm (the AAMA norm).
  unit: Unit;
  // Sagitta tolerance for arc/spline tessellation, cm.
  tol: number;
  // Endpoint-snap tolerance for chaining open segments into loops, cm.
  tolChain: number;
};

export type PieceDTO = {
  id: number;
  // Block name from the DXF when the file is AAMA-shaped, else «деталь N».
  name: string;
  // Which uploaded file the piece came from (display).
  source: string;
  // Outer contour, CCW, cm, origin at the piece's bbox min corner.
  poly: Pt[];
  bboxW: number; // cm
  bboxH: number; // cm
  areaCm2: number;
};

export type NestPieceConfig = {
  pieceId: number;
  quantity: number;
};

export type NestConfig = {
  pieces: NestPieceConfig[];
  fabricWidthCm: number;
  // Optional target the verdict is judged against; nesting itself is unbounded along X.
  targetLengthCm?: number;
  gapCm: number;
  edgeMarginCm: number;
  allowCrossGrain: boolean; // adds 90/270 to the rotation set
  timeBudgetMs: number;
  // RDP simplification epsilon for NFP inputs, cm.
  rdpEpsCm: number;
};

export type Placement = {
  pieceId: number;
  // 0-based copy number for quantity > 1 (display only).
  instance: number;
  rot: RotationDeg;
  // Translation of the piece's local origin, cm, strip frame (x along fabric, y across).
  x: number;
  y: number;
};

export type NestResult = {
  placements: Placement[];
  usedLengthCm: number;
  efficiency: number; // Σ piece area / (width × usedLength), 0..1
  placedCount: number;
  totalCount: number;
  generation: number;
  elapsedMs: number;
  // Non-fatal geometry notes (e.g. a degenerate contour fell back to its convex hull).
  warnings: string[];
};

export type WorkerRequest =
  // parseId on nest ties the job to the parse it was configured against — a nest that
  // races a newer parse is rejected instead of silently nesting the wrong geometry.
  | { type: 'parse'; id: number; files: File[]; opts: ParseOpts }
  | { type: 'nest'; id: number; parseId: number; config: NestConfig }
  | { type: 'cancel'; id: number };

export type WorkerResponse =
  | {
      type: 'parsed';
      id: number;
      pieces: PieceDTO[];
      detectedUnit: Exclude<Unit, 'auto'>;
      warnings: string[];
    }
  | {
      type: 'progress';
      id: number;
      phase: 'nfp' | 'ga';
      generation?: number;
      best?: NestResult;
      // NFP prepass progress (phase 'nfp').
      nfpDone?: number;
      nfpTotal?: number;
    }
  | { type: 'result'; id: number; result: NestResult }
  | { type: 'error'; id: number; message: string };

export const NEST_DEFAULTS = {
  fabricWidthCm: 140,
  gapCm: 0.5,
  edgeMarginCm: 0,
  allowCrossGrain: false,
  timeBudgetMs: 20_000,
  tol: 0.02,
  tolChain: 0.05,
  rdpEpsCm: 0.05,
} as const;

// Closed loops smaller than this are drill holes / notch marks, not pieces.
export const MIN_PIECE_AREA_CM2 = 4;
