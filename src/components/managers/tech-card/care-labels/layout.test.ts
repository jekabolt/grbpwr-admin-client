import { describe, expect, it } from 'vitest';
import type { PathCmd } from '../assembly-print/paper';
import type { PartComposition } from './composition-resolver';
import { MOCKUP_A_BACK, MOCKUP_A_FACE, MOCKUP_PARTS } from './fixtures/mockup';
import {
  L,
  labelSize,
  seamDash,
  typesetABack,
  typesetAFace,
  typesetB,
  type CareSide,
} from './layout';
import { filePdf, planPrint, type PrintJob } from './pages';
import { PT_MM, type Shaper } from './text-outline';

const shaper: Shaper = {
  width(text, _lang, pt) {
    return [...text].length * 0.6 * pt * PT_MM;
  },
  run(text, _lang, pt, x = 0, y = 0) {
    const charW = 0.6 * pt * PT_MM;
    const glyphs: PathCmd[] = [];
    [...text].forEach((char, index) => {
      if (/\s/.test(char)) return;
      const x0 = x + index * charW;
      glyphs.push(
        ['M', x0, y],
        ['L', x0 + charW * 0.7, y],
        ['L', x0 + charW * 0.7, y - pt * PT_MM],
        ['L', x0, y - pt * PT_MM],
        ['Z'],
      );
    });
    return { widthMm: [...text].length * charW, glyphs };
  },
};

const blocking = (holes: CareSide['holes']) => holes.filter((entry) => entry.level === 'block');

describe('vertical care label layout', () => {
  it('fits the normal A face and back on 30 × 100 mm sides', () => {
    const face = typesetAFace(shaper, MOCKUP_A_FACE, 'top', 'vertical');
    const back = typesetABack(shaper, MOCKUP_A_BACK, 'bottom', 'vertical');

    expect(labelSize('vertical')).toEqual({ W: 30, H: 100 });
    expect([face.doc.w, face.doc.h, face.report.seam]).toEqual([30, 100, 'top']);
    expect([back.doc.w, back.doc.h, back.report.seam]).toEqual([30, 100, 'bottom']);
    expect(face.report.lines).toBeGreaterThan(0);
    expect(back.report.lines).toBeGreaterThan(3);
    expect(back.report.qrVersion).toBeGreaterThan(0);
    expect(blocking(face.holes)).toEqual([]);
    expect(blocking(back.holes)).toEqual([]);
  });

  it('fills both B sides and reports vertical click-target bounds', () => {
    const result = typesetB(shaper, MOCKUP_PARTS, 'duplex', 'vertical');
    const first = result.labels[0];

    expect(first.face.doc).toMatchObject({ w: 30, h: 100 });
    expect(first.back.doc).toMatchObject({ w: 30, h: 100 });
    expect(first.face.report.seam).toBe('top');
    expect(first.back.report.seam).toBe('bottom');
    expect(first.face.report.columns.length).toBeGreaterThan(0);
    expect(first.back.report.columns.length).toBeGreaterThan(0);
    expect(
      [...first.face.report.columns, ...first.back.report.columns].every(
        (column) => column.y !== undefined && column.h !== undefined && column.h > 0,
      ),
    ).toBe(true);
    expect(result.holes.filter((entry) => entry.level === 'block')).toEqual([]);
  });

  it('moves a composition block to the next side when the remaining height is too short', () => {
    const body = MOCKUP_PARTS.find((part) => part.part === 'BODY_LINING')!;
    const pocket = MOCKUP_PARTS.find((part) => part.part === 'POCKET_LINING')!;
    const shell = MOCKUP_PARTS.find((part) => part.part === 'SHELL')!;
    const longShell: PartComposition = {
      ...shell,
      rows: Object.fromEntries(
        Object.entries(shell.rows).map(([lang]) => [lang, '100% COTTON COTTON COTTON']),
      ) as PartComposition['rows'],
    };

    const result = typesetB(shaper, [body, pocket, longShell], 'duplex', 'vertical');
    const first = result.labels[0];

    expect(first.face.report.columns.map((column) => column.part)).toEqual([
      'BODY_LINING',
      'POCKET_LINING',
    ]);
    expect(first.back.report.columns.map((column) => column.part)).toEqual(['SHELL']);
  });

  it('returns a blocking hole when a B row cannot fit at the smallest point size', () => {
    const shell = MOCKUP_PARTS.find((part) => part.part === 'SHELL')!;
    const impossible: PartComposition = {
      ...shell,
      rows: Object.fromEntries(
        Object.entries(shell.rows).map(([lang]) => [lang, 'W'.repeat(100)]),
      ) as PartComposition['rows'],
    };

    const result = typesetB(shaper, [impossible], 'duplex', 'vertical');

    expect(result.holes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'part-too-wide', level: 'block', ref: { part: 'SHELL' } }),
      ]),
    );
  });

  it('threads vertical page dimensions into planned PDF files', () => {
    const job: PrintJob = {
      mode: 'duplex',
      orientation: 'vertical',
      care: MOCKUP_A_FACE.care,
      colorways: [
        {
          colorwayId: 7,
          folder: 'rc27-black',
          colour: MOCKUP_A_FACE.colour,
          country: MOCKUP_A_FACE.country,
          parts: [MOCKUP_PARTS[1]],
          sizes: [
            {
              sizeId: 3,
              label: MOCKUP_A_FACE.size,
              skuOrd: 6,
              sku: MOCKUP_A_FACE.sku,
              copies: 1,
              qrUrl: MOCKUP_A_BACK.url,
            },
          ],
        },
      ],
    };

    const set = planPrint(shaper, job);
    const file = set.files.find((entry) => entry.label === 'A')!;
    const pdf = new TextDecoder().decode(filePdf(set, file));

    expect(set.orientation).toBe('vertical');
    expect([...set.sides.values()].every((side) => side.side.doc.w === 30)).toBe(true);
    expect([...set.sides.values()].every((side) => side.side.doc.h === 100)).toBe(true);
    expect(pdf).toContain('/MediaBox [0 0 85.03937 283.464567]');
  });
});

describe('horizontal care label regression', () => {
  it('keeps the horizontal geometry snapshot', () => {
    const face = typesetAFace(shaper, MOCKUP_A_FACE);
    const back = typesetABack(shaper, MOCKUP_A_BACK);
    const composition = typesetB(shaper, MOCKUP_PARTS);
    const summary = (side: CareSide) => ({
      size: `${side.doc.w}x${side.doc.h}`,
      prims: side.doc.prims.length,
      kind: side.report.kind,
      seam: side.report.seam,
      pt: side.report.pt,
      lines: side.report.lines,
      empty: side.report.empty,
      qr: side.report.qrVersion,
      columns: side.report.columns.map(
        (column) => `${column.part}@${column.x.toFixed(3)}:${column.w.toFixed(3)}`,
      ),
      holes: side.holes.map((entry) => entry.code),
    });
    const dash = seamDash('right');

    expect({
      size: labelSize(),
      face: summary(face),
      back: summary(back),
      b: composition.labels.map((label) => ({
        face: summary(label.face),
        back: summary(label.back),
      })),
      holes: composition.holes.map((entry) => entry.code),
      seam:
        dash.k === 'path'
          ? { segments: dash.d.length / 2, first: dash.d[0], last: dash.d.at(-1), sw: dash.sw }
          : null,
      pointSize: L.PT,
    }).toMatchInlineSnapshot(`
      {
        "b": [
          {
            "back": {
              "columns": [
                "SLEEVE_LINING@22.589:26.628",
                "POCKET_LINING@56.917:13.764",
                "TRIM@78.380:18.711",
              ],
              "empty": false,
              "holes": [],
              "kind": "B-back",
              "lines": 10,
              "prims": 44,
              "pt": 4.25,
              "qr": undefined,
              "seam": "left",
              "size": "100x30",
            },
            "face": {
              "columns": [
                "SHELL@11.389:38.502",
                "BODY_LINING@56.391:13.764",
              ],
              "empty": false,
              "holes": [],
              "kind": "B-face",
              "lines": 10,
              "prims": 33,
              "pt": 4.25,
              "qr": undefined,
              "seam": "right",
              "size": "100x30",
            },
          },
        ],
        "back": {
          "columns": [],
          "empty": false,
          "holes": [],
          "kind": "A-back",
          "lines": 3,
          "prims": 227,
          "pt": 4.25,
          "qr": 3,
          "seam": "left",
          "size": "100x30",
        },
        "face": {
          "columns": [],
          "empty": false,
          "holes": [],
          "kind": "A-face",
          "lines": 3,
          "prims": 26,
          "pt": 4.25,
          "qr": undefined,
          "seam": "right",
          "size": "100x30",
        },
        "holes": [],
        "pointSize": 4.25,
        "seam": {
          "first": [
            "M",
            90,
            0,
          ],
          "last": [
            "L",
            90,
            29,
          ],
          "segments": 15,
          "sw": 0.15,
        },
        "size": {
          "H": 30,
          "W": 100,
        },
      }
    `);
  });
});
