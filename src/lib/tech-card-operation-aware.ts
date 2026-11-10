import type { common_TechCardInsert } from 'api/proto-http/admin';

// Operations are written by full replace, so the server gates each field of TechCardOperation behind
// an «aware» flag: a write that carries the field, or that would replace a card whose steps hold it,
// is refused as an outdated client unless the flag is declared. Every write path that sends the
// card's operations — the tech card form and the fusing DXF rebuild, which echoes the stored card —
// spreads this one object, so a new operation field is declared everywhere at once.
//
// 01dcd7131 added topstitch_lines and its flag to the form only; the rebuild's own copy of the list
// did not get it, and re-uploading patterns on a card with measured topstitch lines raised «outdated
// admin client».
export const OPERATION_FIELDS_AWARE = {
  machineFieldsAware: true,
  assemblyAware: true,
  mediaAware: true,
  operationKindsAware: true,
  operationWorkAware: true,
  operationSeamKindAware: true,
  operationDraftAware: true,
  operationReviewAware: true,
  operationBlockMembershipAware: true,
  operationSeamsAware: true,
  operationFoldsAware: true,
  operationSeamToleranceAware: true,
  operationLayerOrderAware: true,
  topstitchLinesAware: true,
} as const satisfies Partial<common_TechCardInsert>;

// The flags of TechCardInsert that gate something other than operation fields. Each write path
// decides on these itself (the rebuild's echo carries no cut strips, so it never declares them).
export const NON_OPERATION_AWARE = [
  'bomQtyAware',
  'labelsAware',
  'packagingPicksAware',
  'cutStripsAware',
] as const satisfies readonly (keyof common_TechCardInsert)[];

// A new «…Aware» flag in the proto stops the type check until it is placed in one of the two lists.
type AwareKey = Extract<keyof common_TechCardInsert, `${string}Aware`>;
type Unplaced = Exclude<
  AwareKey,
  keyof typeof OPERATION_FIELDS_AWARE | (typeof NON_OPERATION_AWARE)[number]
>;
export const everyAwareFlagPlaced: [Unplaced] extends [never] ? true : Unplaced = true;
