import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { paperSvgString } from '../assembly-print/paper-svg';
import { MOCKUP_A_BACK, MOCKUP_A_FACE, MOCKUP_PARTS } from './fixtures/mockup';
import { typesetABack, typesetAFace, typesetB, type CareSide, type Seam } from './layout';
import { shaperFromBytes } from './text-outline';

const fontBytes = (name: string): ArrayBuffer => {
  const bytes = readFileSync(resolve(process.cwd(), 'src/fonts', name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const seamBox = (side: CareSide): { x: number; y: number; w: number; h: number } => {
  const { w, h } = side.doc;
  const boxes: Record<Seam, { x: number; y: number; w: number; h: number }> = {
    left: { x: 0, y: 0, w: 10, h },
    right: { x: w - 10, y: 0, w: 10, h },
    top: { x: 0, y: 0, w, h: 10 },
    bottom: { x: 0, y: h - 10, w, h: 10 },
  };
  return boxes[side.report.seam];
};

/** Adds the paper outline and screen-only seam hatch around the engine SVG. */
const previewSvg = (side: CareSide): string => {
  const raw = paperSvgString(side.doc);
  const seam = seamBox(side);
  const overlay =
    '<defs><pattern id="seam-hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<line x1="0" y1="0" x2="0" y2="2" stroke="#ccc" stroke-width="0.25"></line>' +
    '</pattern></defs>' +
    `<rect x="${seam.x}" y="${seam.y}" width="${seam.w}" height="${seam.h}" fill="url(#seam-hatch)"></rect>` +
    `<rect x="0.075" y="0.075" width="${side.doc.w - 0.15}" height="${side.doc.h - 0.15}" fill="none" stroke="#666" stroke-width="0.15"></rect>`;
  return raw.replace('</svg>', `${overlay}</svg>`);
};

describe('care label owner previews', () => {
  it('renders vertical and horizontal A/B comparison SVGs', async () => {
    const shaper = await shaperFromBytes({
      latin: fontBytes('FeatureMono-Regular.ttf'),
      sc: fontBytes('NotoSansSC-care.otf'),
      jp: fontBytes('NotoSansJP-care.otf'),
    });
    const verticalB = typesetB(shaper, MOCKUP_PARTS, 'duplex', 'vertical').labels[0];
    const horizontalB = typesetB(shaper, MOCKUP_PARTS).labels[0];
    const sides: Record<string, CareSide> = {
      'A-face.svg': typesetAFace(shaper, MOCKUP_A_FACE, 'top', 'vertical'),
      'A-back.svg': typesetABack(shaper, MOCKUP_A_BACK, 'bottom', 'vertical'),
      'B-face.svg': verticalB.face,
      'B-back.svg': verticalB.back,
      'H-A-face.svg': typesetAFace(shaper, MOCKUP_A_FACE),
      'H-A-back.svg': typesetABack(shaper, MOCKUP_A_BACK),
      'H-B-face.svg': horizontalB.face,
      'H-B-back.svg': horizontalB.back,
    };

    const rendered = Object.fromEntries(
      Object.entries(sides).map(([name, side]) => [name, previewSvg(side)]),
    );
    expect(Object.keys(rendered)).toHaveLength(8);
    expect(rendered['A-face.svg']).toContain('width="30mm" height="100mm"');
    expect(rendered['H-A-face.svg']).toContain('width="100mm" height="30mm"');
    expect(Object.values(rendered).every((svg) => svg.includes('seam-hatch'))).toBe(true);

    const outputDir = process.env.CARE_LABEL_PREVIEW_DIR?.trim();
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      Object.entries(rendered).forEach(([name, svg]) =>
        writeFileSync(resolve(outputDir, name), svg),
      );
    }
  });
});
