// semantics/ (F5) — piece meaning: cut vs seam line, allowance, fold → unfold, pairs `_L`/`_R`,
// grain, notches/drills/internal lines, identity. Public surface (08-CONTRACT §2):
//
//   detectAllowance(sheet, families[, set])   file-level AllowanceDecision (text in 9 languages +
//                                             measured gap between two nested loops)
//   buildPieceSpecs(input, progress)          SemanticsInput → SemanticsOutput (PieceSpec[] + blocked)
//   buildPieceSpecsDetailed(input)            + `wallsOf` for writeAndGate (G3/G4) and per-piece notes
//   offsetContour(pts, mm)                    clipper-based parallel curve + OffsetReport (G6)
//   unfold(pts, fold)                         half outline → whole, mirrored across the fold edge
//   mirrorAcross(pts, grain)                  the other hand of a pair
//   classifyFeatures(cand, set, sheet?)       notches / drills / grain / internal from chains

export { detectAllowance, allowanceFromTexts, readAllowanceText, measureGap } from './allowance';
export { buildPieceSpecs, buildPieceSpecsDetailed, type SemanticsDetail } from './build';
export { offsetContour, parallelDeviation, type OffsetResult } from './offset';
export { unfold, foldLineOnCut, straightFoldEdge, unfoldAreaError, type FoldLine } from './fold';
export { mirrorAcross, mirrorSizeAcrossGrain, planPair, transformSizeSpec } from './pairs';
export { classifyFeatures, notchFrom } from './features';
export { parseIdentity, readName } from './names';
