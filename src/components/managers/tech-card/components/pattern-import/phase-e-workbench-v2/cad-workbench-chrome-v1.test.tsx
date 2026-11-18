import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Button } from 'ui';
import { PATTERN_IMPORT_DXF_PHASE_E_CAD_OPERATION_NAVIGATION_V1 } from './cad-operation-navigation-v1';

import {
  openPatternImportDxfPhaseECadOperationDetailsForEditV1,
  PatternImportDxfPhaseECadTableDraftOperationsPanelV1,
} from './cad-table-draft-operations-panel-v1';
import {
  PatternImportDxfPhaseECadWorkbenchSplitShellV1,
  resolvePatternImportDxfPhaseECadWorkbenchLayoutV1,
  resolvePatternImportDxfPhaseECadWorkbenchSplitFromDragV1,
} from './cad-workbench-split-shell-v1';

describe('Assembly Table chrome', () => {
  it('keeps every production 2D tool rail centered inside its canvas', () => {
    const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
    const centeredRail =
      'right-2 top-1/2 z-30 flex h-[calc(100%-1rem)] w-12 -translate-y-1/2 items-center overflow-visible';
    const workbench = source('./workbench.tsx');
    const draft = source('./draft-cad-editor-shell-v1.tsx');

    expect(workbench).toContain(centeredRail);
    expect(draft).toContain(centeredRail);
    expect(source('./cad-table-zero-connect-canvas-v1.tsx')).toContain(
      'right-2 top-1/2 z-20 flex max-h-[calc(100%-1rem)] -translate-y-1/2 flex-col',
    );
    expect(workbench).toContain('overflow-y-auto border border-borderColor');
    expect(draft).toContain('overflow-y-auto border border-borderColor');
    expect(workbench).toContain('right-[calc(100%+0.5rem)]');
    expect(draft).toContain('right-[calc(100%+0.5rem)]');
    expect(workbench).toMatch(/<\/nav>[\s\S]*data-cad-tool-flyout='measure'/u);
    expect(draft).toMatch(/<\/nav>[\s\S]*data-draft-cad-tool-flyout=/u);
  });

  it('keeps detached tool flyouts keyboard-connected to their summaries', () => {
    const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
    const workbench = source('./workbench.tsx');
    const draft = source('./draft-cad-editor-shell-v1.tsx');

    for (const implementation of [workbench, draft]) {
      expect(implementation).toContain('aria-controls=');
      expect(implementation).toContain('aria-expanded=');
      expect(implementation).toContain("querySelector<HTMLElement>('button:not(:disabled)')");
      expect(implementation).toContain("event.key === 'Escape'");
      expect(implementation).toContain('.focus()');
    }
    expect(workbench).toContain('aria-labelledby={`${measureToolId}-summary`}');
    expect(draft).toContain(
      'aria-labelledby={`${toolRailId}-tool-summary-${openProductiveToolGroup.id}`}',
    );
    expect(draft).toContain('aria-labelledby={`${toolRailId}-tool-summary-measure`}');
  });

  it('keeps units by Layout and puts the collapse control outside the operation panel', () => {
    const markup = renderToStaticMarkup(
      <PatternImportDxfPhaseECadWorkbenchSplitShellV1
        desktop={<div>desktop</div>}
        mannequin={<div>mannequin</div>}
        operationsPanel={<Button aria-label='Next operation'>→</Button>}
      />,
    );

    expect(markup).toContain('aria-label="Workbench layout controls"');
    expect(markup).toContain('aria-label="Measurement unit"');
    expect(markup).toContain('Layout');
    expect(markup).not.toContain('CAD workbench');
    expect(markup).toMatch(
      /<header[^>]*aria-label="Workbench layout controls"[^>]*>[\s\S]*aria-label="Collapse Current operation"[\s\S]*<\/header>/u,
    );
    expect(markup).toMatch(
      /<aside[^>]*data-cad-operations-window="docked"[^>]*>[\s\S]*aria-label="Next operation"[\s\S]*<\/aside>/u,
    );
    expect(markup).toContain('role="separator"');
  });

  it('keeps the dock and a movable splitter when the track is narrower than the old 52rem floor', () => {
    const layout = resolvePatternImportDxfPhaseECadWorkbenchLayoutV1(
      1024,
      'split',
      'docked',
      320,
      64,
    );
    expect(layout).toMatchObject({ viewMode: 'split', compactDock: false, inlineDockWidth: 320 });
    expect(layout.splitLimits.max).toBeGreaterThan(layout.splitLimits.min);

    const trackWidth = 1024 - layout.inlineDockWidth - 1;
    const nextPercent = resolvePatternImportDxfPhaseECadWorkbenchSplitFromDragV1(
      layout.splitPercent,
      -24,
      trackWidth,
    );
    const afterDrag = resolvePatternImportDxfPhaseECadWorkbenchLayoutV1(
      1024,
      'split',
      'docked',
      320,
      nextPercent,
    );
    const desktopDelta = ((afterDrag.splitPercent - layout.splitPercent) / 100) * trackWidth;
    expect(desktopDelta).toBeCloseTo(-24);
  });

  it('uses the full track for compact split and keeps explicit focus modes available', () => {
    expect(
      resolvePatternImportDxfPhaseECadWorkbenchLayoutV1(1400, 'split', 'docked', 320, 64),
    ).toMatchObject({
      viewMode: 'split',
      compactDock: false,
      inlineDockWidth: 320,
      splitPercent: 64,
    });
    expect(
      resolvePatternImportDxfPhaseECadWorkbenchLayoutV1(768, 'split', 'docked', 320, 64),
    ).toMatchObject({ viewMode: 'split', compactDock: true, canSplit: true });
    expect(
      resolvePatternImportDxfPhaseECadWorkbenchLayoutV1(375, 'split', 'docked', 320, 64),
    ).toMatchObject({ viewMode: 'desktop-only', compactDock: true, canSplit: false });
    expect(
      resolvePatternImportDxfPhaseECadWorkbenchLayoutV1(375, 'mannequin-only', 'docked', 320, 64),
    ).toMatchObject({ viewMode: 'mannequin-only', compactDock: true });
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
    expect(markup).toContain('Select an Assembly Order operation.');
    expect(markup).toContain('operation unavailable');
    expect(markup).toContain('data-test-operation-editor');
    expect(markup).not.toContain('Spec · authoritative editor');
    expect(markup).not.toContain('Draft · Pattern edits');
  });

  it('keeps the ordinary editor in saved review without a draft blocker or missing-seam fallback', () => {
    const editor = <div data-test-operation-editor=''>Existing operation editor</div>;
    const review = renderToStaticMarkup(
      <PatternImportDxfPhaseECadTableDraftOperationsPanelV1
        editor={editor}
        operationNumber={170}
        result={null}
      />,
    );
    expect(review).toContain('OPERATION #170');
    expect(review.match(/data-test-operation-editor/g)).toHaveLength(1);
    expect(review).not.toMatch(
      /operation unavailable|no seam|No inputs|data-cad-operation-draft-pane|issues/u,
    );

    const navigation = {
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_OPERATION_NAVIGATION_V1,
      selectedIndex: 7,
      items: [
        {
          index: 7,
          operationNumber: 170,
          title: 'Finish pocket',
          work: 'Join',
          typeLabel: 'Stitch',
          status: { missing: false, broken: false, problem: false, draft: false, review: false },
          context: {
            inputs: [
              { key: 'front', label: 'Front' },
              { key: 'pocketing', label: 'Pocket bag' },
            ],
            seamKeys: ['physical-170', 'pose-170'],
            output: { key: 'front-with-pocket', label: 'Front with pocket' },
            warnings: [],
            bomRefs: [],
          },
        },
      ],
    };
    const withCurrentOperation = renderToStaticMarkup(
      <PatternImportDxfPhaseECadTableDraftOperationsPanelV1
        editor={editor}
        operationNumber={170}
        result={null}
        navigation={navigation}
        onSelectOperation={() => undefined}
      />,
    );
    expect(withCurrentOperation).toContain('Assembly Order operation switcher');
    expect(withCurrentOperation).toContain('Finish pocket');
    expect(withCurrentOperation).toContain('Front + Pocket bag');
    expect(withCurrentOperation).toContain('physical-170 + pose-170');
    expect(withCurrentOperation).toContain('Front with pocket');
    expect(withCurrentOperation.match(/data-test-operation-editor/g)).toHaveLength(1);
    expect(withCurrentOperation).not.toMatch(/no seam|data-cad-operation-draft-pane|issues/u);
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
