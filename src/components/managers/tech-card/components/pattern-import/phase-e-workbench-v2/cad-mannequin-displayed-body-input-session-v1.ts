import {
  buildModelDisplayedTriangleBodyInputV1,
  type ModelDisplayedTriangleBodyIdentityV1,
  type ModelDisplayedTriangleBodyOwnedInputV1,
} from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import type { ModelOpenReferenceDisplayedBodySnapshotV1 } from 'components/managers/model/components/model-open-reference-displayed-body-snapshot-v1';

export type CadMannequinDisplayedBodyInputObserverV1 = (
  /** Borrowed input: the picker owns its lifetime. Check isCurrent before every handoff. */
  input: ModelDisplayedTriangleBodyOwnedInputV1 | null,
) => void;

export type CadMannequinDisplayedBodySourceV1 = Readonly<
  Pick<
    ModelOpenReferenceDisplayedBodySnapshotV1,
    'modelId' | 'modelContentRevision' | 'poseDocumentCanonicalKey'
  >
>;

function matches(
  source: CadMannequinDisplayedBodySourceV1,
  current: CadMannequinDisplayedBodySourceV1 | null,
) {
  return (
    current !== null &&
    current.modelId === source.modelId &&
    current.modelContentRevision === source.modelContentRevision &&
    current.poseDocumentCanonicalKey === source.poseDocumentCanonicalKey
  );
}

function identity(
  snapshot: ModelOpenReferenceDisplayedBodySnapshotV1,
): ModelDisplayedTriangleBodyIdentityV1 {
  const {
    observationId,
    modelId,
    modelContentRevision,
    basisKind,
    inputFingerprint,
    bodyBuildFingerprint,
    runtimeSourceRevision,
    frameRevision,
    poseDocumentCanonicalKey,
    displayPositionSource,
  } = snapshot;
  return {
    observationId,
    modelId,
    modelContentRevision,
    basisKind,
    inputFingerprint,
    bodyBuildFingerprint,
    runtimeSourceRevision,
    frameRevision,
    poseDocumentCanonicalKey,
    displayPositionSource,
  };
}

/** Lifecycle composition of the existing host input. Issues no placement/body/runtime admission. */
export function createCadMannequinDisplayedBodyInputSessionV1(
  options: Readonly<{
    source: CadMannequinDisplayedBodySourceV1;
    readCurrentSource: () => CadMannequinDisplayedBodySourceV1 | null;
    onInput: CadMannequinDisplayedBodyInputObserverV1;
  }>,
  dependencies: Readonly<{
    buildInput?: typeof buildModelDisplayedTriangleBodyInputV1;
  }> = {},
) {
  const source = { ...options.source };
  const build = dependencies.buildInput ?? buildModelDisplayedTriangleBodyInputV1;
  let disposed = false;
  let epoch = 0;
  let controller: AbortController | null = null;
  let snapshot: ModelOpenReferenceDisplayedBodySnapshotV1 | null = null;
  let previousObservation: ModelOpenReferenceDisplayedBodySnapshotV1 | null = null;
  let owned: ModelDisplayedTriangleBodyOwnedInputV1 | null = null;
  let published: ModelDisplayedTriangleBodyOwnedInputV1 | null | undefined;

  const currentSource = () => {
    try {
      if (disposed) return false;
      const current = options.readCurrentSource();
      return !disposed && matches(source, current);
    } catch {
      return false;
    }
  };
  const release = () => {
    epoch += 1;
    controller?.abort();
    controller = null;
    snapshot = null;
    owned?.dispose();
    owned = null;
  };
  const publish = (input: ModelDisplayedTriangleBodyOwnedInputV1 | null) => {
    if (published === input) return;
    published = input;
    try {
      options.onInput(input);
    } catch {
      // A consumer exception must not leave a live capability or an unhandled async capture.
      release();
      published = null;
    }
  };

  return Object.freeze({
    async observe(next: ModelOpenReferenceDisplayedBodySnapshotV1 | null): Promise<void> {
      if (disposed) return;
      if (!next || !matches(source, next) || !currentSource()) {
        previousObservation = null;
        release();
        publish(null);
        return;
      }
      if (next === previousObservation) {
        if (owned && !owned.isCurrent()) {
          release();
          publish(null);
        }
        return;
      }
      previousObservation = next;
      release();
      const turn = epoch;
      const capture = new AbortController();
      controller = capture;
      snapshot = next;
      publish(null);
      // Consumer callbacks can synchronously replace or dispose this session.
      if (disposed || epoch !== turn || capture.signal.aborted) return;
      try {
        const result = await build(
          {
            expected: identity(next),
            readCurrentSnapshot: () =>
              epoch === turn && !capture.signal.aborted && currentSource() ? snapshot : null,
          },
          capture.signal,
        );
        if (disposed || epoch !== turn || capture.signal.aborted || !currentSource()) {
          if (result.ok) result.input.dispose();
          if (!disposed && epoch === turn) {
            release();
            publish(null);
          }
          return;
        }
        if (!result.ok || !result.input.isCurrent()) {
          if (result.ok) result.input.dispose();
          release();
          publish(null);
          return;
        }
        if (disposed || epoch !== turn || capture.signal.aborted) {
          result.input.dispose();
          return;
        }
        owned = result.input;
        publish(owned);
      } catch {
        if (!disposed && epoch === turn) {
          release();
          publish(null);
        }
      }
    },
    dispose(): boolean {
      if (disposed) return false;
      disposed = true;
      previousObservation = null;
      release();
      publish(null);
      return true;
    },
  });
}
