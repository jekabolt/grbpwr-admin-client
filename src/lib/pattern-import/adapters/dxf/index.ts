// F8 — DXF input adapter. Public surface (08-CONTRACT §2):
//   extractDxf: ExtractFn            — DXF → SourceDoc (IR, mm, provenance on every path/text)
//   isOurDxf(text): boolean          — our manifest is present (trust it over every heuristic)
// plus the DXF fast path the contract does not have yet (proposed in reports/F8.md):
//   readDxf → { doc, meta }          — the IR and the DXF side channel (groups, POINT attrs, tally)
//   readDxfWithPathProvenanceV1      — opt-in original-PathId native-curve provenance sidecar
//   readDxfWithSourceNativeStraightEdgeAuthorityV1 — opt-in opaque source-line authority owner
//   segmentDxf(read)                 — pre-segmented piece candidates (blocks → pieces × sizes)
//   dxfFastPath(read, seg)           — Sheet / ChainSet / SizeRun / Seeds / PieceFamilies typed by
//                                      the contract, so the wizard skips assemble/chains/pieces.
export { extractDxf, readDxf, readDxfWithPathProvenanceV1 } from './extract';
export {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_AUTHORITY_V1,
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_CONTRACT_V1,
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_LIMITS_V1,
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_OWNER_V1,
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_PROJECTION_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeAuthorityV1,
  readDxfWithSourceNativeStraightEdgeAuthorityV1,
  type DxfSourceNativeStraightEdgeBlockerCodeV1,
  type DxfSourceNativeStraightEdgeBlockerV1,
  type DxfSourceNativeStraightEdgeDescriptorV1,
  type DxfSourceNativeStraightEdgeOwnerV1,
  type DxfSourceNativeStraightEdgeProjectionRequestV1,
  type DxfSourceNativeStraightEdgeProjectionResultV1,
  type DxfSourceNativeStraightEdgeProjectionV1,
  type DxfSourceNativeStraightEdgeReadResultV1,
  type DxfSourceNativeStraightEdgeReadV1,
  type DxfSourceNativeStraightEdgeUnsupportedCodeV1,
} from '../../dxf-source-native-straight-edge-authority-v1';
export { isOurDxf } from './tags';
export { segmentDxf, layerKind, bareSize, chooseDxfSizeLabel } from './segment';
export {
  dxfFastPath,
  dxfPresegmentedIdentities,
  dxfWrittenPresegmentedIdentities,
  dxfScaleCandidates,
  settleSeamPair,
  type DxfFastPath,
} from './stages';
export { DxfImportError, isDxfImportError, type DxfImportErrorKind } from './errors';
export type * from './dxf-types';
