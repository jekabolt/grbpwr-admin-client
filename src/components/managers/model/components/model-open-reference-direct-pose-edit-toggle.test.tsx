import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ModelOpenReferenceDirectPoseControlV9 } from './model-open-reference-direct-pose-control-v9';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from './model-open-reference-direct-pose-v9';

function render(on: boolean | undefined) {
  return renderToStaticMarkup(
    <ModelOpenReferenceDirectPoseControlV9
      draftPose={MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9}
      appliedPose={MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9}
      status='idle'
      overlayStatus='ready'
      overlayError={null}
      onDraftChange={() => undefined}
      onApply={() => undefined}
      editPoseToggle={on === undefined ? undefined : { on, onChange: () => undefined }}
    />,
  );
}

describe('edit pose checkbox of the desktop model form', () => {
  it('off: only the checkbox, no pose tools and no instruction text', () => {
    const html = render(false);
    expect(html).toContain('data-edit-pose="off"');
    expect(html).toContain('edit pose');
    expect(html).not.toContain('Mannequin pose tools');
    expect(html).not.toContain('>symmetry<');
    expect(html).not.toContain('Drag a joint');
  });

  it('on: the tools follow the checkbox, the instruction stays screen-reader only', () => {
    const html = render(true);
    expect(html).toContain('data-edit-pose="on"');
    expect(html.indexOf('edit pose')).toBeLessThan(html.indexOf('Mannequin pose tools'));
    expect(html).toContain('>symmetry<');
    expect(html).toContain('>undo<');
    expect(html).toContain('>reset<');
    const status = html.match(/<p[^>]*role="status"[^>]*>Drag a joint/)?.[0] ?? '';
    expect(status).toContain('sr-only');
  });

  it('without the toggle the bar is unchanged (phone and narrow layouts)', () => {
    const html = render(undefined);
    expect(html).not.toContain('data-edit-pose');
    expect(html).toContain('Mannequin pose tools');
    expect(html).toContain('model-mannequin-pose-session-status');
  });
});
