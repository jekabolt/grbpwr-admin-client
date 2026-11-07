import type { GarmentKind, PomCode } from './types';

export type SchematicLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: { x: number; y: number };
};

export type GarmentSchematic = {
  viewBox: string;
  outline: string[];
  lines: Partial<Record<PomCode, SchematicLine>>;
};

// Approved trousers drawing: size-chart-variants.html, variant Edit (`OUT2`, `G`, `GN`).
export const TROUSERS_OUTLINE = 'M118,108 L376,108 L408,655 L280,655 L247,302 L215,655 L87,655 Z';

const bottomLines: GarmentSchematic['lines'] = {
  waist: { x1: 118, y1: 118, x2: 376, y2: 118, label: { x: 70, y: 118 } },
  hip: { x1: 110, y1: 221, x2: 385, y2: 221, label: { x: 70, y: 221 } },
  'front-rise': { x1: 247, y1: 108, x2: 247, y2: 300, label: { x: 270, y: 205 } },
  'back-rise': { x1: 376, y1: 108, x2: 408, y2: 655, label: { x: 392, y: 280 } },
  thigh: { x1: 100, y1: 349, x2: 242, y2: 349, label: { x: 70, y: 349 } },
  knee: { x1: 94, y1: 494, x2: 230, y2: 494, label: { x: 64, y: 494 } },
  'leg-opening': { x1: 88, y1: 641, x2: 215, y2: 641, label: { x: 64, y: 630 } },
  inseam: { x1: 257, y1: 311, x2: 401, y2: 647, label: { x: 350, y: 478 } },
  outseam: { x1: 427, y1: 108, x2: 427, y2: 655, label: { x: 453, y: 382 } },
};

// Plain front tee/shirt in the same flat, straight-line language. Labels sit outside the body.
const topLines: GarmentSchematic['lines'] = {
  chest: { x1: 128, y1: 235, x2: 372, y2: 235, label: { x: 92, y: 235 } },
  waist: { x1: 146, y1: 355, x2: 354, y2: 355, label: { x: 110, y: 355 } },
  hem: { x1: 150, y1: 520, x2: 350, y2: 520, label: { x: 112, y: 520 } },
  'length-hps': { x1: 211, y1: 126, x2: 211, y2: 520, label: { x: 188, y: 330 } },
  'length-cb': { x1: 250, y1: 148, x2: 250, y2: 520, label: { x: 270, y: 330 } },
  'across-shoulder': { x1: 175, y1: 170, x2: 325, y2: 170, label: { x: 250, y: 105 } },
  shoulder: { x1: 210, y1: 128, x2: 145, y2: 165, label: { x: 125, y: 130 } },
  'neck-width': { x1: 210, y1: 128, x2: 290, y2: 128, label: { x: 250, y: 88 } },
  'neck-drop-front': { x1: 250, y1: 128, x2: 250, y2: 180, label: { x: 275, y: 155 } },
  'neck-drop-back': { x1: 290, y1: 128, x2: 290, y2: 148, label: { x: 315, y: 138 } },
  armhole: { x1: 145, y1: 165, x2: 128, y2: 260, label: { x: 88, y: 195 } },
  'sleeve-length': { x1: 145, y1: 165, x2: 45, y2: 315, label: { x: 42, y: 210 } },
  underarm: { x1: 128, y1: 260, x2: 80, y2: 330, label: { x: 48, y: 292 } },
  bicep: { x1: 95, y1: 230, x2: 145, y2: 265, label: { x: 58, y: 250 } },
  'sleeve-opening': { x1: 45, y1: 315, x2: 80, y2: 340, label: { x: 38, y: 350 } },
  'collar-length': { x1: 210, y1: 115, x2: 290, y2: 115, label: { x: 250, y: 70 } },
  'stand-height': { x1: 300, y1: 105, x2: 300, y2: 135, label: { x: 330, y: 105 } },
  'collar-point': { x1: 300, y1: 105, x2: 340, y2: 145, label: { x: 365, y: 120 } },
};

export const GARMENT_SCHEMATIC: Record<GarmentKind, GarmentSchematic> = {
  bottom: {
    viewBox: '40 90 440 590',
    outline: [TROUSERS_OUTLINE, 'M119,130 L377,130'],
    lines: bottomLines,
  },
  top: {
    viewBox: '0 50 500 500',
    outline: [
      'M210,128 L145,165 L45,315 L80,340 L128,260 L150,520 L350,520 L372,260 L420,340 L455,315 L355,165 L290,128 L270,160 L250,180 L230,160 Z',
      'M210,128 L230,142 L250,148 L270,142 L290,128',
    ],
    lines: topLines,
  },
};
