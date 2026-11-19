// The care label with a team brand (wave «teams», W-spec §5): another team's tape carries its own
// legal lines or none, never COMPANY_ADDRESS, and no house mark; the card's own lines still win.
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

const COMPANY = ['OSTRA STUDIO LTD', '1 MILL LANE', 'LEEDS'];
const CARD = ['ATELIER OWN LTD', '1 CARD STREET', 'LISBON'];

describe('care label with a team brand', () => {
  for (const orientation of ['horizontal', 'vertical'] as const) {
    it(`team lines replace the house address · ${orientation}`, () => {
      const house = hashes(job(orientation));
      const team = hashes(job(orientation, { company: COMPANY, houseMark: true }));
      const same = hashes(job(orientation, { address: COMPANY }));
      expect(team).toEqual(same);
      expect(team).not.toEqual(house);
    });

    it(`the card's own address wins over the team · ${orientation}`, () => {
      expect(hashes(job(orientation, { address: CARD, company: COMPANY }))).toEqual(
        hashes(job(orientation, { address: CARD })),
      );
    });

    it(`empty team lines and no house mark print nothing · ${orientation}`, () => {
      const house = hashes(job(orientation));
      const bare = hashes(job(orientation, { company: [], houseMark: false }));
      const noAddress = hashes(job(orientation, { company: [] }));
      expect(noAddress).not.toEqual(house);
      expect(bare).not.toEqual(noAddress);
    });

    it(`houseMark undefined or true is today's tape · ${orientation}`, () => {
      expect(hashes(job(orientation, { houseMark: true }))).toEqual(hashes(job(orientation)));
    });
  }
});

describe('buildPrintJob brand', () => {
  it('teams OFF adds no field; a team adds its lines and mark', async () => {
    const { buildPrintJob } = await import('./print-job');
    const data = {
      care: { codes: [], prose: [] },
      colorways: [],
      sizes: [],
      styleNumber: '',
      label: { logo: null, caption: [], address: [] },
    } as never;
    const base = { data, compositions: new Map(), mode: 'duplex' as const, qr: {} as never };
    const off = buildPrintJob({ ...base, colorwayIds: [], copies: () => 0 });
    expect('company' in off || 'houseMark' in off).toBe(false);
    const on = buildPrintJob({
      ...base,
      colorwayIds: [],
      copies: () => 0,
      brand: { company: [], houseMark: false },
    });
    expect(on).toMatchObject({ company: [], houseMark: false });
  }, 60_000); // a cold import of the print module graph
});
