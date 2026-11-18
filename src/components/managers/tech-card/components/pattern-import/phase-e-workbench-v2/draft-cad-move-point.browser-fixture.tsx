import { useState, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';

import { PatternImportDxfPhaseEDraftCadCanvasV1 } from './draft-cad-canvas-v1';
import { createPatternImportDxfPhaseEDraftCadTopologySessionV1 } from './draft-cad-topology-session-v1';

type Input = Pick<
  ComponentProps<typeof PatternImportDxfPhaseEDraftCadCanvasV1>,
  'projection' | 'session'
>;

export function mountDraftPoint({ session: initial, projection }: Input) {
  const root = createRoot(document.getElementById('root')!);
  const topologySession = createPatternImportDxfPhaseEDraftCadTopologySessionV1(
    initial.source.catalog.canonicalSha256,
  );
  let current = initial;
  const App = () => {
    const [session, setSession] = useState(initial);
    return (
      <PatternImportDxfPhaseEDraftCadCanvasV1
        session={session}
        projection={projection}
        activePieceIndex={0}
        activeTool='move-point'
        activeTopologyTool={null}
        topologySession={topologySession}
        onTopologyAnchor={() => {}}
        onSessionChange={(next) => {
          current = next;
          setSession(next);
        }}
      />
    );
  };
  root.render(<App />);
  return { read: () => current.history, unmount: () => root.unmount() };
}
