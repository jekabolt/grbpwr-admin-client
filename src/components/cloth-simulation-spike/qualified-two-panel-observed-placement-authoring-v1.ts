import type {
  PatternImportDxfProductGarmentMeshComposerProjectionV2,
  PatternImportDxfProductGarmentMeshComposerSnapshotV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  validateSavedModelObservedPlacementTargetV1,
  type SavedModelObservedPlacementTargetV1,
} from 'lib/cloth/domain/saved-model-observed-placement-target-codec-v1';
import {
  qualifiedTwoPanelPlacementAuthoringInternalsV1,
  type QualifiedTwoPanelGarmentRoleDraftV1,
  type QualifiedTwoPanelGarmentProfileIntentV1,
} from './qualified-two-panel-placement-authoring-v1';

export type QualifiedTwoPanelObservedPlacementDraftV1 = QualifiedTwoPanelGarmentRoleDraftV1 &
  Readonly<{
    observedTargetSha256: string | null;
    /** Review of the existing FRONT/BACK, 700/900 mm, 0.64 rad annular profile only. */
    annularProfileReviewed: boolean;
    confirmation: Readonly<{
      composerCanonicalSha256: string;
      observedTargetSha256: string;
    }> | null;
  }>;
export type QualifiedTwoPanelObservedPlacementIntentV1 = QualifiedTwoPanelGarmentProfileIntentV1 &
  Readonly<{ confirmedTargetSha256: string }>;
export type QualifiedTwoPanelObservedPlacementAuthoringInputV1 = Readonly<{
  composerSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
  composerProjection: PatternImportDxfProductGarmentMeshComposerProjectionV2;
  draft: QualifiedTwoPanelObservedPlacementDraftV1;
  /** The host obtains this from its genuine current body projector. Pure metadata validation
   * below cannot authenticate the host or replace the consumer/issuer's fresh owner checks. */
  observedTarget: Readonly<{
    target: SavedModelObservedPlacementTargetV1;
    canonicalSha256: string;
  }> | null;
}>;
const SHA = /^[a-f0-9]{64}$/;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const nativeTypedArrayLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')!.get!;
const nativeTypedArrayByteLength = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength',
)!.get!;
const nativeTypedArraySet = Uint8Array.prototype.set;
function digest(value: unknown): value is string {
  return typeof value === 'string' && SHA.test(value);
}

/** Capture every used input before hashing. Accessors and arbitrary prototypes are rejected;
 * mesh arrays are detached exact copies, not reconstructed geometry or topology authority. */
function capture<T>(value: T): T {
  let nodes = 0;
  let bytes = 0;
  const copy = (item: unknown, depth: number): unknown => {
    if (++nodes > 100_000 || depth > 64) throw new TypeError('Authoring data exceeds its bound.');
    if (item === null || item === undefined || typeof item === 'boolean') return item;
    if (typeof item === 'string') {
      bytes += item.length * 2;
      if (bytes > 8 * 1024 * 1024) throw new TypeError('Authoring data exceeds its byte bound.');
      return item;
    }
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object')
      throw new TypeError('Finite authoring data is required.');
    if (ArrayBuffer.isView(item)) {
      const length = Reflect.apply(nativeTypedArrayLength, item, []) as number;
      bytes += Reflect.apply(nativeTypedArrayByteLength, item, []) as number;
      if (bytes > 8 * 1024 * 1024) throw new TypeError('Authoring mesh exceeds its byte bound.');
      // Plain numeric indices are the only own fields a source mesh carrier may retain.
      const fields = Object.getOwnPropertyDescriptors(item);
      if (
        Reflect.ownKeys(fields).some(
          (key) =>
            typeof key !== 'string' ||
            !/^(0|[1-9][0-9]*)$/.test(key) ||
            Number(key) >= length ||
            !fields[key]?.enumerable ||
            !('value' in fields[key]!),
        )
      )
        throw new TypeError('Authoring binary carriers cannot contain accessors or extra fields.');
      if (Object.getPrototypeOf(item) === Float32Array.prototype) {
        const result = new Float32Array(length);
        Reflect.apply(nativeTypedArraySet, result, [item]);
        if (!result.every(Number.isFinite)) throw new TypeError('Nonfinite authoring mesh.');
        return result;
      }
      if (Object.getPrototypeOf(item) === Uint32Array.prototype) {
        const result = new Uint32Array(length);
        Reflect.apply(nativeTypedArraySet, result, [item]);
        return result;
      }
      throw new TypeError('Unexpected authoring binary carrier.');
    }
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (
      prototype !== (array ? Array.prototype : Object.prototype) &&
      !(prototype === null && !array)
    )
      throw new TypeError('Authoring requires plain records.');
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors).filter((key) => !(array && key === 'length'));
    if (
      array &&
      (keys.length !== descriptors.length?.value ||
        keys.some((key, index) => key !== String(index)))
    )
      throw new TypeError('Authoring arrays must be dense.');
    const entries = keys.map((key) => {
      const descriptor = typeof key === 'string' ? descriptors[key] : undefined;
      if (!descriptor?.enumerable || !('value' in descriptor))
        throw new TypeError('Authoring cannot contain accessors, symbols or hidden fields.');
      return [key, copy(descriptor.value, depth + 1)] as const;
    });
    return array ? entries.map(([, child]) => child) : Object.fromEntries(entries);
  };
  return copy(value, 0) as T;
}

export function createQualifiedTwoPanelObservedPlacementDraftV1(
  composerCanonicalSha256: string,
  observedTargetSha256: string | null = null,
): QualifiedTwoPanelObservedPlacementDraftV1 {
  if (
    !digest(composerCanonicalSha256) ||
    (observedTargetSha256 !== null && !digest(observedTargetSha256))
  )
    throw new TypeError('Exact source and observed-target digests are required.');
  return {
    ...qualifiedTwoPanelPlacementAuthoringInternalsV1.createRoleDraft(composerCanonicalSha256),
    observedTargetSha256,
    annularProfileReviewed: false,
    confirmation: null,
  };
}

/** Called only by an explicit confirmation action. This records intent, never body admission. */
export function confirmQualifiedTwoPanelObservedPlacementDraftV1(
  value: QualifiedTwoPanelObservedPlacementDraftV1,
): QualifiedTwoPanelObservedPlacementDraftV1 {
  const draft = capture(value);
  if (
    !digest(draft.composerCanonicalSha256) ||
    !draft.observedTargetSha256 ||
    !digest(draft.observedTargetSha256)
  )
    throw new TypeError('Select an exact current source and observed target before confirmation.');
  return {
    ...draft,
    confirmation: Object.freeze({
      composerCanonicalSha256: draft.composerCanonicalSha256,
      observedTargetSha256: draft.observedTargetSha256,
    }),
  };
}

/** Pure explicit intent only. The genuine consumer/issuer reprojects source and target before
 * saving; this function issues no owner, body qualification, source generation or runtime claim. */
export async function buildQualifiedTwoPanelObservedPlacementIntentV1(
  input: QualifiedTwoPanelObservedPlacementAuthoringInputV1,
): Promise<QualifiedTwoPanelObservedPlacementIntentV1> {
  const {
    composerSnapshot: snapshot,
    composerProjection: projection,
    draft,
    observedTarget,
  } = capture(input);
  const shared = qualifiedTwoPanelPlacementAuthoringInternalsV1;
  shared.requireSource(snapshot, projection);
  if (draft.composerCanonicalSha256 !== snapshot.seal.canonicalSha256)
    throw new TypeError('The saved source changed. Choose its garment roles again.');
  if (
    !observedTarget ||
    !draft.observedTargetSha256 ||
    observedTarget.canonicalSha256 !== draft.observedTargetSha256
  )
    throw new TypeError(
      'The observed target changed. Select and confirm its current identity again.',
    );
  if (
    !draft.confirmation ||
    draft.confirmation.composerCanonicalSha256 !== draft.composerCanonicalSha256 ||
    draft.confirmation.observedTargetSha256 !== draft.observedTargetSha256
  )
    throw new TypeError('Explicitly confirm this exact source and observed target.');
  const profile = shared.buildGarmentProfile(
    snapshot,
    projection,
    draft,
    draft.annularProfileReviewed,
  );
  const target = await validateSavedModelObservedPlacementTargetV1(
    observedTarget.target,
    observedTarget.canonicalSha256,
  );
  if (!target.ok) throw new TypeError(`The observed target metadata is invalid: ${target.detail}`);
  return {
    garment: profile.garment,
    policy: profile.policy,
    annularParameters: profile.annularParameters,
    confirmedTargetSha256: target.canonicalSha256,
  };
}
