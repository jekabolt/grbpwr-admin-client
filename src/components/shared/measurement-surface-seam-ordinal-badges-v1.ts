import * as THREE from 'three';

import type { MeasurementSurfacePatternPieceSeamV1 } from './measurement-watertight-surface-v1-stage';

type OrdinalSeam = Pick<
  MeasurementSurfacePatternPieceSeamV1,
  'seamId' | 'side' | 'operationSeam' | 'ordinalBadgeVisible'
>;

const WIDTH = 128;
const HEIGHT = 48;
const BADGE_HEIGHT = 0.023;

/** Creates at most the two side labels of the selected operation seam in one staging layer. */
export function createMeasurementSurfaceSeamOrdinalBadgeBuilderV1(
  createCanvas = () => document.createElement('canvas'),
) {
  let labelSeamKey: string | null = null;
  const sides = new Set<'A' | 'B'>();
  return (
    line: THREE.Line,
    seam: OrdinalSeam,
    exactPoints: readonly THREE.Vector3[],
    color: THREE.ColorRepresentation,
    background: string,
  ): THREE.Sprite | null => {
    const { operationSeam, side, seamId } = seam;
    if (
      !seam.ordinalBadgeVisible ||
      !operationSeam ||
      !Number.isSafeInteger(operationSeam.operationNumber) ||
      operationSeam.operationNumber < 1 ||
      !Number.isSafeInteger(operationSeam.ordinal) ||
      operationSeam.ordinal < 1 ||
      (side !== 'A' && side !== 'B') ||
      sides.has(side) ||
      exactPoints.length !== 2
    )
      return null;
    const key = JSON.stringify([operationSeam.operationNumber, seamId, operationSeam.ordinal]);
    if (labelSeamKey !== null && labelSeamKey !== key) return null;
    labelSeamKey = key;
    sides.add(side);

    const canvas = createCanvas();
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const ink = new THREE.Color(color).getStyle();
    const label = `${operationSeam.ordinal} ${side}`;
    context.fillStyle = background;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.lineWidth = 4;
    context.strokeStyle = ink;
    context.strokeRect(2, 2, WIDTH - 4, HEIGHT - 4);
    context.font = '700 30px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = ink;
    context.fillText(label, WIDTH / 2, HEIGHT / 2, WIDTH - 16);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      sizeAttenuation: false,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const badge = new THREE.Sprite(material);
    badge.position.copy(exactPoints[0]!).lerp(exactPoints[1]!, 0.5);
    badge.center.set(0.5, -0.2);
    badge.scale.set((BADGE_HEIGHT * WIDTH) / HEIGHT, BADGE_HEIGHT, 1);
    badge.renderOrder = 7;
    badge.raycast = () => {};
    badge.name = `pattern-piece-seam-ordinal:${seamId}:${side}`;
    badge.userData = { patternSeamOrdinalBadge: true, seamId, side, operationSeam };
    line.add(badge);
    return badge;
  };
}

export function disposeMeasurementSurfaceSeamOrdinalBadgeV1(badge: THREE.Sprite): void {
  if (badge.userData.patternSeamOrdinalBadge !== true || !badge.material.map) return;
  const texture = badge.material.map;
  badge.material.map = null;
  texture.dispose();
  badge.material.dispose();
}
