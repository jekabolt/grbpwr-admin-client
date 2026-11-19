import { abortableAdminService } from 'api/api';
import type { DxfProductSavedReprocessResultV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { useEffect, useState } from 'react';
import { Text } from 'ui';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import {
  isVerifiedSavedAssemblyNativeDirectedSubrangeReceiptV1,
  resolveSavedAssemblyNativeDirectedSubrangesV1,
  type SavedAssemblyNativeDirectedSubrangeReceiptV1,
} from './saved-assembly-native-directed-intervals-v1';

export type SavedSeamSubrangeTargetV1 = Readonly<{
  operationNumber: number;
  seamKey: string;
  cardLockVersion: number;
  sizeToken: string;
}>;

type ReadState =
  | { status: 'loading' | 'unavailable' }
  | {
      status: 'verified';
      sides: SavedAssemblyNativeDirectedSubrangeReceiptV1['orderedSeams'][number]['sides'];
    };

function millimetres(value: number) {
  const rounded = Number(value.toFixed(4));
  const approximate = Math.abs(value - rounded) > Number.EPSILON * Math.max(1, value);
  return `${approximate ? '≈' : ''}${rounded} mm`;
}

/** Read-only details for the current signed native row already loaded by the CAD table. */
export default function CadTableSavedSeamSubrangePanelV1({
  target: { operationNumber, seamKey, cardLockVersion, sizeToken },
  replay,
  catalogCanonicalSha256,
}: Readonly<{
  target: SavedSeamSubrangeTargetV1;
  replay: Extract<DxfProductSavedReprocessResultV1, { ok: true }>;
  catalogCanonicalSha256: string;
}>) {
  const [result, setResult] = useState<ReadState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setResult({ status: 'loading' });
    void (async () => {
      const row = replay.row;
      if (row.cardLockVersion !== cardLockVersion) return null;
      const source = await readCompleteSavedAssemblySourceV1(
        abortableAdminService(signal),
        row,
        { sourceOnly: true },
        signal,
      );
      const read = await resolveSavedAssemblyNativeDirectedSubrangesV1(
        {
          source,
          expectedRow: row,
          replay,
          operationNumber,
          sizeToken,
          expectedCatalogCanonicalSha256: catalogCanonicalSha256,
        },
        signal,
      );
      if (!read.ok || !isVerifiedSavedAssemblyNativeDirectedSubrangeReceiptV1(read.receipt))
        return null;
      const seam = read.receipt.orderedSeams[0];
      return seam?.seamKey === seamKey ? seam.sides : null;
    })().then(
      (sides) => {
        if (!signal.aborted)
          setResult(sides ? { status: 'verified', sides } : { status: 'unavailable' });
      },
      () => {
        if (!signal.aborted) setResult({ status: 'unavailable' });
      },
    );
    return () => controller.abort();
  }, [cardLockVersion, catalogCanonicalSha256, operationNumber, replay, seamKey, sizeToken]);

  return (
    <div className='space-y-1 px-3 py-2' data-cad-saved-seam-subrange={result.status}>
      {result.status === 'verified' ? (
        result.sides.map(({ pieceLineKey, nativeSubrange }, index) => {
          if (!nativeSubrange) return null;
          const {
            parentLengthMm,
            denominator,
            forwardNumerators: [start, end],
          } = nativeSubrange;
          const scaleMm = parentLengthMm / denominator;
          return (
            <Text key={pieceLineKey} component='p' size='micro' role='status'>
              Side {index === 0 ? 'A' : 'B'} · {millimetres(start * scaleMm)} to{' '}
              {millimetres(end * scaleMm)} along the edge · {millimetres((end - start) * scaleMm)}{' '}
              length
            </Text>
          );
        })
      ) : (
        <Text component='p' size='micro' role='status'>
          {result.status === 'loading'
            ? 'Checking the saved seam range…'
            : 'The saved seam range could not be verified on this pattern.'}
        </Text>
      )}
    </div>
  );
}
