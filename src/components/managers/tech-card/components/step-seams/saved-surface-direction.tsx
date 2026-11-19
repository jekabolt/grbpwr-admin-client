import { abortableAdminService } from 'api/api';
import type { common_TechCard } from 'api/proto-http/admin';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { fromWire, toWire, type StoredSeam } from 'lib/seams';
import type { TechCardSeamAnchorWire, TechCardSeamWire } from 'lib/seams/types';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Chip, ChipRow, Text } from 'ui';
import { isDxfUrl } from 'utils/pattern';
import { capturedSeamWriteOptions } from '../assembly-seams/seam-change';
import type { SeamWrites } from '../assembly-seams/use-seam-decisions';
import { bindingScopes } from '../bom-purpose';
import { rollGoodsScopes } from '../piece-block-refs';
import { readCompleteSavedAssemblySourceV1 } from '../pattern-import/phase-e-workbench-v2/saved-assembly-complete-source-rpc-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from '../pattern-import/phase-e-workbench-v2/saved-assembly-topology-hash-v1';
import { savedWorkbenchBindingScopeKeyV1 } from '../pattern-import/phase-e-workbench-v2/saved-workbench-scope-v1';
import { assertExactZeroOperationSavedPatternRowV1 } from '../pattern-import/phase-e-workbench-v2/zero-operation-saved-card-authority-v1';

const directions = [
  { value: 'same', label: 'Same' },
  { value: 'reversed', label: 'Reversed' },
] as const;

type Direction = (typeof directions)[number]['value'];
type Capture = Readonly<{
  operationNumber: number;
  seam: StoredSeam;
  rows: readonly [DxfProductSavedRowIdentityV1, DxfProductSavedRowIdentityV1];
  aliases: readonly { scopeKey: string; blockName: string; pieceLineKey: string }[];
}>;

const changed = 'The saved surface seam changed. Reopen it before editing its direction.';

export function isPlacedSurfaceDirectionSeam(row: StoredSeam | undefined): row is StoredSeam {
  if (
    !row ||
    row.kind !== 'surface' ||
    row.status !== 'confirmed' ||
    row.stale ||
    row.sideA.length !== 1 ||
    row.sideB.length !== 1
  )
    return false;
  const [a] = row.sideA;
  const [b] = row.sideB;
  const aPlacement = a.placement;
  const bPlacement = b.placement;
  return (
    a.piece !== b.piece &&
    /^i(?:0|[1-9][0-9]*)$/.test(a.edgeHint) &&
    b.edgeHint.startsWith(`${b.piece}#`) &&
    !!aPlacement &&
    !!bPlacement &&
    [aPlacement.xMm, aPlacement.yMm, aPlacement.rotDeg].every(Number.isFinite) &&
    aPlacement.xMm === bPlacement.xMm &&
    aPlacement.yMm === bPlacement.yMm &&
    aPlacement.rotDeg === bPlacement.rotDeg &&
    aPlacement.flip === bPlacement.flip
  );
}

export function samePlacedSurfaceSeam(expected: StoredSeam, actual: StoredSeam | undefined) {
  return (
    isPlacedSurfaceDirectionSeam(actual) &&
    canonical(toWire(expected)) === canonical(toWire(actual))
  );
}

type Operation = { operationNumber?: number; seamKeys?: readonly string[] };

function savedOwner(operations: readonly Operation[], operationNumber: number, key: string) {
  const numbered = operations.filter((operation) => operation.operationNumber === operationNumber);
  const owners = operations.filter((operation) => operation.seamKeys?.includes(key));
  return numbered.length === 1 &&
    owners.length === 1 &&
    numbered[0] === owners[0] &&
    numbered[0]?.seamKeys?.filter((seamKey) => seamKey === key).length === 1
    ? numbered[0]
    : undefined;
}

/** Capture the same exact saved rows for both sides, including same-material pairs. */
export function captureSavedSurfaceDirection(
  card: common_TechCard,
  operationNumber: number,
  seam: StoredSeam,
): Capture {
  const { id, lockVersion, techCard: body } = card;
  if (
    !id ||
    typeof lockVersion !== 'number' ||
    !Number.isSafeInteger(lockVersion) ||
    lockVersion < 0 ||
    !body ||
    !Number.isSafeInteger(operationNumber) ||
    operationNumber <= 0 ||
    !isPlacedSurfaceDirectionSeam(seam) ||
    !savedOwner(body.operations ?? [], operationNumber, seam.seamKey)
  )
    throw new Error(changed);

  const patterns = body.patterns ?? [];
  const bindings = bindingScopes(rollGoodsScopes(body.bomItems ?? []), patterns);
  const rows: DxfProductSavedRowIdentityV1[] = [];
  const aliases = [];
  for (const part of [seam.sideA[0], seam.sideB[0]]) {
    const hits = (body.pieceDxfAliases?.items ?? []).filter(
      ({ pieceLineKey }) => pieceLineKey === part.piece,
    );
    const [alias] = hits;
    if (hits.length !== 1 || !alias?.blockName) throw new Error(changed);
    const scopeKey = savedWorkbenchBindingScopeKeyV1(
      alias.fabricPurpose,
      alias.bomLineKey,
      bindings,
    );
    const candidates = patterns.filter(
      ({ fabricPurpose, bomLineKey, url }) =>
        isDxfUrl(url) &&
        savedWorkbenchBindingScopeKeyV1(fabricPurpose, bomLineKey, bindings) === scopeKey,
    );
    const [pattern] = candidates;
    if (candidates.length !== 1 || !pattern?.lineKey || !pattern.url) throw new Error(changed);
    const expected = {
      techCardId: id,
      cardLockVersion: lockVersion,
      scopeKey,
      patternLineKey: pattern.lineKey,
      revision: pattern.savedRowRevision ?? 0,
      url: pattern.url,
      sizeBytes: Number(pattern.sizeBytes ?? 0),
      sha256: pattern.sha256 ?? '',
    };
    rows.push(assertExactZeroOperationSavedPatternRowV1(card, expected).row);
    aliases.push({ scopeKey, blockName: alias.blockName, pieceLineKey: part.piece });
  }
  return { operationNumber, seam: structuredClone(seam), rows: [rows[0]!, rows[1]!], aliases };
}

/** The ordinary encoder must preserve each part, allowing only omitted protobuf defaults. */
function readLosslessSurface(wire: TechCardSeamWire): StoredSeam | null {
  const row = fromWire(wire);
  if (!row || !isPlacedSurfaceDirectionSeam(row)) return null;
  const outgoing = toWire(row);
  if (
    wire.kind !== outgoing.kind ||
    wire.status !== outgoing.status ||
    (wire.direction ?? 'TECH_CARD_SEAM_DIRECTION_UNKNOWN') !== outgoing.direction ||
    wire.source !== outgoing.source
  )
    return null;
  const part = ({ layer, ...value }: TechCardSeamAnchorWire) => ({
    ...value,
    rangeFrom: value.rangeFrom ?? 0,
    rangeTo: value.rangeTo ?? 0,
    notches: value.notches ?? 0,
    turnDeg: value.turnDeg ?? 0,
    ...(layer && layer !== 'TECH_CARD_SEAM_LAYER_UNKNOWN' && { layer }),
    ...(value.placement && {
      placement: {
        xMm: value.placement.xMm ?? 0,
        yMm: value.placement.yMm ?? 0,
        rotDeg: value.placement.rotDeg ?? 0,
        flip: value.placement.flip ?? false,
      },
    }),
  });
  return canonical(part(wire.sideA!.parts![0]!)) === canonical(part(outgoing.sideA!.parts![0]!)) &&
    canonical(part(wire.sideB!.parts![0]!)) === canonical(part(outgoing.sideB!.parts![0]!))
    ? row
    : null;
}

export async function writeSavedSurfaceDirection(
  capture: Capture,
  direction: Direction,
  change: SeamWrites['change'],
  isCurrent: (pending: boolean) => boolean,
  signal: AbortSignal,
) {
  const { seam, operationNumber, rows, aliases } = capture;
  if (!isCurrent(false) || signal.aborted || seam.direction === direction) throw new Error(changed);
  const [anchor] = rows;
  const source = await readCompleteSavedAssemblySourceV1(
    abortableAdminService(signal),
    anchor,
    { sourceOnly: true },
    signal,
  );
  signal.throwIfAborted();
  const stored = source.ownedSeams.filter(({ seamKey }) => seamKey === seam.seamKey);
  const saved = stored.length === 1 ? readLosslessSurface(stored[0]!) : undefined;
  if (
    !isCurrent(false) ||
    !saved ||
    !samePlacedSurfaceSeam(seam, saved) ||
    !savedOwner(source.operations, operationNumber, seam.seamKey) ||
    !rows.every((row) =>
      source.rows.some((member) =>
        (Object.keys(row) as (keyof DxfProductSavedRowIdentityV1)[]).every(
          (key) => row[key] === member[key],
        ),
      ),
    ) ||
    !aliases.every((alias) => {
      const matches = source.aliases.filter(
        ({ pieceLineKey }) => alias.pieceLineKey === pieceLineKey,
      );
      return (
        matches.length === 1 &&
        matches[0]?.scopeKey === alias.scopeKey &&
        matches[0]?.blockName === alias.blockName
      );
    })
  )
    throw new Error(changed);

  const next = { ...saved, direction };
  const result = await change(
    { upsert: [next], expectedServerAssemblyRevision: source.serverAssemblyRevision },
    {
      verb: 'Edit surface seam direction',
      errorAt: seam.seamKey,
      ...capturedSeamWriteOptions({
        expectedLockVersion: anchor.cardLockVersion,
        validate: () =>
          isCurrent(true) && !signal.aborted ? { ok: true } : { ok: false, why: changed },
      }),
    },
  );
  if (!result.ok) throw new Error(result.why);
  const echo = result.echo?.filter(({ seamKey }) => seamKey === seam.seamKey);
  const echoed = echo?.length === 1 ? readLosslessSurface(echo[0]!) : undefined;
  if (
    result.lockVersion !== anchor.cardLockVersion + 1 ||
    result.keyMap.size !== 0 ||
    result.deletedKeys.length !== 0 ||
    !echoed ||
    !samePlacedSurfaceSeam(next, echoed)
  )
    throw new Error('The saved direction could not be verified. Reopen the saved seam.');
}

export function SavedSurfaceDirection({
  capture,
  disabled,
  change,
  canWrite,
}: Readonly<{
  capture: Capture;
  disabled: boolean;
  change: SeamWrites['change'];
  canWrite: (capture: Capture, pending: boolean) => boolean;
}>) {
  const { seam } = capture;
  const [choice, setChoice] = useState<Direction | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const attempt = useRef<AbortController | null>(null);
  const current = useRef(canWrite);
  useLayoutEffect(() => {
    current.current = canWrite;
  }, [canWrite]);
  useLayoutEffect(() => () => attempt.current?.abort(), []);

  async function save() {
    if (disabled || attempt.current || !choice || seam.direction === choice) return;
    const controller = new AbortController();
    attempt.current = controller;
    setSaving(true);
    setFeedback('');
    try {
      await writeSavedSurfaceDirection(
        capture,
        choice,
        change,
        (pending) => current.current(capture, pending),
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setChoice(null);
        setFeedback('Seam direction saved.');
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setFeedback(
          error instanceof Error ? error.message : 'The seam direction could not be saved.',
        );
    } finally {
      attempt.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  const label = directions.find(({ value }) => value === seam.direction)?.label ?? 'Unspecified';
  return (
    <div
      role='group'
      aria-label='Saved surface seam direction'
      data-seam-surface-direction=''
      className='flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline px-3 py-1 md:px-5'
    >
      <Text size='micro' variant='label'>
        Saved direction · {label}
      </Text>
      <ChipRow>
        {directions.map(({ value, label }) => (
          <Chip
            key={value}
            selected={choice === value}
            pressed={choice === value}
            disabled={disabled || saving || seam.direction === value}
            onClick={() => {
              setChoice(value);
              setFeedback('');
            }}
          >
            {label}
          </Chip>
        ))}
      </ChipRow>
      <Button
        type='button'
        size='xs'
        variant='underline'
        disabled={disabled || saving || !choice || choice === seam.direction}
        onClick={() => void save()}
      >
        Save direction
      </Button>
      {feedback && (
        <Text size='micro' role='status'>
          {feedback}
        </Text>
      )}
    </div>
  );
}
