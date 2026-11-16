import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from 'ui';

import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_OPERATION_NAVIGATION_V1,
  type PatternImportDxfPhaseECadOperationNavigationItemV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-operation-navigation-v1';
import { PatternImportDxfPhaseECadTableDraftOperationsPanelV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-table-draft-operations-panel-v1';
import type { PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-workbench-stitch-editor-handoff-v1';
import { patternImportDxfPhaseECadWorkbenchStitchEditableV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-workbench-stitch-route-intent-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1,
  type PatternImportDxfPhaseEStitchVisualV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/stitch-visual-v1';

const status = Object.freeze({
  missing: false,
  broken: false,
  problem: false,
  draft: false,
  review: false,
});

const operation = (
  index: number,
  operationNumber: number,
  title: string,
  work: string,
  input: string,
  seamKey: string,
  output: string,
): PatternImportDxfPhaseECadOperationNavigationItemV1 =>
  Object.freeze({
    index,
    operationNumber,
    title,
    work,
    typeLabel: 'Machine operation',
    status,
    context: Object.freeze({
      inputs: Object.freeze([{ key: input, label: input }]),
      seamKeys: Object.freeze([seamKey]),
      output: Object.freeze({ key: output, label: output }),
      bomRefs: Object.freeze([{ key: 'THREAD_BLACK', label: 'Black thread' }]),
      warnings: Object.freeze([]),
    }),
  });

const operations = Object.freeze([
  operation(0, 10, 'Join side seams', 'Sew', 'Front + back', 'side seams', 'Body'),
  operation(1, 20, 'Topstitch side seams', 'Topstitch', 'Body', 'side topstitch', 'Body finished'),
]);

const stitchVisual: PatternImportDxfPhaseEStitchVisualV1 = Object.freeze({
  schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1,
  seam: Object.freeze({ kind: 'LS', classValue: 'LAPPED', classLabel: 'Lapped seam' }),
  stitch: Object.freeze({ densityPerCm: 4, widthMm: 2.5 }),
  topstitch: Object.freeze({
    mode: 'PARALLEL',
    modeLabel: 'Parallel',
    offsetMm: 6,
    offsetLabel: 'Offset',
    rows: 1,
  }),
  machine: Object.freeze({ needleGaugeMm: 4.8, rowSpacingMm: 6 }),
  thread: Object.freeze({ bomLineKey: 'THREAD_BLACK' }),
});

const editable = patternImportDxfPhaseECadWorkbenchStitchEditableV1();
const stitchEditCapabilities = Object.freeze({
  type: editable,
  density: editable,
  gauge: editable,
  offset: editable,
  thread: editable,
});

function AssemblyOrderBrowserSmoke() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lastEditField, setLastEditField] =
    useState<PatternImportDxfPhaseECadWorkbenchStitchEditorFieldV1 | null>(null);
  const current = operations.find(({ index }) => index === selectedIndex) ?? operations[0];
  const navigation = useMemo(
    () => ({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_OPERATION_NAVIGATION_V1,
      selectedIndex,
      items: operations,
    }),
    [selectedIndex],
  );

  return (
    <TooltipProvider>
      <main
        className='h-screen overflow-auto bg-pageBg p-3'
        data-ao-browser-smoke-root=''
        data-selected-operation-index={selectedIndex}
        data-last-edit-field={lastEditField ?? undefined}
      >
        <div className='mx-auto min-h-full max-w-lg bg-bgColor'>
          <PatternImportDxfPhaseECadTableDraftOperationsPanelV1
            editor={
              <div className='space-y-2 p-3' data-ao-real-operation-editor=''>
                <p className='text-micro font-bold'>Assembly Order editor</p>
                <p className='text-micro' data-ao-editor-focus-field={lastEditField ?? undefined}>
                  {lastEditField ? `Editing ${lastEditField}` : 'Choose a stitch fact'}
                </p>
              </div>
            }
            result={{
              ok: false,
              plan: null,
              blocker: {
                code: 'current-operation-unavailable',
                detail: 'No session draft is required for this browser fixture.',
                operationNumber: current.operationNumber,
                processKind: 'connect',
              },
            }}
            operationNumber={current.operationNumber}
            navigation={navigation}
            stitchVisual={stitchVisual}
            stitchEditCapabilities={stitchEditCapabilities}
            onEditStitchField={setLastEditField}
            onSelectOperation={setSelectedIndex}
          />
        </div>
      </main>
    </TooltipProvider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Assembly Order browser smoke root is unavailable.');
createRoot(root).render(<AssemblyOrderBrowserSmoke />);
