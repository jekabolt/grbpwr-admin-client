import { describe, expect, it } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';

import {
  MEASUREMENT_SURFACE_JOINT_MARKER_COARSE_HIT_DIAMETER_CSS_PX_V9,
  MEASUREMENT_SURFACE_JOINT_MARKER_HIT_DIAMETER_CSS_PX_V1,
  MEASUREMENT_SURFACE_PATTERN_PIECE_PROJECTED_HIT_RECEIPT_V1,
  measurementSurfaceExpandRotationPickerV9,
  measurementSurfaceJointEditorEffectiveEditModeV1,
  measurementSurfaceJointGroupsSignatureV1,
  measurementSurfaceJointGroupsTopologyMatchesV10,
  measurementSurfaceJointMarkerHitDiameterV9,
  measurementSurfaceJointPointerOwnerV9,
  measurementSurfaceRotationGizmoOwnsPointerV10,
  measurementSurfaceLiveJointOverlayDatasetV10,
  measurementSurfaceMeasurementGuideDatasetV1,
  measurementSurfaceNearestJointMarkerV1,
  measurementSurfaceOrbitControlsEnabledV2,
  measurementSurfacePatternPieceTransformReceiptV1,
  measurementSurfaceRestoreCameraV10,
  pickMeasurementSurfaceAcceptedClothPieceV1,
  updateMeasurementSurfaceAcceptedClothStrainV1,
  measurementSurfaceRotationGizmoMatrixV6,
  measurementSurfaceRotationGizmoSignatureV6,
  measurementSurfaceSelectedJointOcclusionSamplesV10,
  measurementSurfaceSelectedJointVisibilityV10,
  measurementSurfaceSnapshotCameraV10,
  measurementSurfaceTransformControlsPointerAdapterV6,
  validateMeasurementSurfacePatternPieceProjectedHitReceiptV1,
  validateMeasurementSurfacePatternPieceTransformReceiptV1,
  type MeasurementSurfacePatternPieceOverlayV1,
  type MeasurementSurfaceAcceptedClothV1,
} from './measurement-watertight-surface-v1-stage';

it('applies accepted-frame signed color without replacing positions, triangle groups or materials', () => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(27);
  const position = new BufferAttribute(positions, 3);
  geometry.setAttribute('position', position);
  geometry.addGroup(0, 9, 0);
  const material = new MeshStandardMaterial({ color: 0x405060 });
  const mesh = new Mesh(geometry, [material]);
  let active = true;
  const cloth: MeasurementSurfaceAcceptedClothV1 = {
    positionsM: positions,
    frameNumber: 29,
    ranges: [{ triangleOffset: 0, triangleCount: 3, color: 0x405060 }],
    isCurrent: () => active,
  };
  const overlay = {
    frameNumber: 29,
    positionsM: positions,
    valuesInDrawOrder: Float32Array.of(-0.5, 0, 0.8),
  };

  expect(updateMeasurementSurfaceAcceptedClothStrainV1(mesh, cloth)).toBe(false);
  expect(geometry.getAttribute('color')).toBeUndefined();
  expect(
    updateMeasurementSurfaceAcceptedClothStrainV1(mesh, { ...cloth, principalStrain: overlay }),
  ).toBe(true);
  const colors = geometry.getAttribute('color');
  const rgb = (i: number) =>
    new Color(colors.getX(i), colors.getY(i), colors.getZ(i)).getHexString();
  expect(Array.from({ length: 9 }, (_, i) => rgb(i))).toEqual([
    '2166ac',
    '2166ac',
    '2166ac',
    'f3f4f6',
    'f3f4f6',
    'f3f4f6',
    'b2182b',
    'b2182b',
    'b2182b',
  ]);
  expect(mesh.geometry).toBe(geometry);
  expect(geometry.getAttribute('position')).toBe(position);
  expect(geometry.groups).toEqual([{ start: 0, count: 9, materialIndex: 0 }]);
  expect(mesh.material[0]).toBe(material);
  expect(material.vertexColors).toBe(true);
  expect(material.color.getHex()).toBe(0xffffff);

  for (const invalid of [
    { ...overlay, frameNumber: 28 },
    { ...overlay, positionsM: positions.slice() },
    { ...overlay, valuesInDrawOrder: Float32Array.of(0, 0) },
    { ...overlay, valuesInDrawOrder: Float32Array.of(0, NaN, 0) },
  ]) {
    expect(
      updateMeasurementSurfaceAcceptedClothStrainV1(mesh, { ...cloth, principalStrain: invalid }),
    ).toBe(false);
    expect(material.vertexColors).toBe(false);
    expect(material.color.getHex()).toBe(0x405060);
  }
  expect(
    updateMeasurementSurfaceAcceptedClothStrainV1(mesh, { ...cloth, principalStrain: overlay }),
  ).toBe(true);
  expect(geometry.getAttribute('color')).toBe(colors);
  active = false;
  expect(
    updateMeasurementSurfaceAcceptedClothStrainV1(mesh, { ...cloth, principalStrain: overlay }),
  ).toBe(false);
  expect(material.vertexColors).toBe(false);
  expect(material.color.getHex()).toBe(0x405060);
});

it('uses the existing visible accepted cloth triangle ranges and rejects occluded or revoked hits', () => {
  const first = {
    row: {
      techCardId: 11,
      scopeKey: 'main',
      patternLineKey: 'saved-front',
      revision: 1,
      cardLockVersion: 7,
      url: 'https://saved.example/fixture.dxf',
      sizeBytes: 100,
      sha256: 'a'.repeat(64),
    },
    sizeToken: 'M',
    pieceId: 'front',
    pieceLineKey: 'native-front',
    sourceInstancePath: ['insert-a'],
  };
  const second = { ...first, pieceLineKey: 'native-back', sourceInstancePath: ['insert-b'] };
  const positionsM = new Float32Array([-2, -1, 0, 0, -1, 0, -1, 1, 0, 0, -1, 0, 2, -1, 0, 1, 1, 0]);
  const clothGeometry = new BufferGeometry();
  clothGeometry.setAttribute('position', new BufferAttribute(positionsM, 3));
  clothGeometry.addGroup(0, 3, 0);
  clothGeometry.addGroup(3, 3, 1);
  const cloth = new Mesh(clothGeometry, [new MeshBasicMaterial(), new MeshBasicMaterial()]);
  const bodyGeometry = new BufferGeometry();
  bodyGeometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-2, -1, 1, 0, -1, 1, -1, 1, 1]), 3),
  );
  const body = new Mesh(bodyGeometry, new MeshBasicMaterial());
  const camera = new PerspectiveCamera(60, 1, 0.01, 100);
  camera.position.set(0, 0, 5);
  camera.updateMatrixWorld();
  const ray = (x: number) => {
    const p = new Vector3(x, 0, 0).project(camera);
    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(p.x, p.y), camera);
    return raycaster;
  };
  let current = true;
  const accepted: MeasurementSurfaceAcceptedClothV1 = {
    positionsM,
    frameNumber: 32,
    ranges: [
      { triangleOffset: 0, triangleCount: 1, color: 0, sourcePiece: first },
      { triangleOffset: 1, triangleCount: 1, color: 0, sourcePiece: second },
    ],
    isCurrent: () => current,
  };
  expect(pickMeasurementSurfaceAcceptedClothPieceV1(ray(-1), cloth, null, accepted)).toBe(first);
  expect(pickMeasurementSurfaceAcceptedClothPieceV1(ray(1), cloth, body, accepted)).toBe(second);
  expect(pickMeasurementSurfaceAcceptedClothPieceV1(ray(-1), cloth, body, accepted)).toBeNull();
  expect(
    pickMeasurementSurfaceAcceptedClothPieceV1(ray(1), cloth, body, {
      ...accepted,
      ranges: [accepted.ranges[0], { triangleOffset: 1, triangleCount: 1, color: 0 }],
    }),
  ).toBeNull();
  current = false;
  expect(pickMeasurementSurfaceAcceptedClothPieceV1(ray(1), cloth, body, accepted)).toBeNull();
  clothGeometry.dispose();
  cloth.material.forEach((material) => material.dispose());
  bodyGeometry.dispose();
  body.material.dispose();
});

describe('measurement surface active guide dataset v1', () => {
  it('publishes an explicit visual-only receipt and an off state', () => {
    expect(measurementSurfaceMeasurementGuideDatasetV1(undefined)).toEqual({
      activeMeasurement: '',
      status: 'off',
      pathCount: 0,
      visualGuideOnly: false,
    });
    expect(
      measurementSurfaceMeasurementGuideDatasetV1({
        version: 'measurement-surface-active-measurement-guide/v1',
        measurementName: 'BODY_MEASUREMENT_NAME_CHEST',
        label: 'chest',
        status: 'visible',
        paths: [
          {
            id: 'chest',
            closed: true,
            source: 'mesh-vertices',
            vertexIndices: [0, 1, 2],
          },
        ],
        claims: {
          visualGuideOnly: true,
          measurementProtocolEquivalent: false,
          fitClaimEligible: false,
        },
      }),
    ).toEqual({
      activeMeasurement: 'BODY_MEASUREMENT_NAME_CHEST',
      status: 'visible',
      pathCount: 1,
      visualGuideOnly: true,
    });
  });
});

describe('measurement surface live joint overlay dataset v10', () => {
  it('keeps marker hit targets when a live frame preserves group topology', () => {
    const groups = [
      {
        id: 'right-elbow',
        label: 'Right elbow',
        headM: [0, 1, 0] as const,
        tailM: [0, 0, 0] as const,
      },
      {
        id: 'right-wrist',
        label: 'Right wrist',
        headM: [1, 1, 0] as const,
        tailM: [1, 0, 0] as const,
      },
    ];
    expect(
      measurementSurfaceJointGroupsTopologyMatchesV10(['right-elbow', 'right-wrist'], groups),
    ).toBe(true);
    expect(measurementSurfaceJointGroupsTopologyMatchesV10(['right-elbow'], groups)).toBe(false);
  });

  it('publishes deterministic off, applied, and updated acceptance states', () => {
    expect(measurementSurfaceLiveJointOverlayDatasetV10(undefined)).toEqual({
      status: 'off',
      signature: '',
    });
    const editor = {
      mode: 'edit-pose' as const,
      groups: [],
      selectedGroupId: 'right-wrist',
      selectedChannel: 'wristBendDeg',
      overlayStatus: 'ready' as const,
      liveOverlayStatus: 'applied' as const,
      liveOverlaySignature: 'applied:revision-1',
      onSelectGroup: () => undefined,
    };
    expect(measurementSurfaceLiveJointOverlayDatasetV10(editor)).toEqual({
      status: 'applied',
      signature: 'applied:revision-1',
    });
    expect(
      measurementSurfaceLiveJointOverlayDatasetV10({
        ...editor,
        liveOverlayStatus: 'updated',
        liveOverlaySignature: 'live:frame-2',
      }),
    ).toEqual({ status: 'updated', signature: 'live:frame-2' });
  });
});

describe('measurement surface retained camera v10', () => {
  it('restores orbit direction, zoom, pan, up, and the selected preset across resized bodies', () => {
    const state = measurementSurfaceSnapshotCameraV10({
      positionM: [2, 1.5, -3],
      targetM: [0.2, 1, 0.1],
      centerM: [0, 0.8, 0],
      up: [0, 1, 0],
      radiusM: 1,
      viewPreset: 'back',
    });
    const restored = measurementSurfaceRestoreCameraV10({
      state,
      centerM: [0, 1.6, 0],
      radiusM: 2,
    });

    expect(restored.targetM).toEqual([0.4, 2, 0.2]);
    expect(
      new Vector3(...restored.positionM).distanceTo(new Vector3(...restored.targetM)),
    ).toBeCloseTo(new Vector3(2, 1.5, -3).distanceTo(new Vector3(0.2, 1, 0.1)) * 2, 12);
    expect(state.viewPreset).toBe('back');
    expect(restored.up).toEqual([0, 1, 0]);
  });

  it('rejects degenerate camera snapshots', () => {
    expect(() =>
      measurementSurfaceSnapshotCameraV10({
        positionM: [0, 0, 0],
        targetM: [0, 0, 0],
        centerM: [0, 0, 0],
        up: [0, 1, 0],
        radiusM: 1,
        viewPreset: 'front',
      }),
    ).toThrow(/non-degenerate/);
  });
});

describe('measurement surface selected-joint occlusion v10', () => {
  it('samples the parent chain and distal tail instead of only the selected pivot', () => {
    const samples = measurementSurfaceSelectedJointOcclusionSamplesV10(
      [
        {
          id: 'right-elbow',
          label: 'Right elbow',
          headM: [0, 1, 0],
          tailM: [0, 0.8, 0],
        },
        {
          id: 'right-wrist',
          label: 'Right wrist',
          headM: [0, 0.6, 0],
          tailM: [0, 0.5, 0.1],
        },
      ],
      'right-wrist',
    );

    expect(samples).toEqual([
      [0, 0.9, 0],
      [0, 0.8, 0],
      [0, 0.7, 0],
      [0, 0.6, 0],
      [0, 0.5, 0.1],
    ]);
  });

  it('ghosts a distal joint only when another surface materially precedes its own skin', () => {
    expect(
      measurementSurfaceSelectedJointVisibilityV10({
        groupId: 'right-wrist',
        markerDistanceM: 2,
        nearestSurfaceDistanceM: 1.72,
        bodyRadiusM: 1,
      }),
    ).toBe('occluded');
    expect(
      measurementSurfaceSelectedJointVisibilityV10({
        groupId: 'right-wrist',
        markerDistanceM: 2,
        nearestSurfaceDistanceM: 1.91,
        bodyRadiusM: 1,
      }),
    ).toBe('visible');
    expect(
      measurementSurfaceSelectedJointVisibilityV10({
        groupId: 'torso-group',
        markerDistanceM: 2,
        nearestSurfaceDistanceM: 1.6,
        bodyRadiusM: 1,
      }),
    ).toBe('visible');
    expect(
      measurementSurfaceSelectedJointVisibilityV10({
        groupId: null,
        markerDistanceM: 2,
        nearestSurfaceDistanceM: 1.6,
        bodyRadiusM: 1,
      }),
    ).toBe('none');
  });
});

describe('measurement watertight surface joint marker hit target', () => {
  it('keeps an unrelated rotation ring from stealing another joint position target', () => {
    expect(
      measurementSurfaceRotationGizmoOwnsPointerV10({
        rotationGizmoHit: true,
        projectedMarkerId: 'left-wrist',
        selectedGroupId: 'left-shoulder-group',
      }),
    ).toBe(false);
    expect(
      measurementSurfaceRotationGizmoOwnsPointerV10({
        rotationGizmoHit: true,
        projectedMarkerId: 'left-shoulder-group',
        selectedGroupId: 'left-shoulder-group',
      }),
    ).toBe(true);
    expect(
      measurementSurfaceRotationGizmoOwnsPointerV10({
        rotationGizmoHit: true,
        projectedMarkerId: null,
        selectedGroupId: 'left-shoulder-group',
      }),
    ).toBe(true);
  });

  it('selects the nearest marker within a 56 CSS pixel target and rejects outside clicks', () => {
    expect(MEASUREMENT_SURFACE_JOINT_MARKER_HIT_DIAMETER_CSS_PX_V1).toBe(56);
    const markers = [
      { id: 'left-elbow', screenX: 100, screenY: 100 },
      { id: 'left-wrist', screenX: 112, screenY: 100 },
    ] as const;

    expect(measurementSurfaceNearestJointMarkerV1({ pointerX: 110, pointerY: 100, markers })).toBe(
      'left-wrist',
    );
    expect(
      measurementSurfaceNearestJointMarkerV1({ pointerX: 140.01, pointerY: 100, markers }),
    ).toBeNull();
  });

  it('resolves an exact overlap by stable canonical group order', () => {
    const markers = [
      { id: 'left-elbow', screenX: 100, screenY: 100 },
      { id: 'left-wrist', screenX: 100, screenY: 100 },
    ] as const;

    expect(measurementSurfaceNearestJointMarkerV1({ pointerX: 100, pointerY: 100, markers })).toBe(
      'left-elbow',
    );
  });

  it('uses exact 56px mouse and 64px coarse pointer boundaries', () => {
    expect(measurementSurfaceJointMarkerHitDiameterV9(false)).toBe(56);
    expect(measurementSurfaceJointMarkerHitDiameterV9(true)).toBe(64);
    expect(MEASUREMENT_SURFACE_JOINT_MARKER_COARSE_HIT_DIAMETER_CSS_PX_V9).toBe(64);
    const markers = [{ id: 'head-group', screenX: 100, screenY: 100 }] as const;
    expect(
      measurementSurfaceNearestJointMarkerV1({ pointerX: 127.9, pointerY: 100, markers }),
    ).toBe('head-group');
    expect(
      measurementSurfaceNearestJointMarkerV1({ pointerX: 128.1, pointerY: 100, markers }),
    ).toBeNull();
    expect(
      measurementSurfaceNearestJointMarkerV1({
        pointerX: 131.9,
        pointerY: 100,
        markers,
        hitDiameterCssPx: 64,
      }),
    ).toBe('head-group');
    expect(
      measurementSurfaceNearestJointMarkerV1({
        pointerX: 132.1,
        pointerY: 100,
        markers,
        hitDiameterCssPx: 64,
      }),
    ).toBeNull();
    expect(() =>
      measurementSurfaceNearestJointMarkerV1({
        pointerX: 100,
        pointerY: 100,
        markers,
        hitDiameterCssPx: 0,
      }),
    ).toThrow(/positive and finite/);
  });

  it('gives an actual ring-axis hit priority without shrinking direct joint marker targets', () => {
    expect(
      measurementSurfaceJointPointerOwnerV9({
        button: 0,
        selectedMarkerId: 'head-group',
        markerHasPositionTarget: true,
        rotationGizmoAvailable: true,
        rotationGizmoHit: true,
      }),
    ).toBe('rotation-gizmo');
    expect(
      measurementSurfaceJointPointerOwnerV9({
        button: 0,
        selectedMarkerId: 'head-group',
        markerHasPositionTarget: true,
        rotationGizmoAvailable: true,
        rotationGizmoHit: false,
      }),
    ).toBe('position-drag');
    expect(
      measurementSurfaceJointPointerOwnerV9({
        button: 0,
        selectedMarkerId: 'left-knee',
        markerHasPositionTarget: false,
        rotationGizmoAvailable: true,
      }),
    ).toBe('marker-selection');
    expect(
      measurementSurfaceJointPointerOwnerV9({
        button: 0,
        selectedMarkerId: null,
        markerHasPositionTarget: false,
        rotationGizmoAvailable: true,
      }),
    ).toBe('rotation-gizmo');
    expect(
      measurementSurfaceJointPointerOwnerV9({
        button: 0,
        selectedMarkerId: null,
        markerHasPositionTarget: false,
        rotationGizmoAvailable: false,
      }),
    ).toBe('camera');
  });
});

describe('measurement watertight surface joint editor state', () => {
  const editor = {
    mode: 'edit-pose' as const,
    groups: [],
    selectedGroupId: 'torso-group',
    selectedChannel: 'torsoForwardDeg',
    overlayStatus: 'ready' as const,
    onSelectGroup: () => undefined,
  };

  it('admits edit mode only when the overlay is ready', () => {
    expect(measurementSurfaceJointEditorEffectiveEditModeV1(editor)).toBe(true);
    expect(
      measurementSurfaceJointEditorEffectiveEditModeV1({
        ...editor,
        overlayStatus: 'unavailable',
      }),
    ).toBe(false);
    expect(measurementSurfaceJointEditorEffectiveEditModeV1({ ...editor, mode: 'camera' })).toBe(
      false,
    );
    expect(measurementSurfaceJointEditorEffectiveEditModeV1(undefined)).toBe(false);
  });

  it('keeps orbit available on empty canvas only for the unified interaction contract', () => {
    expect(
      measurementSurfaceOrbitControlsEnabledV2({
        interactive: true,
        editor,
        unifiedJointInteraction: false,
      }),
    ).toBe(false);
    expect(
      measurementSurfaceOrbitControlsEnabledV2({
        interactive: true,
        editor,
        unifiedJointInteraction: true,
      }),
    ).toBe(true);
    expect(
      measurementSurfaceOrbitControlsEnabledV2({
        interactive: false,
        editor,
        unifiedJointInteraction: true,
      }),
    ).toBe(false);
  });

  it('invalidates the marker layer signature when posed endpoints move', () => {
    const groups = [
      {
        id: 'left-elbow',
        label: 'Left elbow',
        headM: [0, 1, 0] as const,
        tailM: [0, 0.8, 0] as const,
      },
    ] as const;
    const initial = measurementSurfaceJointGroupsSignatureV1(groups);

    expect(
      measurementSurfaceJointGroupsSignatureV1([{ ...groups[0], headM: [0.1, 1, 0] as const }]),
    ).not.toBe(initial);
    expect(
      measurementSurfaceJointGroupsSignatureV1([{ ...groups[0], tailM: [0.1, 0.8, 0] as const }]),
    ).not.toBe(initial);
    expect(measurementSurfaceJointGroupsSignatureV1([...groups])).toBe(initial);
  });
});

describe('measurement surface rotation gizmo v6 contract', () => {
  const gizmo = {
    revision: 'body-a:left-elbow:x',
    pivotM: [0.25, 1.1, 0] as const,
    localToWorld: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const,
    axis: 'x' as const,
    onStart: () => undefined,
    onMove: () => undefined,
    onFinish: () => undefined,
  };

  it('invalidates the binding for body, frame, pivot or selected-axis changes', () => {
    const initial = measurementSurfaceRotationGizmoSignatureV6(gizmo);
    expect(measurementSurfaceRotationGizmoSignatureV6({ ...gizmo })).toBe(initial);
    expect(measurementSurfaceRotationGizmoSignatureV6({ ...gizmo, revision: 'body-b' })).not.toBe(
      initial,
    );
    expect(measurementSurfaceRotationGizmoSignatureV6({ ...gizmo, axis: 'z' })).not.toBe(initial);
    expect(
      measurementSurfaceRotationGizmoSignatureV6({ ...gizmo, pivotM: [0.3, 1.1, 0] }),
    ).not.toBe(initial);
    expect(
      measurementSurfaceRotationGizmoSignatureV6({
        ...gizmo,
        localToWorld: [0, -1, 0, 1, 0, 0, 0, 0, 1],
      }),
    ).not.toBe(initial);
    expect(measurementSurfaceRotationGizmoSignatureV6(undefined)).toBe('');
  });

  it('converts the row-major local frame without transposing its rotation', () => {
    const matrix = measurementSurfaceRotationGizmoMatrixV6([0, -1, 0, 1, 0, 0, 0, 0, 1]);
    const rotated = new Vector3(1, 0, 0).applyMatrix4(matrix);
    expect(rotated.x).toBeCloseTo(0, 12);
    expect(rotated.y).toBeCloseTo(1, 12);
    expect(rotated.z).toBeCloseTo(0, 12);
    expect(() =>
      measurementSurfaceRotationGizmoMatrixV6([Number.NaN, 0, 0, 0, 1, 0, 0, 0, 1]),
    ).toThrow(/finite/);
  });

  it('fails soft when the pinned TransformControls pointer API is unavailable', () => {
    expect(measurementSurfaceTransformControlsPointerAdapterV6({})).toBeNull();
    let moved = 0;
    const runtime = {
      axis: 'X',
      rotationAngle: Math.PI / 4,
      pointerHover: () => undefined,
      pointerDown: () => undefined,
      pointerMove: () => {
        moved += 1;
      },
      pointerUp: () => undefined,
    };
    const adapter = measurementSurfaceTransformControlsPointerAdapterV6(runtime);
    adapter?.move({ x: 0.2, y: -0.1, button: -1 });
    expect(moved).toBe(1);
    expect(adapter?.rotationAngle()).toBe(Math.PI / 4);
    expect(adapter?.activeAxis()).toBe('X');
    runtime.rotationAngle = Number.NaN;
    runtime.axis = '';
    expect(adapter?.rotationAngle()).toBe(0);
    expect(adapter?.activeAxis()).toBe('');
  });

  it('widens only the invisible rotate picker geometry', () => {
    const rotate = new Group();
    const material = new MeshBasicMaterial();
    const ring = new Mesh(new TorusGeometry(0.5, 0.1, 4, 24), material);
    rotate.add(ring);
    const replacements = measurementSurfaceExpandRotationPickerV9({
      _gizmo: { picker: { rotate } },
    });

    expect(replacements).toBe(1);
    expect((ring.geometry as TorusGeometry).parameters.radius).toBe(0.5);
    expect((ring.geometry as TorusGeometry).parameters.tube).toBe(0.18);

    ring.geometry.dispose();
    material.dispose();
  });
});

describe('measurement surface pattern-piece canvas acceptance receipts v1', () => {
  const overlay = (options?: {
    readonly backOffset?: readonly [number, number, number];
    readonly backRotation?: number;
  }): MeasurementSurfacePatternPieceOverlayV1 => ({
    revision: 'exact-overlay:7',
    tool: 'select',
    visibility: { pieces: true, edges: true, seams: true, pins: false, thread: true },
    pieces: [
      {
        pieceKey: 'scope:FRONT',
        scopeKey: 'scope',
        pieceId: 'FRONT',
        pieceLineKey: 'front-line',
        lane: 'left',
        laneIndex: 0,
        contours: [],
        selected: true,
        swatchCss: null,
        transform: null,
        seams: [],
      },
      {
        pieceKey: 'scope:BACK',
        scopeKey: 'scope',
        pieceId: 'BACK',
        pieceLineKey: 'back-line',
        lane: 'right',
        laneIndex: 0,
        contours: [],
        selected: false,
        swatchCss: null,
        transform: {
          offsetM: options?.backOffset ?? [0, 0, 0],
          rotationRad: options?.backRotation ?? 0,
        },
        seams: [],
      },
    ],
  });

  it('publishes only caller-owned transforms and changes their revision after completed updates', () => {
    const initial = measurementSurfacePatternPieceTransformReceiptV1(overlay());
    const moved = measurementSurfacePatternPieceTransformReceiptV1(
      overlay({ backOffset: [0.2, -0.1, 0] }),
    );
    const rotated = measurementSurfacePatternPieceTransformReceiptV1(
      overlay({ backOffset: [0.2, -0.1, 0], backRotation: Math.PI / 5 }),
    );

    expect(initial?.source).toBe('caller-owned-overlay-props');
    expect(initial?.transforms.map(({ pieceId }) => pieceId)).toEqual(['BACK', 'FRONT']);
    expect(moved?.transformRevision).not.toBe(initial?.transformRevision);
    expect(rotated?.transformRevision).not.toBe(moved?.transformRevision);
    expect(
      validateMeasurementSurfacePatternPieceTransformReceiptV1(rotated, 'exact-overlay:7'),
    ).toEqual(rotated);
    expect(
      validateMeasurementSurfacePatternPieceTransformReceiptV1(rotated, 'stale-overlay:6'),
    ).toBeNull();
    expect(
      validateMeasurementSurfacePatternPieceTransformReceiptV1(
        rotated && { ...rotated, transforms: [rotated.transforms[0], rotated.transforms[0]] },
        'exact-overlay:7',
      ),
    ).toBeNull();
    expect(
      validateMeasurementSurfacePatternPieceTransformReceiptV1(
        rotated && {
          ...rotated,
          transforms: [{ ...rotated.transforms[0], rotationRad: Number.POSITIVE_INFINITY }],
        },
        'exact-overlay:7',
      ),
    ).toBeNull();
    expect(
      measurementSurfacePatternPieceTransformReceiptV1(overlay({ backOffset: [Number.NaN, 0, 0] })),
    ).toBeNull();
  });

  it('fails closed for stale, non-finite, unclamped, or duplicate projected targets', () => {
    const receipt = {
      schemaVersion: MEASUREMENT_SURFACE_PATTERN_PIECE_PROJECTED_HIT_RECEIPT_V1,
      overlayRevision: 'exact-overlay:7',
      renderRevision: 14,
      viewport: { width: 960, height: 640 },
      targets: [
        { pieceKey: 'scope:FRONT', pieceId: 'FRONT', x: 0.2, y: 0.4 },
        { pieceKey: 'scope:BACK', pieceId: 'BACK', x: 0.8, y: 0.4 },
      ],
    };

    expect(
      validateMeasurementSurfacePatternPieceProjectedHitReceiptV1(receipt, {
        overlayRevision: 'exact-overlay:7',
        renderRevision: 14,
      }),
    ).toEqual(receipt);
    expect(
      validateMeasurementSurfacePatternPieceProjectedHitReceiptV1(receipt, {
        overlayRevision: 'stale-overlay:6',
      }),
    ).toBeNull();
    expect(
      validateMeasurementSurfacePatternPieceProjectedHitReceiptV1(receipt, {
        overlayRevision: 'exact-overlay:7',
        renderRevision: 15,
      }),
    ).toBeNull();
    expect(
      validateMeasurementSurfacePatternPieceProjectedHitReceiptV1(
        { ...receipt, targets: [{ ...receipt.targets[0], x: 1.001 }] },
        { overlayRevision: 'exact-overlay:7' },
      ),
    ).toBeNull();
    expect(
      validateMeasurementSurfacePatternPieceProjectedHitReceiptV1(
        { ...receipt, viewport: { width: Number.NaN, height: 640 } },
        { overlayRevision: 'exact-overlay:7' },
      ),
    ).toBeNull();
    expect(
      validateMeasurementSurfacePatternPieceProjectedHitReceiptV1(
        { ...receipt, targets: [receipt.targets[0], receipt.targets[0]] },
        { overlayRevision: 'exact-overlay:7' },
      ),
    ).toBeNull();
  });
});
