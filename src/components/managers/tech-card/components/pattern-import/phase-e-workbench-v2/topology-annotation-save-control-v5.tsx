import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Text } from 'ui';

import type { PatternImportDxfPhaseECalloutV1 } from './callout-session-v1';
import type { PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 } from './exact-n-seam-production-mount-v2';
import type { PatternImportDxfPhaseEMeasurementV1 } from './measurement-v1';
import type {
  PatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5,
  PatternImportDxfPhaseETopologyAnnotationSourceV5,
} from './topology-annotation-application-transaction-v5';

export type PatternImportDxfPhaseETopologyAnnotationDraftV5 = Readonly<{
  measurements: readonly PatternImportDxfPhaseEMeasurementV1[];
  callouts: readonly PatternImportDxfPhaseECalloutV1[];
}>;

function fingerprint(draft: PatternImportDxfPhaseETopologyAnnotationDraftV5): string {
  return JSON.stringify(draft);
}

export function PatternImportDxfPhaseETopologyAnnotationSaveControlV5({
  transaction,
  session,
  source,
  draft,
  onReadback,
  disabled = false,
}: Readonly<{
  transaction: PatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5;
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2;
  source: PatternImportDxfPhaseETopologyAnnotationSourceV5;
  draft: PatternImportDxfPhaseETopologyAnnotationDraftV5;
  onReadback: (draft: PatternImportDxfPhaseETopologyAnnotationDraftV5) => void;
  disabled?: boolean;
}>) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'blocked'>(
    'loading',
  );
  const [detail, setDetail] = useState('Reading saved annotations…');
  const baselineRef = useRef<string | null>(null);
  const currentFingerprint = useMemo(() => fingerprint(draft), [draft]);

  useEffect(() => {
    const controller = new AbortController();
    baselineRef.current = null;
    setStatus('loading');
    setDetail('Reading saved annotations…');
    void transaction.load(session, source, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setStatus('blocked');
        setDetail(result.blockers[0].detail);
        return;
      }
      const restored = Object.freeze({
        measurements: result.readback.measurements,
        callouts: result.readback.callouts,
      });
      baselineRef.current = fingerprint(restored);
      onReadback(restored);
      setStatus('ready');
      setDetail(
        `${restored.measurements.length} measurements · ${restored.callouts.length} callouts`,
      );
    });
    return () => controller.abort();
  }, [onReadback, session, source, transaction]);

  const changed = baselineRef.current !== null && baselineRef.current !== currentFingerprint;
  const save = async () => {
    if (!changed || disabled || status === 'saving') return;
    const controller = new AbortController();
    setStatus('saving');
    setDetail('Saving and verifying readback…');
    const result = await transaction.save(session, source, draft, controller.signal);
    if (!result.ok) {
      setStatus('blocked');
      setDetail(result.blockers[0].detail);
      return;
    }
    const restored = Object.freeze({
      measurements: result.readback.measurements,
      callouts: result.readback.callouts,
    });
    baselineRef.current = fingerprint(restored);
    onReadback(restored);
    setStatus('saved');
    setDetail('Saved and verified by fresh readback.');
  };

  return (
    <div
      className='flex items-center justify-between gap-3 border-t border-hairline px-3 py-2'
      data-topology-annotation-save-v5={status}
    >
      <Text component='p' size='micro' variant={status === 'blocked' ? 'errorLabel' : 'label'}>
        {detail}
      </Text>
      {status !== 'loading' && status !== 'blocked' ? (
        <Button
          type='button'
          size='xs'
          variant='main'
          disabled={disabled || !changed || status === 'saving'}
          onClick={() => void save()}
        >
          {status === 'saving'
            ? 'Saving…'
            : status === 'saved' && !changed
              ? 'Saved'
              : 'Save annotations'}
        </Button>
      ) : null}
    </div>
  );
}
