import type { ClothMeshIR } from '../mesh/cloth-mesh-ir';

export const SUPPORT_ATTACHMENT_POLICY_V1_VERSION = 'support-attachment-policy/v1' as const;

export type SupportAttachmentProvenanceV1 = {
  /** Stable, human-auditable identifier for the policy source or fixture. */
  readonly sourceId: string;
  readonly intendedUse: 'production' | 'debug' | 'test';
};

export type SupportAttachmentPolicyV1 =
  | {
      readonly version: typeof SUPPORT_ATTACHMENT_POLICY_V1_VERSION;
      readonly mode: 'none';
      readonly provenance: SupportAttachmentProvenanceV1;
    }
  | {
      readonly version: typeof SUPPORT_ATTACHMENT_POLICY_V1_VERSION;
      readonly mode: 'explicit-fixed-particles';
      readonly provenance: SupportAttachmentProvenanceV1;
      readonly attachments: readonly {
        readonly attachmentId: string;
        readonly particleIndex: number;
      }[];
    }
  | {
      readonly version: typeof SUPPORT_ATTACHMENT_POLICY_V1_VERSION;
      /** Compatibility-only recreation of the former implicit compiler pins. */
      readonly mode: 'legacy-piece-top-corners';
      readonly provenance: SupportAttachmentProvenanceV1 & {
        readonly intendedUse: 'debug' | 'test';
      };
    };

export type CompiledSupportAttachmentsV1 = {
  readonly version: typeof SUPPORT_ATTACHMENT_POLICY_V1_VERSION;
  readonly mode: SupportAttachmentPolicyV1['mode'];
  readonly provenance: SupportAttachmentProvenanceV1;
  /** Stable IDs in the same deterministic order as particleIndices. */
  readonly attachmentIds: readonly string[];
  readonly particleIndices: Uint32Array;
};

export const DEFAULT_UNATTACHED_SUPPORT_POLICY_V1: SupportAttachmentPolicyV1 = {
  version: SUPPORT_ATTACHMENT_POLICY_V1_VERSION,
  mode: 'none',
  provenance: {
    sourceId: 'compiler-default:preassembled-garment-on-body',
    intendedUse: 'production',
  },
};

function requireStableId(value: string, label: string): void {
  if (value.length === 0 || value.trim() !== value || /\s/.test(value)) {
    throw new Error(label + ' must be a non-empty stable ID without whitespace.');
  }
}

function legacyTopCornerAttachments(
  mesh: ClothMeshIR,
): readonly { readonly attachmentId: string; readonly particleIndex: number }[] {
  const attachments: { attachmentId: string; particleIndex: number }[] = [];
  for (const piece of mesh.pieceRanges) {
    let topY = Number.NEGATIVE_INFINITY;
    for (let local = 0; local < piece.vertexCount; local += 1) {
      const index = piece.vertexOffset + local;
      topY = Math.max(topY, mesh.restPositions2Mm[index * 2 + 1]);
    }

    let leftIndex = -1;
    let rightIndex = -1;
    let leftX = Number.POSITIVE_INFINITY;
    let rightX = Number.NEGATIVE_INFINITY;
    for (let local = 0; local < piece.vertexCount; local += 1) {
      const index = piece.vertexOffset + local;
      const x = mesh.restPositions2Mm[index * 2];
      const y = mesh.restPositions2Mm[index * 2 + 1];
      if (Math.abs(y - topY) > 1e-5) continue;
      if (x < leftX) {
        leftX = x;
        leftIndex = index;
      }
      if (x > rightX) {
        rightX = x;
        rightIndex = index;
      }
    }
    if (leftIndex < 0 || rightIndex < 0) {
      throw new Error(piece.pieceId + ' has no resolvable top corners.');
    }
    attachments.push({
      attachmentId: 'legacy-top-corner:' + piece.pieceId + ':left',
      particleIndex: leftIndex,
    });
    if (rightIndex !== leftIndex) {
      attachments.push({
        attachmentId: 'legacy-top-corner:' + piece.pieceId + ':right',
        particleIndex: rightIndex,
      });
    }
  }
  return attachments;
}

export function compileSupportAttachmentsV1(
  mesh: ClothMeshIR,
  policy: SupportAttachmentPolicyV1,
): CompiledSupportAttachmentsV1 {
  if (policy.version !== SUPPORT_ATTACHMENT_POLICY_V1_VERSION) {
    throw new Error('Unsupported support attachment policy version.');
  }
  requireStableId(policy.provenance.sourceId, 'Support attachment provenance sourceId');
  if (!['production', 'debug', 'test'].includes(String(policy.provenance.intendedUse))) {
    throw new Error('Support attachment provenance intendedUse is unsupported.');
  }
  if (
    policy.mode === 'legacy-piece-top-corners' &&
    String(policy.provenance.intendedUse) === 'production'
  ) {
    throw new Error('Legacy top-corner support is restricted to debug or test use.');
  }

  const particleCount = mesh.restPositions2Mm.length / 2;
  const source =
    policy.mode === 'none'
      ? []
      : policy.mode === 'legacy-piece-top-corners'
        ? legacyTopCornerAttachments(mesh)
        : policy.attachments;
  const seenIds = new Set<string>();
  const seenParticles = new Set<number>();
  const ordered = source
    .map((attachment) => {
      requireStableId(attachment.attachmentId, 'attachmentId');
      if (seenIds.has(attachment.attachmentId)) {
        throw new Error('Duplicate attachmentId: ' + attachment.attachmentId + '.');
      }
      if (
        !Number.isSafeInteger(attachment.particleIndex) ||
        attachment.particleIndex < 0 ||
        attachment.particleIndex >= particleCount
      ) {
        throw new RangeError(
          'Attachment ' + attachment.attachmentId + ' references a particle outside the mesh.',
        );
      }
      if (seenParticles.has(attachment.particleIndex)) {
        throw new Error(
          'Multiple attachments reference particle ' + String(attachment.particleIndex) + '.',
        );
      }
      seenIds.add(attachment.attachmentId);
      seenParticles.add(attachment.particleIndex);
      return attachment;
    })
    .sort(
      (left, right) =>
        left.particleIndex - right.particleIndex ||
        left.attachmentId.localeCompare(right.attachmentId),
    );

  return {
    version: SUPPORT_ATTACHMENT_POLICY_V1_VERSION,
    mode: policy.mode,
    provenance: { ...policy.provenance },
    attachmentIds: ordered.map((attachment) => attachment.attachmentId),
    particleIndices: Uint32Array.from(ordered, (attachment) => attachment.particleIndex),
  };
}
