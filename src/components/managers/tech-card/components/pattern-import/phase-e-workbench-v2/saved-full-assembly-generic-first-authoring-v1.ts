import {
  DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1,
  DXF_GARMENT_PHYSICAL_INITIALIZATION_V1,
  type DxfGarmentPhysicalInitializationV1,
} from 'lib/cloth/domain/dxf-garment-physical-initialization-v1';
import type { DxfGarmentExplicitPiecePlacementV1 } from 'lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1';
import {
  projectSavedGenericObservedPhysicalHostAuthoringContextV1,
  type SavedGenericObservedPhysicalHostV1,
} from 'components/cloth-simulation-spike/saved-generic-observed-physical-host-v1';

/** Explicit selected pivot plus rigid table transform; no presentation-derived fallback exists. */
export type SavedFullAssemblyTablePiecePlacementV1 = Readonly<{
  pieceId: string;
  pieceLineKey: string;
  pivot: Readonly<{
    contourId: string;
    vertexId: string;
    positionMm: readonly [number, number];
    positionM: readonly [number, number, number];
  }>;
  rotationRowMajor: DxfGarmentExplicitPiecePlacementV1['rotationRowMajor'];
  translationM: DxfGarmentExplicitPiecePlacementV1['translationM'];
}>;

export type BindSavedFullAssemblyGenericFirstAuthoringRequestV1 = Readonly<{
  expectedGeneration: number;
  placements: readonly SavedFullAssemblyTablePiecePlacementV1[];
}>;

export type BindSavedFullAssemblyGenericFirstAuthoringResultV1 =
  | Readonly<{
      ok: true;
      sourceGeneration: number;
      document: DxfGarmentPhysicalInitializationV1;
      initializationSha256: string;
    }>
  | Readonly<{ ok: false; detail: string }>;

const SHA256 = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;

function checkSignal(signal?: AbortSignal): void {
  if (signal !== undefined && aborted.call(signal))
    throw new DOMException('First physical authoring cancelled.', 'AbortError');
}

function exactOwn(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype)
    throw new TypeError(`${name} must be plain own data.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    keys.some((key) => !descriptors[key]?.enumerable || !('value' in descriptors[key]))
  )
    throw new TypeError(`${name} has missing, accessor or additional fields.`);
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function denseArray(value: unknown, name: string, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > max)
    throw new TypeError(`${name} must be a non-empty bounded array.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== value.length + 1 ||
    Reflect.ownKeys(descriptors).some(
      (key) => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key)),
    )
  )
    throw new TypeError(`${name} must be dense own data.`);
  return value;
}

function vector(value: unknown, length: number, bound: number, name: string): readonly number[] {
  const source = denseArray(value, name, length);
  if (
    source.length !== length ||
    source.some(
      (entry) =>
        typeof entry !== 'number' ||
        !Number.isFinite(entry) ||
        Object.is(entry, -0) ||
        Math.abs(entry) > bound,
    )
  )
    throw new TypeError(`${name} must contain finite bounded values.`);
  return Array.from(source) as number[];
}

function stableId(value: unknown, name: string): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`${name} is invalid.`);
  return value;
}

function rotation(value: unknown): DxfGarmentExplicitPiecePlacementV1['rotationRowMajor'] {
  const result = vector(value, 9, 1 + 1e-12, 'rotationRowMajor');
  for (let row = 0; row < 3; row++)
    for (let other = 0; other < 3; other++) {
      let dot = 0;
      for (let column = 0; column < 3; column++)
        dot += result[row * 3 + column]! * result[other * 3 + column]!;
      if (Math.abs(dot - (row === other ? 1 : 0)) > 1e-12)
        throw new TypeError('rotationRowMajor must be a proper orthonormal rotation.');
    }
  const determinant =
    result[0]! * (result[4]! * result[8]! - result[5]! * result[7]!) -
    result[1]! * (result[3]! * result[8]! - result[5]! * result[6]!) +
    result[2]! * (result[3]! * result[7]! - result[4]! * result[6]!);
  if (Math.abs(determinant - 1) > 1e-12)
    throw new TypeError('rotationRowMajor must have determinant +1.');
  return result as DxfGarmentExplicitPiecePlacementV1['rotationRowMajor'];
}

function tuple2Mm(value: unknown, name: string): readonly [number, number] {
  return vector(value, 2, 10_000_000, name) as readonly [number, number];
}

function tuple3M(value: unknown, name: string): readonly [number, number, number] {
  return vector(value, 3, 10_000, name) as readonly [number, number, number];
}

function failed(error: unknown): BindSavedFullAssemblyGenericFirstAuthoringResultV1 {
  return Object.freeze({
    ok: false as const,
    detail: error instanceof Error ? error.message.slice(0, 2048) : 'First authoring failed.',
  });
}

function capturePlacements(value: unknown): readonly SavedFullAssemblyTablePiecePlacementV1[] {
  return Object.freeze(
    denseArray(value, 'table placements', 256).map((entry, index) => {
      const placement = exactOwn(
        entry,
        ['pieceId', 'pieceLineKey', 'pivot', 'rotationRowMajor', 'translationM'],
        `table placement ${index}`,
      );
      const pivot = exactOwn(
        placement.pivot,
        ['contourId', 'vertexId', 'positionMm', 'positionM'],
        `table placement ${index}.pivot`,
      );
      return Object.freeze({
        pieceId: stableId(placement.pieceId, `table placement ${index}.pieceId`),
        pieceLineKey: stableId(placement.pieceLineKey, `table placement ${index}.pieceLineKey`),
        pivot: Object.freeze({
          contourId: stableId(pivot.contourId, `table placement ${index}.pivot.contourId`),
          vertexId: stableId(pivot.vertexId, `table placement ${index}.pivot.vertexId`),
          positionMm: tuple2Mm(pivot.positionMm, `table placement ${index}.pivot.positionMm`),
          positionM: tuple3M(pivot.positionM, `table placement ${index}.pivot.positionM`),
        }),
        rotationRowMajor: rotation(placement.rotationRowMajor),
        translationM: tuple3M(placement.translationM, `table placement ${index}.translationM`),
      });
    }),
  );
}

function sameTuple(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  );
}

/**
 * First-V7 boundary. Only the registry-backed genuine host projector supplies pivot evidence; this
 * adapter never obtains pivots from mannequin overlays, bbox centers, automatic lanes or
 * caller-invented origins.
 */
export async function bindSavedFullAssemblyGenericFirstAuthoringV1(
  host: Pick<SavedGenericObservedPhysicalHostV1, 'bindInitialization'>,
  request: BindSavedFullAssemblyGenericFirstAuthoringRequestV1,
  signal?: AbortSignal,
): Promise<BindSavedFullAssemblyGenericFirstAuthoringResultV1> {
  try {
    checkSignal(signal);
    const captured = exactOwn(request, ['expectedGeneration', 'placements'], 'authoring request');
    const expectedGeneration = captured.expectedGeneration;
    if (
      typeof expectedGeneration !== 'number' ||
      !Number.isSafeInteger(expectedGeneration) ||
      expectedGeneration < 1
    )
      throw new TypeError('expectedGeneration must be a positive safe integer.');
    const authoredPlacements = capturePlacements(captured.placements);
    checkSignal(signal);

    const context = await projectSavedGenericObservedPhysicalHostAuthoringContextV1(
      host,
      expectedGeneration,
      signal,
    );
    checkSignal(signal);
    if (!context.ok) throw new Error(context.detail);
    if (
      context.sourceGeneration !== expectedGeneration ||
      !SHA256.test(context.graphCanonicalSha256) ||
      !SHA256.test(context.compileInputSha256)
    )
      throw new Error('Fresh authoring context is stale or invalid.');

    const graphPieces = context.graph.pieces;
    if (graphPieces.length !== authoredPlacements.length)
      throw new Error('Every current graph piece must have exactly one pivot and placement.');
    const authoredById = new Map(
      authoredPlacements.map((entry) => [entry.pieceId, entry] as const),
    );
    if (authoredById.size !== authoredPlacements.length)
      throw new Error('Duplicate piece identities are unsupported.');

    const placements = graphPieces.map((piece) => {
      const authored = authoredById.get(piece.pieceId);
      if (!authored || authored.pieceLineKey !== piece.pieceLineKey)
        throw new Error(`${piece.pieceId} pivot is not bound to the current piece line.`);
      const sourcePieces = context.sourceGeometry.pieces.filter(
        (source) =>
          source.pieceId === authored.pieceId && source.pieceLineKey === authored.pieceLineKey,
      );
      const sourceContours = sourcePieces.flatMap(({ contours }) =>
        contours.filter(({ contourId }) => contourId === authored.pivot.contourId),
      );
      const matches = sourceContours.flatMap(({ vertices }) =>
        vertices.filter(({ vertexId }) => vertexId === authored.pivot.vertexId),
      );
      if (
        matches.length !== 1 ||
        !sameTuple(matches[0]!.positionMm, authored.pivot.positionMm) ||
        !sameTuple(matches[0]!.positionM, authored.pivot.positionM)
      )
        throw new Error(`${piece.pieceId} pivot identity or exact source position changed.`);
      return Object.freeze({
        pieceId: piece.pieceId,
        sourceOriginM: tuple3M(matches[0]!.positionM, `${piece.pieceId}.sourceOriginM`),
        rotationRowMajor: authored.rotationRowMajor,
        translationM: authored.translationM,
      });
    });

    const document: DxfGarmentPhysicalInitializationV1 = Object.freeze({
      schemaVersion: DXF_GARMENT_PHYSICAL_INITIALIZATION_V1,
      graphCanonicalSha256: context.graphCanonicalSha256,
      compileInputSha256: context.compileInputSha256,
      convention: DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1,
      placements: Object.freeze(placements),
      observedTarget: context.observedTarget,
      support: 'none',
      replayProfile: 'garment-material-contact-replay/1',
    });
    const bound = await host.bindInitialization(document, expectedGeneration, signal);
    checkSignal(signal);
    if (!bound.ok) throw new Error(bound.detail);
    if (bound.sourceGeneration !== expectedGeneration)
      throw new Error('Initialization bound another source generation.');
    return Object.freeze({
      ok: true as const,
      sourceGeneration: bound.sourceGeneration,
      document,
      initializationSha256: bound.initializationSha256,
    });
  } catch (error) {
    return failed(error);
  }
}
