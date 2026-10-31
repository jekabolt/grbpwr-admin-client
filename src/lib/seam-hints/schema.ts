import { z } from 'zod';

export const seamRoleSchema = z.enum([
  'front',
  'back',
  'yoke',
  'sleeve',
  'cuff',
  'placket',
  'collar',
  'stand',
  'neck_facing',
  'facing',
  'pocket_bag',
  'pocket',
  'flap',
  'waistband',
  'lining',
  'interlining',
  'other',
]);

export const seamEdgeWordSchema = z.enum([
  'front_edge',
  'hem',
  'neckline',
  'shoulder',
  'armhole',
  'side',
  'slit',
  'top',
  'bottom',
  'long',
  'short',
  'curved',
  'inner_line',
]);

export const seamRelationSchema = z.enum(['boundary', 'surface', 'layer']);
export const seamHintConfidenceSchema = z.enum(['high', 'medium', 'low']);
/** The server writes `""` for «no hand»; older fixtures wrote null. Both read as null. */
export const seamHintHandSchema = z
  .union([z.enum(['L', 'R']), z.literal(''), z.null()])
  .optional()
  .transform((hand): 'L' | 'R' | null => (hand === 'L' || hand === 'R' ? hand : null));

export const seamRoleHintSchema = z.object({
  piece: z.string().trim().min(1),
  role: seamRoleSchema,
  hand: seamHintHandSchema,
  conf: seamHintConfidenceSchema,
  why: z.string().optional(),
});

export const seamJoinSideSchema = z.object({
  pieces: z.array(z.string().trim().min(1)).min(1),
  edge: seamEdgeWordSchema,
});

export const seamJoinHintSchema = z.object({
  op: z.number().int().nonnegative(),
  a: seamJoinSideSchema,
  b: seamJoinSideSchema,
  relation: seamRelationSchema,
  conf: seamHintConfidenceSchema,
  why: z.string().optional(),
});

/** Schema-version 1 JSON returned by the seam-hints RPC. Unknown fields are dropped. */
export const seamHintsSchema = z.object({
  schema_version: z.literal(1),
  roles: z.array(seamRoleHintSchema),
  joins: z.array(seamJoinHintSchema),
  not_inferred: z.array(z.string()),
});

/**
 * The stored run as the server serves it (`hints_json`), read row by row: a row outside today's
 * vocabulary is dropped instead of losing the whole run. Null = no run, or not schema version 1.
 */
export function parseSeamHintsJson(raw: string | null | undefined): SeamHintsJson | null {
  if (!raw || !raw.trim()) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (obj.schema_version !== 1) return null;
  const rows = <T>(list: unknown, schema: z.ZodType<T>): T[] =>
    (Array.isArray(list) ? list : []).flatMap((row) => {
      const parsed = schema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  return {
    schema_version: 1,
    roles: rows(obj.roles, seamRoleHintSchema),
    joins: rows(obj.joins, seamJoinHintSchema),
    not_inferred: (Array.isArray(obj.not_inferred) ? obj.not_inferred : []).filter(
      (item): item is string => typeof item === 'string',
    ),
  };
}

export const seamHintOverrideStateSchema = z.enum(['ok', 'fixed', 'off']);
export const seamRoleOverrideValueSchema = z.object({
  role: seamRoleSchema,
  hand: seamHintHandSchema,
});
export const seamJoinOverrideValueSchema = z.object({
  a: seamJoinSideSchema,
  b: seamJoinSideSchema,
  relation: seamRelationSchema,
});

const roleOverrideSchema = z.object({
  kind: z.literal('role'),
  hint_key: z.string().trim().min(1),
  /** Null only with state off (the server stores `""`). */
  value: seamRoleOverrideValueSchema.nullable(),
  state: seamHintOverrideStateSchema,
});

const joinOverrideSchema = z.object({
  kind: z.literal('join'),
  hint_key: z.string().regex(/^[1-9]\d*$/),
  value: seamJoinOverrideValueSchema.nullable(),
  state: seamHintOverrideStateSchema,
});

/** The owner's word on one hint; `hint_key` is the piece name (role) or the step number (join). */
export const seamHintOverrideSchema = z.discriminatedUnion('kind', [
  roleOverrideSchema,
  joinOverrideSchema,
]);

/** The wire row (`TechCardSeamHintOverride`, value as a JSON string) → the owner's row, or null. */
export function overrideFromWire(wire: {
  kind?: string;
  hintKey?: string;
  valueJson?: string;
  state?: string;
}): SeamHintOverride | null {
  let value: unknown = null;
  const raw = (wire.valueJson ?? '').trim();
  if (raw) {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const parsed = seamHintOverrideSchema.safeParse({
    kind: wire.kind,
    hint_key: wire.hintKey,
    value,
    state: wire.state,
  });
  if (!parsed.success) return null;
  if (parsed.data.value === null && parsed.data.state !== 'off') return null;
  return parsed.data;
}

/** The owner's row → the `value_json` the server takes (`""` for an off row without a value). */
export function overrideValueJson(row: SeamHintOverride): string {
  if (!row.value) return '';
  if (row.kind === 'role')
    return JSON.stringify({ role: row.value.role, hand: row.value.hand ?? '' });
  return JSON.stringify({ a: row.value.a, b: row.value.b, relation: row.value.relation });
}

export type SeamRole = z.infer<typeof seamRoleSchema>;
export type SeamEdgeWord = z.infer<typeof seamEdgeWordSchema>;
export type SeamRelation = z.infer<typeof seamRelationSchema>;
export type SeamRoleHint = z.infer<typeof seamRoleHintSchema>;
export type SeamJoinHint = z.infer<typeof seamJoinHintSchema>;
export type SeamJoinSide = z.infer<typeof seamJoinSideSchema>;
export type SeamHintsJson = z.infer<typeof seamHintsSchema>;
export type SeamHintOverride = z.infer<typeof seamHintOverrideSchema>;
export type SeamHintOverrideState = z.infer<typeof seamHintOverrideStateSchema>;
export type SeamRoleOverrideValue = z.infer<typeof seamRoleOverrideValueSchema>;
export type SeamJoinOverrideValue = z.infer<typeof seamJoinOverrideValueSchema>;
