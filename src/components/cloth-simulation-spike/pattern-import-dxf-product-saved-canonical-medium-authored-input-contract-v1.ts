// Exact structural legacy authoring DTO only; this type issues no authority.
import type { DxfProductTwoPanelSkirtPlacementSemanticsRequestV1 as SemanticsRequest } from 'lib/cloth/domain/dxf-product-two-panel-skirt-placement-semantics-v1';

export type PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1 = Readonly<{
  semantics: Readonly<{
    origin: SemanticsRequest['origin'];
    garment: SemanticsRequest['garment'];
    body: SemanticsRequest['body'];
    policy: SemanticsRequest['policy'];
  }>;
  displayBody: Readonly<{
    modelId: string;
    modelContentRevision: string;
    inputFingerprint: string;
    basisKind: 'neutral';
    posePresetId: 'a-rest';
  }>;
  frame: {
    readonly waistSlantRadiusMm: 700;
    readonly hemSlantRadiusMm: 900;
    readonly sectorSpanRadPerPiece: 0.64;
    readonly waistSourceCurveCountPerPiece: 40;
    readonly hemSourceCurveCountPerPiece: 50;
    readonly radialSourceCurveCountPerPiece: 2;
    readonly seamAnchorAngleRad: 0;
    readonly pieces: readonly [
      Readonly<{
        pieceId: 'FRONT';
        planarApexMm: readonly [0, 0];
        planarMirrorSign: 1;
        bodyAngularSign: -1;
      }>,
      Readonly<{
        pieceId: 'BACK';
        planarApexMm: readonly [0, 0];
        planarMirrorSign: -1;
        bodyAngularSign: 1;
      }>,
    ];
  };
}>;
