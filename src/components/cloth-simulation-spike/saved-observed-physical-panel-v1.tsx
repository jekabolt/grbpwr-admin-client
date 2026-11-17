import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, GroupLabel, Text } from 'ui';
import type { SavedModelDisplayedTriangleBodySessionV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import type { SavedObservedPhysicalHostV1 } from './saved-observed-physical-host-v1';
import { SavedObservedPlacementAuthoringV1 } from './saved-observed-placement-authoring-v1';
import { BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1 } from './beta-skirt-strain-utilization-legend-v1';

type Props = Readonly<{
  host: SavedObservedPhysicalHostV1;
  bodySession: SavedModelDisplayedTriangleBodySessionV2;
}>;
type Authoring = Awaited<ReturnType<SavedObservedPhysicalHostV1['authoring']>>;

/** Mount only for the explicitly selected observed profile; its source was chosen before consume. */
export function SavedObservedPhysicalPanelV1({ host, bodySession }: Props) {
  const state = useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
  const body = useSyncExternalStore(
    bodySession.subscribe,
    bodySession.getSnapshot,
    bodySession.getSnapshot,
  );
  if (!host.latestCompile())
    return (
      <Text variant='label'>
        Confirm the saved Assembly seams to compile the garment for this mannequin.
      </Text>
    );
  return (
    <CurrentObservedPreview
      key={`${state.generation}:${body.generation}`}
      host={host}
      bodySession={bodySession}
    />
  );
}

function message(cause: unknown) {
  const text = cause instanceof Error ? cause.message : 'Cloth preview could not complete.';
  return /\b[a-f0-9]{64}\b/i.test(text)
    ? 'The saved assembly or mannequin changed. Reload placement and try again.'
    : text.slice(0, 600);
}

function CurrentObservedPreview({ host, bodySession }: Props) {
  const state = useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
  const body = useSyncExternalStore(
    bodySession.subscribe,
    bodySession.getSnapshot,
    bodySession.getSnapshot,
  );
  const [authoring, setAuthoring] = useState<Authoring | null>(null);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const compute = useRef<HTMLCanvasElement>(null);
  const display = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
      host.stop();
    };
  }, [host]);
  useEffect(() => {
    setAuthoring(null);
    if (body.status !== 'observed-body-bound') {
      setPending(false);
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(null);
    void (async () => {
      try {
        await host.waitUntilIdle(controller.signal);
        const draft = await host.authoring(controller.signal);
        if (controller.signal.aborted) return;
        const restored = await host.reloadPlacement(controller.signal);
        if (controller.signal.aborted || !mounted.current) return;
        setAuthoring(draft);
        setEditing(!restored);
      } catch (cause) {
        if (!controller.signal.aborted && mounted.current) setError(message(cause));
      } finally {
        if (active.current === controller) active.current = null;
        if (!controller.signal.aborted && mounted.current) setPending(false);
      }
    })();
    return () => controller.abort();
  }, [host, body.generation, body.status, revision]);

  const stop = () => {
    active.current?.abort();
    active.current = null;
    host.stop();
    setPending(false);
  };
  const run = async () => {
    if (active.current || !compute.current || !display.current || state.requiresReload) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(null);
    try {
      await host.waitUntilIdle(controller.signal);
      const first = await host.run16(compute.current, controller.signal);
      if (!first.ok || controller.signal.aborted) return;
      await host.run32(compute.current, display.current, controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) setError(message(cause));
    } finally {
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted && mounted.current) setPending(false);
    }
  };
  const currentBody = body.status === 'observed-body-bound';
  const canRun = currentBody && !!authoring && !editing && !pending && !state.requiresReload;
  return (
    <div
      className='flex min-w-0 flex-col gap-stack'
      aria-label='Selected mannequin cloth preview'
      data-observed-cloth-preview-v1=''
    >
      <GroupLabel>Cloth on selected mannequin</GroupLabel>
      {!currentBody ? (
        <Text role='status'>Choose a saved mannequin and wait for its current body to appear.</Text>
      ) : null}
      {editing && authoring ? (
        <SavedObservedPlacementAuthoringV1
          composerSnapshot={authoring.compiled.composerSnapshot}
          composerProjection={authoring.mesh}
          observedTarget={currentBody ? authoring.target : null}
          disabled={pending || state.requiresReload}
          onConfirmedIntent={async (intent) => {
            if (active.current || !currentBody) throw new Error('Wait for the current mannequin.');
            const controller = new AbortController();
            active.current = controller;
            setPending(true);
            setError(null);
            try {
              await host.waitUntilIdle(controller.signal);
              await host.savePlacement(intent, controller.signal);
              if (mounted.current && !controller.signal.aborted) setEditing(false);
            } finally {
              if (active.current === controller) active.current = null;
              if (mounted.current && !controller.signal.aborted) setPending(false);
            }
          }}
        />
      ) : null}
      <div className='flex flex-wrap gap-stack'>
        <Button
          type='button'
          size='sm'
          variant='main'
          disabled={!canRun}
          onClick={() => {
            void run();
          }}
        >
          {state.status === 'running' || state.status === 'building-runtime'
            ? 'Simulating…'
            : 'Simulate 16 / 32 frames'}
        </Button>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          disabled={!pending && state.status !== 'preview-ready'}
          onClick={stop}
        >
          Stop preview
        </Button>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          disabled={pending || !currentBody}
          onClick={() => {
            stop();
            setRevision((value) => value + 1);
          }}
        >
          Reload saved placement
        </Button>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          disabled={pending || !authoring || !currentBody || state.requiresReload}
          onClick={() => {
            stop();
            setEditing(true);
          }}
        >
          Edit placement
        </Button>
      </div>
      {pending && state.status !== 'running' ? (
        <Text role='status'>Checking the current garment and mannequin…</Text>
      ) : null}
      {error || state.detail ? (
        <Text variant='errorLabel' role='alert'>
          {error ?? message(new Error(state.detail!))}
        </Text>
      ) : null}
      {state.requiresReload ? (
        <Text role='status'>
          The save outcome needs verification. Reload saved placement before saving again.
        </Text>
      ) : null}
      <canvas ref={compute} width={64} height={64} hidden aria-hidden='true' />
      <canvas
        ref={display}
        width={640}
        height={720}
        className={state.status === 'preview-ready' ? 'aspect-[8/9] w-full bg-pageBg' : 'hidden'}
        aria-label='Garment strain on the selected mannequin'
      />
      {state.status === 'preview-ready' && state.heatmapReceipt ? (
        <>
          <div className='flex h-3 w-full' aria-hidden='true'>
            {BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1.stops.map((stop) => (
              <span
                key={stop.utilization}
                className='flex-1'
                style={{
                  backgroundColor: stop.color,
                }}
              />
            ))}
          </div>
          <Text>
            32-frame preview. Maximum strain utilization:{' '}
            {state.heatmapReceipt.maximumUtilization.toFixed(2)}.
          </Text>
          <Text variant='label'>
            Colour shows provisional dimensionless strain utilization, from 0 to ≥2. This is not
            stress in Pa or a fit assessment. The 32-frame run starts from the saved initial
            placement and verifies the 16-frame checkpoint.
          </Text>
        </>
      ) : null}
    </div>
  );
}
