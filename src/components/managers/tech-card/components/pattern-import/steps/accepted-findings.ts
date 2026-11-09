// Re-upload exception for the check step. A finding is accepted only when the new block binds to
// the same card piece whose current sheet already has that check; spelling is deliberately absent
// from the comparison so CLO-style renames do not turn an accepted condition into a new one.

import { embedManifest } from 'lib/pattern-import/manifest';
import { SHAPE_SAME, shapeCost } from 'lib/pattern-import/fabrics/draft';
import type {
  CardDraft,
  DraftShapeRef,
  GateCheck,
  GateCheckId,
  GateReport,
} from 'lib/pattern-import/types';

const REIMPORT_CHECKS = new Set<GateCheckId>(['G5-features', 'G12-pair', 'G16-glyphs']);
const key = (value: string) => value.trim().toLowerCase();

function acceptedCheck(
  check: GateCheck,
  scopeKey: string,
  draft: CardDraft,
  shapes: readonly DraftShapeRef[],
): boolean {
  if (
    check.ok ||
    check.severity !== 'block' ||
    !REIMPORT_CHECKS.has(check.id) ||
    check.shapeIssues?.length ||
    !check.blocks.length ||
    check.blocks.includes('*')
  )
    return false;
  const scope = draft.scopes.find((candidate) => candidate.target.scopeKey === scopeKey);
  const replacedUrl = scope?.replaces?.url;
  if (!scope || !replacedUrl) return false;
  const spelling = new Map<string, string>();
  for (const piece of scope.manifest.pieces) {
    const blocks = scope.manifest.blocks.filter((block) => block.identity === piece.identity);
    const ungraded = blocks.find((block) => block.sizeToken.toUpperCase() === 'UNI');
    spelling.set(key(piece.identity), key(ungraded?.block ?? piece.identity));
  }
  const aliases = new Map(
    draft.aliases
      .filter((alias) => alias.scopeKey === scopeKey)
      .map((alias) => [key(alias.blockName), alias.pieceLineKey]),
  );
  const accepted = new Set(
    shapes
      .filter(
        (shape) =>
          shape.scopeKey === scopeKey &&
          shape.url === replacedUrl &&
          shape.acceptedGate?.includes(check.id),
      )
      .map((shape) => key(shape.pieceLineKey)),
  );
  if (!accepted.size) return false;
  const acceptedShapes = shapes.filter(
    (shape) =>
      shape.scopeKey === scopeKey &&
      shape.url === replacedUrl &&
      shape.acceptedGate?.includes(check.id),
  );
  for (const block of check.blocks) {
    const manifestBlock = scope.manifest.blocks.find(
      (candidate) => key(candidate.block) === key(block),
    );
    const identity = manifestBlock?.identity ?? block;
    const piece = aliases.get(spelling.get(key(identity)) ?? key(identity));
    if (piece && accepted.has(key(piece))) continue;
    const identityBlocks = scope.manifest.blocks.filter(
      (candidate) => key(candidate.identity) === key(identity),
    );
    if (
      !identityBlocks.length ||
      !acceptedShapes.some((shape) => {
        const cost = shapeCost(identityBlocks, shape.sizes);
        return cost != null && cost <= SHAPE_SAME;
      })
    )
      return false;
  }
  return true;
}

function acceptedReport(
  report: GateReport,
  scopeKey: string,
  draft: CardDraft,
  shapes: readonly DraftShapeRef[],
): GateReport {
  let changed = false;
  const checks = report.checks.map((check) => {
    if (!acceptedCheck(check, scopeKey, draft, shapes)) return check;
    changed = true;
    return {
      ...check,
      severity: 'warn' as const,
      note: `${check.note}; accepted on current card sheet`,
    };
  });
  return changed
    ? { ...report, checks, passed: checks.every((check) => check.ok || check.severity === 'warn') }
    : report;
}

/** Downgrade accepted findings in session state and in the DXFs that will be applied. */
export function acceptCurrentFindings(
  gate: Record<string, GateReport>,
  draft: CardDraft,
  shapes: readonly DraftShapeRef[],
): { gate: Record<string, GateReport>; draft: CardDraft } {
  const nextGate = Object.fromEntries(
    Object.entries(gate).map(([scopeKey, report]) => [
      scopeKey,
      acceptedReport(report, scopeKey, draft, shapes),
    ]),
  );
  let changed = false;
  const scopes = draft.scopes.map((scope) => {
    const stored = scope.manifest.gate;
    if (!stored) return scope;
    const report = acceptedReport(stored, scope.target.scopeKey, draft, shapes);
    if (report === stored) return scope;
    changed = true;
    const manifest = { ...scope.manifest, gate: report };
    return { ...scope, manifest, dxfText: embedManifest(scope.dxfText, manifest) };
  });
  if (!changed) return { gate: nextGate, draft };
  return {
    gate: nextGate,
    draft: {
      ...draft,
      scopes,
      downloads: scopes.map((scope) => ({ filename: scope.filename, dxfText: scope.dxfText })),
    },
  };
}
