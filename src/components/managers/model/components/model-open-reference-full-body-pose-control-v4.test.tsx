import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
  ModelOpenReferenceFullBodyPoseControlV4,
  modelOpenReferenceFullBodyPoseGeometryEqualV4,
  modelOpenReferenceFullBodyPoseLinkArmsFromV4,
  modelOpenReferenceFullBodyPoseUnlinkArmsV4,
  modelOpenReferenceFullBodyPoseUpdateArmV4,
  modelOpenReferenceFullBodyPoseUpdateBodyV4,
} from './model-open-reference-full-body-pose-control-v4';

describe('model open-reference full-body pose control v4 contract', () => {
  it('updates both arms while linked and only the selected arm while independent', () => {
    const linked = modelOpenReferenceFullBodyPoseUpdateArmV4(
      MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
      'left',
      'shoulderRaiseDegrees',
      30,
    );
    expect(linked?.leftArm.shoulderRaiseDegrees).toBe(30);
    expect(linked?.rightArm.shoulderRaiseDegrees).toBe(30);

    const independent = modelOpenReferenceFullBodyPoseUnlinkArmsV4(linked!);
    const changed = modelOpenReferenceFullBodyPoseUpdateArmV4(
      independent,
      'right',
      'elbowBendDegrees',
      45,
    );
    expect(changed?.leftArm.elbowBendDegrees).toBe(0);
    expect(changed?.rightArm.elbowBendDegrees).toBe(45);
    expect(Object.isFrozen(changed)).toBe(true);
    expect(Object.isFrozen(changed?.leftArm)).toBe(true);
    expect(Object.isFrozen(changed?.rightArm)).toBe(true);
  });

  it('links explicitly from either selected side without averaging', () => {
    const independent = modelOpenReferenceFullBodyPoseUnlinkArmsV4(
      MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
    );
    const left = modelOpenReferenceFullBodyPoseUpdateArmV4(
      independent,
      'left',
      'wristBendDegrees',
      -10,
    )!;
    const asymmetric = modelOpenReferenceFullBodyPoseUpdateArmV4(
      left,
      'right',
      'wristBendDegrees',
      15,
    )!;

    expect(modelOpenReferenceFullBodyPoseLinkArmsFromV4(asymmetric, 'left')).toMatchObject({
      armMode: 'linked',
      leftArm: { wristBendDegrees: -10 },
      rightArm: { wristBendDegrees: -10 },
    });
    expect(modelOpenReferenceFullBodyPoseLinkArmsFromV4(asymmetric, 'right')).toMatchObject({
      armMode: 'linked',
      leftArm: { wristBendDegrees: 15 },
      rightArm: { wristBendDegrees: 15 },
    });
  });

  it('ignores editor mode for geometry equality and rejects invalid values', () => {
    const independent = modelOpenReferenceFullBodyPoseUnlinkArmsV4(
      MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
    );
    expect(
      modelOpenReferenceFullBodyPoseGeometryEqualV4(
        independent,
        MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
      ),
    ).toBe(true);
    expect(
      modelOpenReferenceFullBodyPoseUpdateBodyV4(independent, 'bodyFlexionDegrees', 20.5),
    ).toBeNull();
    expect(
      modelOpenReferenceFullBodyPoseUpdateArmV4(independent, 'left', 'shoulderRaiseDegrees', 61),
    ).toBeNull();
  });
});

describe('model open-reference full-body pose control v4 markup', () => {
  const callbacks = { onDraftChange: vi.fn(), onApply: vi.fn() };

  it('defaults to seven linked controls with explicit unlinking', () => {
    const html = renderToStaticMarkup(
      <ModelOpenReferenceFullBodyPoseControlV4
        {...callbacks}
        draftPose={MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4}
        appliedPose={null}
        status='idle'
      />,
    );
    expect(html.match(/type="range"/gu) ?? []).toHaveLength(7);
    expect(html).toContain('arms linked');
    expect(html).toContain('unlink arms');
    expect(html).toContain('aria-label="Linked arm raise"');
    expect(html).not.toContain('link from left');
  });

  it('renders eleven uniquely named controls and explicit relinking while independent', () => {
    const independent = modelOpenReferenceFullBodyPoseUnlinkArmsV4(
      MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
    );
    const html = renderToStaticMarkup(
      <ModelOpenReferenceFullBodyPoseControlV4
        {...callbacks}
        draftPose={independent}
        appliedPose={MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4}
        status='idle'
      />,
    );
    expect(html.match(/type="range"/gu) ?? []).toHaveLength(11);
    expect(html).toContain('arms independent');
    expect(html).toContain('aria-label="Left elbow bend"');
    expect(html).toContain('aria-label="Right elbow bend"');
    expect(html).toContain('link from left');
    expect(html).toContain('link from right');
    expect(html).not.toContain('pose pending');
  });
});
