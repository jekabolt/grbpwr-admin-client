import type { TechCardSeam, TechCardSeamAnchor } from 'api/proto-http/common';
import type { SavedAssemblyNativeSewingPathV1 } from './saved-full-assembly-native-boundaries-v1';
import {
  completeSavedAssemblyRowIdentityV1,
  isVerifiedCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
  type SavedAssemblyCutStripSourceV1,
} from './saved-assembly-complete-source-rpc-v1';

type ScopedAlias = NonNullable<CompleteSavedAssemblySourceV1['aliases'][number]>;
type Label = CompleteSavedAssemblySourceV1['garmentLabels'][number];

export type SavedAssemblyPhysicalAnchorV1 = Readonly<{
  operationNumber: number;
  seamKey: string;
  sideIndex: 0 | 1;
  partOrdinal: number;
  pieceLineKey: string;
  anchor: TechCardSeamAnchor;
  source:
    | Readonly<{
        kind: 'dxf';
        aliases: readonly ScopedAlias[];
        /** The piece's native L14 boundary. An interior attachment has its own explicit path. */
        nativeSewingPath?: SavedAssemblyNativeSewingPathV1 | null;
      }>
    | Readonly<{ kind: 'garment-label'; label: Label }>
    | Readonly<{ kind: 'cut-strip'; binding: SavedAssemblyCutStripSourceV1 }>;
}>;

type PhysicalSeam = Readonly<{
  operationNumber: number;
  seamKey: string;
  seam: TechCardSeam;
  anchors: readonly SavedAssemblyPhysicalAnchorV1[];
}>;

type Pose = Readonly<{
  operationNumber: number;
  seamKey: string;
  seam: TechCardSeam;
}>;

const physicalKinds = new Set([
  'TECH_CARD_SEAM_KIND_EDGE',
  'TECH_CARD_SEAM_KIND_PARTIAL',
  'TECH_CARD_SEAM_KIND_COMPOSITE',
  'TECH_CARD_SEAM_KIND_SURFACE',
  'TECH_CARD_SEAM_KIND_CLOSURE',
]);

export function bindSavedAssemblyOperationAnchorsV1(
  source: CompleteSavedAssemblySourceV1,
  generatedCutScopes: ReadonlySet<string> = new Set(),
  nativeSewingPaths: readonly SavedAssemblyNativeSewingPathV1[] = [],
) {
  if (!isVerifiedCompleteSavedAssemblySourceV1(source))
    throw new TypeError('Operation anchors require a verified complete saved Assembly source.');
  const physical: PhysicalSeam[] = [];
  const poses: Pose[] = [];
  const unavailable: Array<
    Readonly<{ operationNumber: number; seamKey: string; seam: TechCardSeam }>
  > = [];
  const rowScopes = new Set(source.rows.map(({ scopeKey }) => scopeKey));
  if (rowScopes.size !== source.rows.length)
    throw new TypeError('A saved Assembly scope must identify one exact pattern row.');
  const labels = new Map(source.garmentLabels.map((label) => [label.lineKey, label]));
  if (labels.has(undefined) || labels.has('') || labels.size !== source.garmentLabels.length)
    throw new TypeError('Saved Assembly garment label identities must be present and unique.');
  const strips = new Map(source.cutStrips?.map((binding) => [binding.strip?.lineKey, binding]));
  const aliases = new Map<string, ScopedAlias[]>();
  for (const alias of source.aliases) {
    if (!alias.pieceLineKey || !alias.scopeKey || !rowScopes.has(alias.scopeKey))
      throw new TypeError('Saved Assembly alias has no current pattern row.');
    // The generated sheet covers the already bound host detail. Its cut-only paths are not
    // alternative authorities for the original garment stitch.
    if (generatedCutScopes.has(alias.scopeKey)) continue;
    const list = aliases.get(alias.pieceLineKey);
    if (list) list.push(alias);
    else aliases.set(alias.pieceLineKey, [alias]);
  }
  const nativeByAlias = new Map<string, SavedAssemblyNativeSewingPathV1[]>();
  const rowByScope = new Map(source.rows.map((row) => [row.scopeKey, row]));
  const aliasKey = (scopeKey: string, pieceLineKey: string, blockName: string) =>
    JSON.stringify([scopeKey, pieceLineKey, blockName]);
  for (const path of nativeSewingPaths) {
    const row = rowByScope.get(path.row.scopeKey);
    if (
      !row ||
      Object.entries(completeSavedAssemblyRowIdentityV1(row)).some(
        ([key, value]) => path.row[key as keyof typeof path.row] !== value,
      )
    )
      throw new TypeError('A native sewing path does not match the sealed Assembly row.');
    const key = aliasKey(path.row.scopeKey, path.pieceLineKey, path.blockName);
    const stored = nativeByAlias.get(key);
    if (stored) stored.push(path);
    else nativeByAlias.set(key, [path]);
  }
  const owned = new Set<string>();
  const operationNumbers = new Set<number>();
  let nextSeamIndex = 0;
  for (const operation of source.operations) {
    const operationNumber = operation.operationNumber;
    if (
      !operationNumber ||
      !Number.isSafeInteger(operationNumber) ||
      operationNumber < 1 ||
      operationNumbers.has(operationNumber)
    )
      throw new TypeError('Saved Assembly operation has no unique persisted number.');
    operationNumbers.add(operationNumber);
    for (const seamKey of operation.seamKeys ?? []) {
      const seam = source.ownedSeams[nextSeamIndex++];
      if (!seamKey || owned.has(seamKey) || !seam || seam.seamKey !== seamKey)
        throw new TypeError(
          'Saved Assembly seam ownership differs from the persisted operation order.',
        );
      owned.add(seamKey);
      if (seam.stale || seam.status !== 'TECH_CARD_SEAM_STATUS_CONFIRMED') {
        unavailable.push({ operationNumber, seamKey, seam });
        continue;
      }
      if (seam.kind === 'TECH_CARD_SEAM_KIND_POSE') {
        poses.push({ operationNumber, seamKey, seam });
        continue;
      }
      if (
        !seam.kind ||
        !physicalKinds.has(seam.kind) ||
        !seam.sideA?.parts?.length ||
        !seam.sideB?.parts?.length
      ) {
        unavailable.push({ operationNumber, seamKey, seam });
        continue;
      }
      const anchors = ([seam.sideA.parts, seam.sideB.parts] as const).flatMap((parts, sideIndex) =>
        parts.map((anchor, partOrdinal): SavedAssemblyPhysicalAnchorV1 => {
          const pieceLineKey = anchor.pieceLineKey;
          const label = labels.get(pieceLineKey);
          const strip = strips.get(pieceLineKey);
          const pieceAliases = pieceLineKey ? aliases.get(pieceLineKey) : undefined;
          const ownerCount =
            Number(Boolean(label)) + Number(Boolean(strip)) + Number(Boolean(pieceAliases));
          if (!pieceLineKey || ownerCount !== 1)
            throw new TypeError('A physical anchor must have one saved geometry owner.');
          const nativeCandidates = pieceAliases?.flatMap(({ scopeKey, blockName }) =>
            scopeKey && blockName
              ? nativeByAlias.get(aliasKey(scopeKey, pieceLineKey, blockName)) ?? []
              : [],
          );
          return Object.freeze({
            operationNumber,
            seamKey,
            sideIndex: sideIndex as 0 | 1,
            partOrdinal,
            pieceLineKey,
            anchor,
            source: label
              ? Object.freeze({ kind: 'garment-label' as const, label })
              : strip
                ? Object.freeze({ kind: 'cut-strip' as const, binding: strip })
                : Object.freeze({
                    kind: 'dxf' as const,
                    aliases: Object.freeze(pieceAliases!.slice()),
                    ...(nativeSewingPaths.length
                      ? {
                          nativeSewingPath:
                            nativeCandidates?.length === 1 ? nativeCandidates[0]! : null,
                        }
                      : {}),
                  }),
          });
        }),
      );
      physical.push(
        Object.freeze({ operationNumber, seamKey, seam, anchors: Object.freeze(anchors) }),
      );
    }
  }
  if (nextSeamIndex !== source.ownedSeams.length)
    throw new TypeError('Saved Assembly contains seam rows outside their owning operations.');
  return Object.freeze({
    serverAssemblyRevision: source.serverAssemblyRevision,
    sourceSha256: source.sourceSha256,
    physical: Object.freeze(physical),
    poses: Object.freeze(poses),
    unavailable: Object.freeze(unavailable),
  });
}
