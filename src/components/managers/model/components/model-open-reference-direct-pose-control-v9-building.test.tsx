import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ModelOpenReferenceDirectPoseControlV9 } from './model-open-reference-direct-pose-control-v9';
import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';

const POSED: ModelOpenReferenceDirectPoseV9 = Object.freeze({
  ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  bodyFlexionDegrees: 12,
});

function buttonDisabled(html: string, label: string) {
  const match = new RegExp(
    `<button([^>]*)>(?:(?!</button>).)*?${label}(?:(?!</button>).)*?</button>`,
  ).exec(html);
  expect(match, label).not.toBeNull();
  return /\sdisabled(=|\s|>|$)/.test(match![1]);
}

function render(status: 'building' | 'idle', session = true) {
  return renderToStaticMarkup(
    <ModelOpenReferenceDirectPoseControlV9
      draftPose={POSED}
      appliedPose={MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9}
      status={status}
      overlayStatus='ready'
      overlayError={null}
      onDraftChange={() => undefined}
      onApply={() => undefined}
      sessionPose={
        session
          ? {
              dirty: true,
              canUndo: true,
              onUndo: () => MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
              onReset: () => MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
            }
          : undefined
      }
      editPoseToggle={{ on: true, onChange: () => undefined }}
    />,
  );
}

describe('V9 pose tools while the committed pose rebuilds', () => {
  it('keeps undo and reset enabled during a rebuild after a joint drag', () => {
    for (const status of ['building', 'idle'] as const) {
      const html = render(status);
      expect(buttonDisabled(html, 'undo'), `undo ${status}`).toBe(false);
      expect(buttonDisabled(html, 'reset'), `reset ${status}`).toBe(false);
    }
  });

  it('lets the temporary pose undo a committed drag before its rebuild lands', () => {
    const html = render('building', false);
    expect(buttonDisabled(html, 'undo')).toBe(false);
    expect(buttonDisabled(html, 'reset')).toBe(false);
  });
});
