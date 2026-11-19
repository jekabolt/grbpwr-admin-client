import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import {
  resolvePatternImportDxfPhaseEVertexV1,
  type PatternImportDxfPhaseEVertexAnchorV1,
} from './measurement-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1 =
  'pattern-import-dxf-phase-e-callout-session/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_CONTRACT_V1 = Object.freeze({
  exactTopologyAnchorRequired: true,
  nearestOrSnappingRecoveryAllowed: false,
  sessionOnly: true,
  persistenceIntegrated: false,
} as const);

export type PatternImportDxfPhaseECalloutV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1;
  id: string;
  anchor: PatternImportDxfPhaseEVertexAnchorV1;
  text: string;
}>;

export type PatternImportDxfPhaseECalloutSessionBlockerCodeV1 =
  | 'invalid-callout-id'
  | 'duplicate-callout-id'
  | 'invalid-callout-text'
  | 'anchor-not-found'
  | 'callout-not-found'
  | 'session-callout-invalid';

export type PatternImportDxfPhaseECalloutSessionResultV1 =
  | Readonly<{
      ok: true;
      callouts: readonly PatternImportDxfPhaseECalloutV1[];
      changed: PatternImportDxfPhaseECalloutV1 | null;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      callouts: null;
      changed: null;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfPhaseECalloutSessionBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const MAX_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 500;

function blocked(
  code: PatternImportDxfPhaseECalloutSessionBlockerCodeV1,
  detail: string,
): PatternImportDxfPhaseECalloutSessionResultV1 {
  return Object.freeze({
    ok: false,
    callouts: null,
    changed: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      Readonly<{ code: PatternImportDxfPhaseECalloutSessionBlockerCodeV1; detail: string }>,
    ],
  });
}

function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    STABLE_ID.test(value)
  );
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > MAX_TEXT_LENGTH) return null;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x08 || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f))
      return null;
  }
  return text;
}

function freezeCallout(
  id: string,
  anchor: PatternImportDxfPhaseEVertexAnchorV1,
  text: string,
): PatternImportDxfPhaseECalloutV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1,
    id,
    anchor: Object.freeze({ ...anchor }),
    text,
  });
}

function validExistingSession(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  callouts: readonly PatternImportDxfPhaseECalloutV1[],
): PatternImportDxfPhaseECalloutSessionResultV1 | null {
  const ids = new Set<string>();
  for (const callout of callouts) {
    if (
      callout?.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_CALLOUT_SESSION_V1 ||
      !validId(callout.id) ||
      normalizedText(callout.text) !== callout.text ||
      !callout.anchor ||
      ids.has(callout.id)
    )
      return blocked(
        'session-callout-invalid',
        'The current callout session contains an invalid or duplicate callout record.',
      );
    ids.add(callout.id);
    if (!resolvePatternImportDxfPhaseEVertexV1(projection, callout.anchor))
      return blocked(
        'anchor-not-found',
        `Callout ${callout.id} is anchored to a topology vertex that is no longer current.`,
      );
  }
  return null;
}

function success(
  callouts: readonly PatternImportDxfPhaseECalloutV1[],
  changed: PatternImportDxfPhaseECalloutV1 | null,
): PatternImportDxfPhaseECalloutSessionResultV1 {
  return Object.freeze({
    ok: true,
    callouts: Object.freeze([...callouts]),
    changed,
    blockers: Object.freeze([]) as readonly [],
  });
}

export function createPatternImportDxfPhaseECalloutV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  callouts: readonly PatternImportDxfPhaseECalloutV1[],
  input: Readonly<{
    id: string;
    anchor: PatternImportDxfPhaseEVertexAnchorV1;
    text: string;
  }>,
): PatternImportDxfPhaseECalloutSessionResultV1 {
  const invalidSession = validExistingSession(projection, callouts);
  if (invalidSession) return invalidSession;
  if (!validId(input.id))
    return blocked('invalid-callout-id', 'Callout id must be one bounded stable identifier.');
  if (callouts.some(({ id }) => id === input.id))
    return blocked(
      'duplicate-callout-id',
      `Callout id ${input.id} already exists in this session.`,
    );
  const text = normalizedText(input.text);
  if (!text)
    return blocked('invalid-callout-text', 'Callout text must contain 1–500 printable characters.');
  if (!resolvePatternImportDxfPhaseEVertexV1(projection, input.anchor))
    return blocked(
      'anchor-not-found',
      'The requested callout anchor is not present in the exact Phase-D projection.',
    );
  const callout = freezeCallout(input.id, input.anchor, text);
  return success([...callouts, callout], callout);
}

export function updatePatternImportDxfPhaseECalloutTextV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  callouts: readonly PatternImportDxfPhaseECalloutV1[],
  id: string,
  value: string,
): PatternImportDxfPhaseECalloutSessionResultV1 {
  const invalidSession = validExistingSession(projection, callouts);
  if (invalidSession) return invalidSession;
  const index = callouts.findIndex((callout) => callout.id === id);
  if (index < 0)
    return blocked('callout-not-found', `Callout ${id} is not in the current session.`);
  const text = normalizedText(value);
  if (!text)
    return blocked('invalid-callout-text', 'Callout text must contain 1–500 printable characters.');
  const current = callouts[index];
  const callout = freezeCallout(current.id, current.anchor, text);
  const next = callouts.map((candidate, candidateIndex) =>
    candidateIndex === index ? callout : candidate,
  );
  return success(next, callout);
}

export function reanchorPatternImportDxfPhaseECalloutV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  callouts: readonly PatternImportDxfPhaseECalloutV1[],
  id: string,
  anchor: PatternImportDxfPhaseEVertexAnchorV1,
): PatternImportDxfPhaseECalloutSessionResultV1 {
  const invalidSession = validExistingSession(projection, callouts);
  if (invalidSession) return invalidSession;
  const current = callouts.find((callout) => callout.id === id);
  if (!current) return blocked('callout-not-found', `Callout ${id} is not in the current session.`);
  if (!resolvePatternImportDxfPhaseEVertexV1(projection, anchor))
    return blocked(
      'anchor-not-found',
      'The replacement callout anchor is absent from the exact projection.',
    );
  const moved = freezeCallout(id, anchor, current.text);
  return success(
    callouts.map((callout) => (callout.id === id ? moved : callout)),
    moved,
  );
}

export function deletePatternImportDxfPhaseECalloutV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  callouts: readonly PatternImportDxfPhaseECalloutV1[],
  id: string,
): PatternImportDxfPhaseECalloutSessionResultV1 {
  const invalidSession = validExistingSession(projection, callouts);
  if (invalidSession) return invalidSession;
  if (!callouts.some((callout) => callout.id === id))
    return blocked('callout-not-found', `Callout ${id} is not in the current session.`);
  return success(
    callouts.filter((callout) => callout.id !== id),
    null,
  );
}
