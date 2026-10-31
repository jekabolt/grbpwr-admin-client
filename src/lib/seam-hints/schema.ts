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
export const seamHintHandSchema = z.enum(['L', 'R']).nullable();

export const seamRoleHintSchema = z
  .object({
    piece: z.string().trim().min(1),
    role: seamRoleSchema,
    hand: seamHintHandSchema,
    conf: seamHintConfidenceSchema,
    why: z.string(),
  })
  .strict();

export const seamJoinSideSchema = z
  .object({
    pieces: z.array(z.string().trim().min(1)).min(1),
    edge: seamEdgeWordSchema,
  })
  .strict();

export const seamJoinHintSchema = z
  .object({
    op: z.number().int().nonnegative(),
    a: seamJoinSideSchema,
    b: seamJoinSideSchema,
    relation: seamRelationSchema,
    conf: seamHintConfidenceSchema,
  })
  .strict();

/** Schema-version 1 JSON returned by the seam-hints RPC. */
export const seamHintsSchema = z
  .object({
    schema_version: z.literal(1),
    roles: z.array(seamRoleHintSchema),
    joins: z.array(seamJoinHintSchema),
    not_inferred: z.array(z.string()),
  })
  .strict();

const overrideStateSchema = z.enum(['ok', 'fixed', 'off']);
const roleOverrideValueSchema = seamRoleHintSchema.omit({ piece: true });
const joinOverrideValueSchema = seamJoinHintSchema.omit({ op: true });

const roleOverrideSchema = z
  .object({
    kind: z.literal('role'),
    hint_key: z.string().trim().min(1),
    value_json: roleOverrideValueSchema,
    state: overrideStateSchema,
  })
  .strict();

const joinOverrideSchema = z
  .object({
    kind: z.literal('join'),
    hint_key: z.string().regex(/^(0|[1-9]\d*)$/),
    value_json: joinOverrideValueSchema,
    state: overrideStateSchema,
  })
  .strict();

/** Owner row returned beside the AI JSON; `hint_key` supplies piece or operation number. */
export const seamHintOverrideSchema = z.discriminatedUnion('kind', [
  roleOverrideSchema,
  joinOverrideSchema,
]);
export const seamHintOverridesSchema = z.array(seamHintOverrideSchema);

export type SeamRole = z.infer<typeof seamRoleSchema>;
export type SeamEdgeWord = z.infer<typeof seamEdgeWordSchema>;
export type SeamRelation = z.infer<typeof seamRelationSchema>;
export type SeamRoleHint = z.infer<typeof seamRoleHintSchema>;
export type SeamJoinHint = z.infer<typeof seamJoinHintSchema>;
export type SeamHintsJson = z.infer<typeof seamHintsSchema>;
export type SeamHintOverride = z.infer<typeof seamHintOverrideSchema>;
export type SeamHintOverrideState = z.infer<typeof overrideStateSchema>;
