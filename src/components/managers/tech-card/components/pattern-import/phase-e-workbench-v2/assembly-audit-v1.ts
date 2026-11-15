import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type {
  PatternImportDxfProductPhaseEMultiseamProposalV2,
  PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2,
} from 'lib/pattern-import/dxf-product-phase-e-multiseam-workbench-v2';

export const PATTERN_IMPORT_DXF_PHASE_E_ASSEMBLY_AUDIT_V1 =
  'pattern-import-dxf-phase-e-assembly-audit/1' as const;

export type PatternImportDxfPhaseEAssemblyAuditIssueCodeV1 =
  | 'stale-topology-anchor'
  | 'stale-seam-authority'
  | 'missing-side-assignment'
  | 'unfinished-seam-recipe'
  | 'unfinished-operation'
  | 'missing-material-assignment'
  | 'unfinished-surface-recipe'
  | 'unfinished-tolerance-recipe';

export type PatternImportDxfPhaseEAssemblyAuditAnchorV1 = Readonly<{
  operationId: string;
  seamId: string | null;
  sideIndex: 0 | 1 | null;
  pieceId: string | null;
  contourId: string | null;
  boundaryVertexIds: readonly string[];
}>;

export type PatternImportDxfPhaseEAssemblyAuditIssueV1 = Readonly<{
  id: string;
  code: PatternImportDxfPhaseEAssemblyAuditIssueCodeV1;
  severity: 'error' | 'warning';
  anchor: PatternImportDxfPhaseEAssemblyAuditAnchorV1;
  message: string;
  action: string;
}>;

export type PatternImportDxfPhaseEAssemblyAuditReportV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ASSEMBLY_AUDIT_V1;
  issues: readonly PatternImportDxfPhaseEAssemblyAuditIssueV1[];
  errorCount: number;
  warningCount: number;
}>;

export type PatternImportDxfPhaseEAssemblyAuditInputV1 = Readonly<{
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  proposal: PatternImportDxfProductPhaseEMultiseamProposalV2;
  state: PatternImportDxfProductPhaseEMultiseamWorkbenchStateV2;
}>;

export type PatternImportDxfPhaseEAssemblyAuditNavigationV1 = Readonly<{
  issue: PatternImportDxfPhaseEAssemblyAuditIssueV1;
  index: number;
  total: number;
}>;

const textEncoder = new TextEncoder();

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of textEncoder.encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function issueId(
  code: PatternImportDxfPhaseEAssemblyAuditIssueCodeV1,
  anchor: PatternImportDxfPhaseEAssemblyAuditAnchorV1,
): string {
  return `phase-e-audit:${code}:${fnv1a64(
    JSON.stringify([
      anchor.operationId,
      anchor.seamId,
      anchor.sideIndex,
      anchor.pieceId,
      anchor.contourId,
      anchor.boundaryVertexIds,
    ]),
  )}`;
}

function frozenAnchor(
  operationId: string,
  values: Partial<PatternImportDxfPhaseEAssemblyAuditAnchorV1> = {},
): PatternImportDxfPhaseEAssemblyAuditAnchorV1 {
  return Object.freeze({
    operationId,
    seamId: values.seamId ?? null,
    sideIndex: values.sideIndex ?? null,
    pieceId: values.pieceId ?? null,
    contourId: values.contourId ?? null,
    boundaryVertexIds: Object.freeze([...(values.boundaryVertexIds ?? [])]),
  });
}

function issue(
  code: PatternImportDxfPhaseEAssemblyAuditIssueCodeV1,
  severity: PatternImportDxfPhaseEAssemblyAuditIssueV1['severity'],
  anchor: PatternImportDxfPhaseEAssemblyAuditAnchorV1,
  message: string,
  action: string,
): PatternImportDxfPhaseEAssemblyAuditIssueV1 {
  return Object.freeze({
    id: issueId(code, anchor),
    code,
    severity,
    anchor,
    message,
    action,
  });
}

function sideAnchorIsCurrent(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  pieceId: string,
  contourId: string,
  vertexIds: readonly string[],
): boolean {
  const piece = projection.pieces.find((candidate) => candidate.pieceId === pieceId);
  const contour = piece?.contours.find((candidate) => candidate.contourId === contourId);
  if (!piece || !contour || vertexIds.length !== 2) return false;
  const ordinals = vertexIds.map(
    (vertexId) => contour.vertices.find((candidate) => candidate.vertexId === vertexId)?.ordinal,
  );
  if (ordinals.some((ordinal) => ordinal === undefined)) return false;
  const [left, right] = ordinals as [number, number];
  const delta = Math.abs(left - right);
  return (
    delta === 1 ||
    (contour.closed && contour.vertices.length > 2 && delta === contour.vertices.length - 1)
  );
}

export function auditPatternImportDxfPhaseEAssemblyV1(
  input: PatternImportDxfPhaseEAssemblyAuditInputV1,
): PatternImportDxfPhaseEAssemblyAuditReportV1 {
  const { projection, proposal, state } = input;
  const operationId = proposal.operation.authoringOperationId;
  const issues: PatternImportDxfPhaseEAssemblyAuditIssueV1[] = [];

  if (
    !state.operationConfirmed ||
    !Number.isSafeInteger(state.operationStage) ||
    (state.operationStage ?? -1) < 0
  ) {
    const anchor = frozenAnchor(operationId);
    issues.push(
      issue(
        'unfinished-operation',
        'error',
        anchor,
        'The selected Assembly Order operation has no confirmed local stage.',
        'Set the local stage and confirm the stitch operation.',
      ),
    );
  }

  if (!state.physicalSurfaceConfirmed || state.physicalSurface === null) {
    const anchor = frozenAnchor(operationId);
    issues.push(
      issue(
        'unfinished-surface-recipe',
        'warning',
        anchor,
        'The physical sewing/cut surface recipe is not confirmed.',
        'Choose the physical surface and confirm its seam-allowance meaning.',
      ),
    );
  }

  for (const seam of state.seams) {
    const proposalSeam = proposal.seams.find((candidate) => candidate.id === seam.seamId);
    if (!proposalSeam) {
      const anchor = frozenAnchor(operationId, { seamId: seam.seamId });
      issues.push(
        issue(
          'stale-seam-authority',
          'error',
          anchor,
          `Seam ${seam.seamId} is no longer present in the current Assembly authority.`,
          'Reopen the Assembly Table from the current saved card before editing.',
        ),
      );
    }

    for (const [rawSideIndex, side] of seam.sides.entries()) {
      const sideIndex = rawSideIndex as 0 | 1;
      const anchor = frozenAnchor(operationId, {
        seamId: seam.seamId,
        sideIndex,
        pieceId: side.pieceId,
        contourId: side.contourId,
        boundaryVertexIds: side.boundaryVertexIds,
      });
      const assignmentComplete =
        side.contourId !== null &&
        side.boundaryVertexIds.length === 2 &&
        side.direction !== null &&
        side.confirmed;
      if (!assignmentComplete) {
        issues.push(
          issue(
            'missing-side-assignment',
            'error',
            anchor,
            `Seam ${seam.seamId} side ${sideIndex === 0 ? 'A' : 'B'} has no complete exact contour assignment.`,
            'Select one exact contour, two ordered adjacent vertices and confirm the direction.',
          ),
        );
        continue;
      }
      if (!sideAnchorIsCurrent(projection, side.pieceId, side.contourId!, side.boundaryVertexIds)) {
        issues.push(
          issue(
            'stale-topology-anchor',
            'error',
            anchor,
            `Seam ${seam.seamId} side ${sideIndex === 0 ? 'A' : 'B'} points to topology that is no longer current.`,
            'Re-select the exact contour edge from the current Phase-D projection.',
          ),
        );
      }
    }

    if (!seam.confirmed || seam.mapping !== 'equal' || seam.lengthRatio !== 1) {
      const anchor = frozenAnchor(operationId, { seamId: seam.seamId });
      issues.push(
        issue(
          'unfinished-seam-recipe',
          'error',
          anchor,
          `Seam ${seam.seamId} has no confirmed equal-mapping recipe.`,
          'Complete both exact sides and confirm the seam mapping.',
        ),
      );
    }
  }

  for (const selection of state.materialSelections) {
    if (selection.confirmed && selection.optionId) continue;
    const anchor = frozenAnchor(operationId, { pieceId: selection.pieceId });
    issues.push(
      issue(
        'missing-material-assignment',
        'warning',
        anchor,
        `Piece ${selection.pieceId} has no confirmed immutable material revision.`,
        'Select the BOM-backed material revision and confirm the assignment.',
      ),
    );
  }

  if (
    !state.tolerance.confirmed ||
    state.tolerance.endpointMm === null ||
    state.tolerance.fullLengthMm === null ||
    state.tolerance.fullLengthRelative === null
  ) {
    const anchor = frozenAnchor(operationId);
    issues.push(
      issue(
        'unfinished-tolerance-recipe',
        'warning',
        anchor,
        'The endpoint and full-length tolerance recipe is incomplete.',
        'Enter all bounded tolerances and confirm them.',
      ),
    );
  }

  const frozenIssues = Object.freeze(issues);
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ASSEMBLY_AUDIT_V1,
    issues: frozenIssues,
    errorCount: frozenIssues.filter(({ severity }) => severity === 'error').length,
    warningCount: frozenIssues.filter(({ severity }) => severity === 'warning').length,
  });
}

export function navigatePatternImportDxfPhaseEAssemblyAuditV1(
  issues: readonly PatternImportDxfPhaseEAssemblyAuditIssueV1[],
  currentIssueId: string | null,
  direction: 'previous' | 'next',
): PatternImportDxfPhaseEAssemblyAuditNavigationV1 | null {
  if (!issues.length) return null;
  const currentIndex = issues.findIndex(({ id }) => id === currentIssueId);
  const index =
    currentIndex < 0
      ? direction === 'next'
        ? 0
        : issues.length - 1
      : direction === 'next'
        ? (currentIndex + 1) % issues.length
        : (currentIndex - 1 + issues.length) % issues.length;
  return Object.freeze({ issue: issues[index], index, total: issues.length });
}
