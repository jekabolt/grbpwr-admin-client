import { abortableAdminService } from 'api/api';
import type { TechCardPatternSemanticSidecar } from 'api/proto-http/admin';
import {
  bindingScopes,
  scopeKeyOfBinding,
} from 'components/managers/tech-card/components/bom-purpose';
import { rollGoodsScopes } from 'components/managers/tech-card/components/piece-block-refs';
import { decodePatternImportDxfProductCompositeSidecarV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Text } from 'ui';

import { decodePatternImportDxfProductCompositeSidecarV4 } from './composite-sidecar-v4';
import { decodePatternImportDxfProductCompositeSidecarV5 } from './composite-sidecar-v5';
import { decodePatternImportDxfProductCompositeSidecarV6 } from './composite-sidecar-v6';
import { decodePatternImportDxfProductCompositeSidecarV7 } from './composite-sidecar-v7';

const MAX_BYTES = 4 * 1024 * 1024;
function safeError(error: unknown) {
  return (error instanceof Error ? error.message : 'Read failed')
    .replace(/https?:\/\/[^\s"']+/g, '[URL omitted]')
    .slice(0, 600);
}
function bounded(value: unknown) {
  return JSON.stringify(
    value,
    (key, entry: unknown) =>
      /^(?:url|expectedUrl|token|authToken|accessToken|refreshToken|patternViewerToken|authorization|password|cookie|sidecarBytes|base64)$/i.test(
        key,
      )
        ? undefined
        : entry,
    2,
  ).slice(0, 120_000);
}
async function carrier(sidecar: TechCardPatternSemanticSidecar | undefined) {
  if (!sidecar) return { status: 'absent' };
  const meta = {
    mediaType: sidecar.mediaType,
    byteLength: sidecar.byteLength,
    sidecarSha256: sidecar.sidecarSha256,
    savedRowRevision: sidecar.savedRowRevision,
    cardLockVersion: sidecar.cardLockVersion,
  };
  try {
    if (
      !sidecar.sidecarBytes ||
      !sidecar.byteLength ||
      sidecar.byteLength > MAX_BYTES ||
      sidecar.sidecarBytes.length > MAX_BYTES * 1.4
    )
      throw new Error('Carrier bytes missing or out of bounds.');
    const raw = atob(sidecar.sidecarBytes);
    if (raw.length !== sidecar.byteLength) throw new Error('Carrier byte length mismatch.');
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
    if (digest !== sidecar.sidecarSha256) throw new Error('Carrier SHA mismatch.');
    const version = /\.v([3-7])\+json$/.exec(sidecar.mediaType ?? '')?.[1];
    if (!version) return { ...meta, status: 'unsupported-media' };
    if (version === '3') {
      const decoded = await decodePatternImportDxfProductCompositeSidecarV3(bytes);
      if (!decoded.ok) return { ...meta, status: 'unreadable', blockers: decoded.blockers };
      return {
        ...meta,
        status: 'decoded',
        version: 3,
        selectedOperation: decoded.exactTopology?.carrier.bindings.selectedOperation,
        exactTopology: decoded.exactTopology?.carrier ?? null,
        nativeSurfaceCompared: false,
      };
    }
    const result =
      version === '7'
        ? await decodePatternImportDxfProductCompositeSidecarV7(bytes)
        : version === '6'
          ? await decodePatternImportDxfProductCompositeSidecarV6(bytes)
          : version === '5'
            ? await decodePatternImportDxfProductCompositeSidecarV5(bytes)
            : await decodePatternImportDxfProductCompositeSidecarV4(bytes);
    if (!result.ok) return { ...meta, status: 'unreadable', blockers: result.blockers };
    const v6 =
      'nestedCompositeV6' in result
        ? result.nestedCompositeV6
        : 'mannequinArrangement' in result
          ? result
          : null;
    const v5 =
      v6?.nestedCompositeV5 ?? ('nestedCompositeV5' in result ? result.nestedCompositeV5 : null);
    const v4 =
      v5?.nestedCompositeV4 ??
      ('nestedCompositeV4' in result
        ? result.nestedCompositeV4
        : 'exactNSeam' in result
          ? result
          : null);
    return {
      ...meta,
      status: 'decoded',
      version: Number(version),
      serverAssemblyRevision: result.document.bindings.serverAssemblyRevision,
      selectedOperation: v4?.exactNSeam.carrier.bindings.selectedOperation,
      catalogCanonicalSha256: v4?.exactNSeam.carrier.bindings.catalogCanonicalSha256,
      exactSeams: v4?.exactNSeam.carrier.seams ?? null,
      arrangement: v6?.mannequinArrangement.bindings ?? null,
      physicalDocument:
        'fullAssemblyPhysicalEnvelope' in result
          ? result.fullAssemblyPhysicalEnvelope.document
          : null,
      nativeSurfaceCompared: false,
    };
  } catch (error) {
    return { ...meta, status: 'unreadable', error: safeError(error) };
  }
}

export function AssemblyCarrierDevPage() {
  const [params] = useSearchParams();
  const cardId = Number(params.get('card') ?? 156);
  const [output, setOutput] = useState('No request made.');
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setOutput('No request made.');
    setPending(false);
    return () => controller.current?.abort();
  }, [cardId]);
  async function read() {
    if (!import.meta.env.DEV || !Number.isSafeInteger(cardId) || cardId < 1) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPending(true);
    const report: Record<string, unknown> = { cardId, readAt: new Date().toISOString(), writes: 0 };
    const show = () => {
      if (!current.signal.aborted) setOutput(bounded(report));
    };
    try {
      const client = abortableAdminService(current.signal);
      const response = await client.GetTechCard({ id: cardId, vatCountryCode: undefined });
      const card = response.techCard;
      if (!card?.techCard) throw new Error('Card missing in response.');
      const patterns = card.techCard.patterns ?? [];
      const operations = card.techCard.operations ?? [];
      const scopes = rollGoodsScopes(card.techCard.bomItems ?? []);
      const bindings = bindingScopes(scopes, patterns);
      const operation = operations.find(
        (op) => (op.operationNumber ?? 0) > 0 && (op.seamKeys?.length ?? 0) > 0,
      );
      report.cardLockVersion = card.lockVersion;
      report.patternCount = patterns.length;
      report.operations = operations.slice(0, 100).map((op) => ({
        number: op.operationNumber,
        type: op.operationType,
        seamKeys: op.seamKeys,
      }));
      const rows = patterns.slice(0, 20).map((row) => ({
        patternLineKey: row.lineKey,
        scopeKey: scopeKeyOfBinding(row.fabricPurpose, row.bomLineKey, bindings),
        savedRowRevision: row.savedRowRevision,
        sha256: row.sha256,
        sizeBytes: row.sizeBytes,
        filename: row.filename,
        urlPresent: !!row.url,
        carrier: { status: 'not-read' } as unknown,
      }));
      report.rows = rows;
      show();
      for (let index = 0; index < rows.length; index++) {
        const row = patterns[index];
        const summary = rows[index];
        try {
          if (!operation) {
            summary.carrier = { status: 'no-seam-bearing-operation' };
            show();
            continue;
          }
          if (
            !row.lineKey ||
            !row.savedRowRevision ||
            !row.url ||
            !row.sizeBytes ||
            !row.sha256 ||
            !summary.scopeKey ||
            card.lockVersion == null
          )
            throw new Error('Saved row lacks exact snapshot identity fields.');
          const snapshot = await client.GetTechCardSavedAssemblySnapshot({
            techCardId: cardId,
            patternLineKey: row.lineKey,
            expectedScopeKey: summary.scopeKey,
            expectedSavedRowRevision: row.savedRowRevision,
            expectedCardLockVersion: card.lockVersion,
            expectedUrl: row.url,
            expectedSizeBytes: row.sizeBytes,
            expectedSha256: row.sha256,
            selectedOperationNumber: operation.operationNumber,
          });
          summary.carrier = {
            snapshotRevision: snapshot.serverAssemblyRevision,
            selectedOperationNumber: snapshot.selectedOperationNumber,
            selectedSeamKeys: snapshot.selectedSeams?.map((seam) => seam.seamKey),
            carrier: await carrier(snapshot.semanticSidecar),
          };
        } catch (error) {
          summary.carrier = { status: 'read-error', error: safeError(error) };
        }
        show();
      }
    } catch (error) {
      report.error = safeError(error);
      show();
    } finally {
      if (!current.signal.aborted) setPending(false);
    }
  }
  if (!import.meta.env.DEV) return null;
  return (
    <div className='space-y-4 p-4'>
      <Text component='h1'>Assembly carrier · read-only diagnostic · card {cardId}</Text>
      <Button type='button' disabled={pending} onClick={() => void read()}>
        {pending ? 'Reading…' : 'Read current card'}
      </Button>
      <pre
        className='max-h-[75vh] overflow-auto whitespace-pre-wrap text-micro'
        aria-label='Assembly carrier diagnostic'
      >
        {output}
      </pre>
    </div>
  );
}
