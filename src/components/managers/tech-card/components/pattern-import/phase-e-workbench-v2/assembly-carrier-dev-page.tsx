import { useQueryClient } from '@tanstack/react-query';
import { abortableAdminService } from 'api/api';
import type { TechCardPatternSemanticSidecar } from 'api/proto-http/admin';
import { resolveModelOpenReferencePreviewInputV1 } from 'components/managers/model/components/model-open-reference-preview-input-v1';
import { modelCardMannequinInputV1 } from 'components/managers/models/components/model-card-mannequin-input-v1';
import { createSavedModelDisplayedTriangleBodyFreshQueryReaderV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-query-session-v2';
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
// Diagnostic only: mirrors internal/dto/techcard.go purpose map and entity/techcard.go values.
// Apply exclusively to resolver-confirmed purpose groups; arbitrary BOM line keys stay exact.
const SERVER_PURPOSE_SCOPE: Readonly<Record<string, string>> = {
  TECH_CARD_BOM_PURPOSE_MAIN: 'main',
  TECH_CARD_BOM_PURPOSE_LINING: 'lining',
  TECH_CARD_BOM_PURPOSE_POCKETING: 'pocketing',
  TECH_CARD_BOM_PURPOSE_INTERFACING: 'interfacing',
  TECH_CARD_BOM_PURPOSE_INSULATION: 'insulation',
  TECH_CARD_BOM_PURPOSE_CONTRAST: 'contrast',
  TECH_CARD_BOM_PURPOSE_BINDING: 'binding',
  TECH_CARD_BOM_PURPOSE_MESH: 'mesh',
  TECH_CARD_BOM_PURPOSE_OTHER: 'other',
};
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

function AssemblyCarrierDevCardView({ cardId }: Readonly<{ cardId: number }>) {
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
      try {
        const lastImport = localStorage.getItem(`dev.workbenchImport.${cardId}`);
        if (lastImport && lastImport.length < 2048)
          report.lastManualImport = JSON.parse(lastImport);
      } catch {
        // This diagnostic is optional and local to this browser.
      }
      const client = abortableAdminService(current.signal);
      const response = await client.GetTechCard({ id: cardId, vatCountryCode: undefined });
      const card = response.techCard;
      if (!card?.techCard) throw new Error('Card missing in response.');
      const patterns = card.techCard.patterns ?? [];
      const operations = card.techCard.operations ?? [];
      const pieces = card.techCard.pieces ?? [];
      const aliases = card.techCard.pieceDxfAliases?.items ?? [];
      const seams = card.seams ?? [];
      const scopes = rollGoodsScopes(card.techCard.bomItems ?? []);
      const bindings = bindingScopes(scopes, patterns);
      const operation = operations.find(
        (op) => (op.operationNumber ?? 0) > 0 && (op.seamKeys?.length ?? 0) > 0,
      );
      report.cardLockVersion = card.lockVersion;
      report.patternCount = patterns.length;
      report.sizeIds = card.techCard.sizeIds;
      report.materials = scopes.slice(0, 20).map(({ key, byPurpose, lines }) => ({
        key,
        byPurpose,
        lines: lines.slice(0, 20).map(({ lineKey, name, purpose, section }) => ({
          lineKey,
          name,
          purpose,
          section,
        })),
      }));
      report.pieceCount = pieces.length;
      report.pieces = pieces.slice(0, 100).map(({ lineKey, name, ungraded }) => ({
        lineKey,
        name,
        ungraded,
      }));
      report.aliasCount = aliases.length;
      report.aliases = aliases.slice(0, 100).map((alias) => ({
        pieceLineKey: alias.pieceLineKey,
        fabricPurpose: alias.fabricPurpose,
        bomLineKey: alias.bomLineKey,
        blockName: alias.blockName,
      }));
      report.operations = operations.slice(0, 100).map((op) => ({
        number: op.operationNumber,
        type: op.operationType,
        pieceLineKeys: op.pieceLineKeys,
        bomLineKeys: op.bomLineKeys,
        seamKeys: op.seamKeys,
      }));
      report.seamCount = seams.length;
      report.seams = seams.slice(0, 100).map((seam) => ({
        seamKey: seam.seamKey,
        kind: seam.kind,
        status: seam.status,
        direction: seam.direction,
        anchoredSize: seam.anchoredSize,
        stale: seam.stale,
        sideA: seam.sideA?.parts?.slice(0, 8).map((part) => ({
          pieceLineKey: part.pieceLineKey,
          edgeHint: part.edgeHint,
          lenMm: part.lenMm,
        })),
        sideB: seam.sideB?.parts?.slice(0, 8).map((part) => ({
          pieceLineKey: part.pieceLineKey,
          edgeHint: part.edgeHint,
          lenMm: part.lenMm,
        })),
      }));
      const rows = patterns.slice(0, 20).map((row) => {
        const uiScopeKey = scopeKeyOfBinding(row.fabricPurpose, row.bomLineKey, bindings);
        const byPurpose = scopes.some((scope) => scope.key === uiScopeKey && scope.byPurpose);
        return {
          patternLineKey: row.lineKey,
          uiScopeKey,
          scopeKey: byPurpose ? SERVER_PURPOSE_SCOPE[uiScopeKey] ?? uiScopeKey : uiScopeKey,
          scopeMapping: byPurpose ? 'diagnostic-enum-to-entity-purpose' : 'exact-line-key',
          savedRowRevision: row.savedRowRevision,
          version: row.version,
          sizeId: row.sizeId,
          sha256: row.sha256,
          sizeBytes: row.sizeBytes,
          filename: row.filename,
          urlPresent: !!row.url,
          downloadUrlPresent: !!row.downloadUrl,
          carrier: { status: 'not-read' } as unknown,
          storedCarrierDiagnostic: { status: 'not-read' } as unknown,
        };
      });
      report.rows = rows;
      show();
      for (let index = 0; index < rows.length; index++) {
        const row = patterns[index];
        const summary = rows[index];
        try {
          if (!row.lineKey) throw new Error('Pattern line key is missing.');
          const saved = await client.GetTechCardPatternSemanticSidecar({
            techCardId: cardId,
            patternLineKey: row.lineKey,
          });
          summary.storedCarrierDiagnostic = {
            currentRowBound: false,
            AOFreshnessVerified: false,
            carrier: await carrier(saved.semanticSidecar),
          };
        } catch (error) {
          const status =
            error && typeof error === 'object' && 'status' in error ? error.status : null;
          summary.storedCarrierDiagnostic = {
            status: status === 404 ? 'not-found' : 'read-error',
            currentRowBound: false,
            AOFreshnessVerified: false,
            error: safeError(error),
          };
        }
        show();
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
            returnedScopeKey: snapshot.row?.scopeKey,
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

function SavedModelDiagnostic({ modelId }: Readonly<{ modelId: number }>) {
  const queryClient = useQueryClient();
  const [output, setOutput] = useState('No request made.');
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function read() {
    if (!import.meta.env.DEV || !Number.isSafeInteger(modelId) || modelId < 1) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPending(true);
    const report = { modelId, readAt: new Date().toISOString(), writes: 0 };
    try {
      const readFresh = createSavedModelDisplayedTriangleBodyFreshQueryReaderV2(queryClient);
      const model = await readFresh(modelId, current.signal);
      if (current.signal.aborted) return;
      if (model?.id !== modelId) throw new Error('Model read failed.');
      const input = modelCardMannequinInputV1(model);
      const resolution = resolveModelOpenReferencePreviewInputV1(input);
      setOutput(
        bounded({
          ...report,
          validGender:
            input.gender === 'GENDER_ENUM_FEMALE' ||
            input.gender === 'GENDER_ENUM_MALE' ||
            input.gender === 'GENDER_ENUM_UNISEX',
          resolved: resolution.ok,
          diagnostics: resolution.diagnostics
            .slice(0, 24)
            .map(({ severity, code, canonicalKey }) => ({
              severity,
              code,
              canonicalKey,
            })),
        }),
      );
    } catch {
      if (!current.signal.aborted) setOutput(bounded({ ...report, status: 'model-read-failed' }));
    } finally {
      if (!current.signal.aborted) setPending(false);
    }
  }

  return (
    <div className='space-y-4 p-4'>
      <Text component='h1'>Saved mannequin diagnostic · model {modelId}</Text>
      <Button type='button' disabled={pending} onClick={() => void read()}>
        {pending ? 'Reading…' : 'Read saved model'}
      </Button>
      <pre
        className='max-h-[75vh] overflow-auto whitespace-pre-wrap text-micro'
        aria-label='Saved mannequin diagnostic'
      >
        {output}
      </pre>
    </div>
  );
}

export function AssemblyCarrierDevPage() {
  const [params] = useSearchParams();
  if (!import.meta.env.DEV) return null;
  const model = params.get('model');
  if (model !== null) {
    const modelId = Number(model);
    if (!Number.isSafeInteger(modelId) || modelId < 1)
      return <Text component='p'>Enter a positive model ID.</Text>;
    return <SavedModelDiagnostic key={modelId} modelId={modelId} />;
  }
  return <AssemblyCarrierDevCardView cardId={Number(params.get('card') ?? 156)} />;
}
