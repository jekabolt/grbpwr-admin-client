import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  openPatternImportDxfPhaseECadOperationDetailsForEditV1,
  PatternImportDxfPhaseECadTableDraftOperationsPanelV1,
} from './cad-table-draft-operations-panel-v1';
import { PatternImportDxfPhaseECadWorkbenchSplitShellV1 } from './cad-workbench-split-shell-v1';

describe('Assembly Table chrome', () => {
  it('keeps only the useful unit and layout controls in the workbench header', () => {
    const markup = renderToStaticMarkup(
      <PatternImportDxfPhaseECadWorkbenchSplitShellV1
        desktop={<div>desktop</div>}
        mannequin={<div>mannequin</div>}
        operationsPanel={<div>operation</div>}
      />,
    );

    expect(markup).toContain('aria-label="Workbench layout controls"');
    expect(markup).toContain('aria-label="Measurement unit"');
    expect(markup).toContain('Layout');
    expect(markup).not.toContain('CAD workbench');
  });

  it('encapsulates context, the real editor and drafts behind one disclosure row', () => {
    const markup = renderToStaticMarkup(
      <PatternImportDxfPhaseECadTableDraftOperationsPanelV1
        editor={<div data-test-operation-editor=''>editor</div>}
        operationNumber={10}
        result={{
          ok: false,
          plan: null,
          blocker: {
            code: 'current-operation-unavailable',
            detail: 'Select an Assembly Order operation.',
            operationNumber: null,
            processKind: 'connect',
          },
        }}
      />,
    );

    expect(markup.match(/<details/g)).toHaveLength(1);
    expect(markup).toContain('Operation details');
    expect(markup).toContain('data-cad-operation-context-pane');
    expect(markup).toContain('data-cad-operation-spec-pane');
    expect(markup).toContain('data-cad-operation-draft-pane');
    expect(markup).toContain('data-test-operation-editor');
    expect(markup).not.toContain('Spec · authoritative editor');
    expect(markup).not.toContain('Draft · Pattern edits');
  });

  it('opens operation details before routing an editable stitch fact', () => {
    const events: string[] = [];

    openPatternImportDxfPhaseECadOperationDetailsForEditV1(
      (open) => events.push(`open:${open}`),
      (field) => events.push(`edit:${field}`),
      'gauge',
    );

    expect(events).toEqual(['open:true', 'edit:gauge']);
  });
});
