// Byte-for-byte guard of today's care label PDFs (wave «teams», W2 §5.4). Pinned BEFORE the team
// brand reached the papers: with no team brand (teams OFF, prod) every file must keep its exact
// bytes. A change here means prod paper changed — never update these hashes to make a test pass.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PathCmd } from '../assembly-print/paper';
import { MOCKUP_A_BACK, MOCKUP_A_FACE, MOCKUP_PARTS } from './fixtures/mockup';
import type { LabelOrientation } from './layout';
import { filePdf, planPrint, type PrintJob } from './pages';
import { PT_MM, type Shaper } from './text-outline';

// Deterministic stand-in for the font shaper: one box per glyph.
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

function job(orientation: LabelOrientation, extra: Partial<PrintJob> = {}): PrintJob {
  return {
    mode: 'duplex',
    orientation,
    care: MOCKUP_A_FACE.care,
    colorways: [
      {
        colorwayId: 7,
        folder: 'rc27-black',
        colour: MOCKUP_A_FACE.colour,
        country: MOCKUP_A_FACE.country,
        parts: MOCKUP_PARTS,
        sizes: [
          {
            sizeId: 3,
            label: MOCKUP_A_FACE.size,
            skuOrd: 6,
            sku: MOCKUP_A_FACE.sku,
            copies: 2,
            qrUrl: MOCKUP_A_BACK.url,
          },
        ],
      },
    ],
    ...extra,
  };
}

function hashes(j: PrintJob): Record<string, string> {
  const set = planPrint(shaper, j);
  const out: Record<string, string> = {};
  for (const file of set.files) {
    const bytes = filePdf(set, file);
    out[file.stem] = `${bytes.length} ${createHash('sha256').update(bytes).digest('hex')}`;
  }
  return out;
}

const CASES: [string, (o: LabelOrientation) => PrintJob][] = [
  ['house', (o) => job(o)],
  ['card-address', (o) => job(o, { address: ['ATELIER OWN LTD', '1 CARD STREET', 'LISBON'] })],
];

describe('care label PDF goldens (no team brand)', () => {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    it(`keeps today's bytes · ${orientation}`, async () => {
      const all = Object.fromEntries(CASES.map(([name, make]) => [name, hashes(make(orientation))]));
      await expect(`${JSON.stringify(all, null, 2)}\n`).toMatchFileSnapshot(
        `./__goldens__/care-label-${orientation}.json`,
      );
    });
  }
});
