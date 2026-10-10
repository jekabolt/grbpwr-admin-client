// F8 — DXF input adapter. Public surface (08-CONTRACT §2):
//   extractDxf: ExtractFn            — DXF → SourceDoc (IR, mm, provenance on every path/text)
//   isOurDxf(text): boolean          — our manifest is present (trust it over every heuristic)
// plus the DXF fast path the contract does not have yet (proposed in reports/F8.md):
//   readDxf → { doc, meta }          — the IR and the DXF side channel (groups, POINT attrs, tally)
//   segmentDxf(read)                 — pre-segmented piece candidates (blocks → pieces × sizes)
//   dxfFastPath(read, seg)           — Sheet / ChainSet / SizeRun / Seeds / PieceFamilies typed by
//                                      the contract, so the wizard skips assemble/chains/pieces.
export { extractDxf, readDxf } from './extract';
export { isOurDxf } from './tags';
export { segmentDxf, layerKind, bareSize } from './segment';
export { dxfFastPath, dxfScaleCandidates, settleSeamPair, type DxfFastPath } from './stages';
export { DxfImportError, isDxfImportError, type DxfImportErrorKind } from './errors';
export type * from './dxf-types';
