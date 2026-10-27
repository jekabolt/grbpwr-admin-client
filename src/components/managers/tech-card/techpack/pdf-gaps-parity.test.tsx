import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';

const pieces = new Map();
const grainDeg = new Map();
const shapes = { shapeByKey: new Map(), grainLayer: '' };

vi.mock('lib/providers/dictionary-provider', () => ({
  useDictionary: () => ({ dictionary: { sizes: [{ id: 1, name: 'M' }] } }),
}));
vi.mock('./use-assembly-geometry', () => ({
  useAssemblyGeometry: () => ({
    pieces,
    grainDeg,
    shapes,
    dep: { label: 'pattern geometry', status: 'ok' },
  }),
}));
vi.mock('./use-l3-data', () => ({
  useTechpackMeasurements: () => ({
    measurements: [],
    sizeChart: undefined,
    sizeNames: { 1: 'M' },
    isLoading: false,
    isError: false,
  }),
  useTechpackMarkerLayouts: () => ({ markerLayouts: [], isLoading: false, isError: false }),
}));

import { TechpackDocument } from './document';
import { collectPdfGaps, gapKey } from './gaps';
import { gapsToClientFindings } from './gap-findings';
import { PdfGapsGroup } from '../components/pdf-gaps-group';
import { resolveClientFindings } from '../components/finding-seen';

const fixture = {
  id: 1,
  lockVersion: 1,
  techCard: {
    name: 'Assembly schema fixture',
    brand: 'GRBPWR',
    status: 'released',
    baseSampleSizeId: 1,
    pieces: [{ lineKey: 'RIGHT_FRONT', name: 'Right front', piecesPerGarment: 1 }],
    operations: [
      {
        operationNumber: 560,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
        work: 'join_lockstitch',
        inputKeys: ['RIGHT_FRONT'],
      },
    ],
    bomItems: [],
    patterns: [],
  },
  colorways: [],
  markers: [],
  seams: [],
  resolvedTechnicalMedia: [],
} as unknown as common_TechCard;

// PARITY (assembly-schema T12): the audit's «pdf gaps» rows, the registry and section 06's final
// gaps list are one ordered list — same fixture, same inputs.
describe('PDF gaps in the audit', () => {
  it('audit rows == collectPdfGaps == section 06 list rows, in order', () => {
    Object.assign(globalThis, {
      window: { location: { origin: 'https://admin.beta.grbpwr.com' } },
    });
    const gaps = collectPdfGaps({
      techCard: fixture,
      sampleSizeName: 'M',
      revisionLabel: 'rev 1',
      pieces,
      grainDeg,
      pieceGeometry: shapes,
      measurements: [],
      sizeNames: { 1: 'M' },
      markerLayouts: [],
      patternOrigin: 'https://admin.beta.grbpwr.com',
      markerOrigin: 'https://admin.beta.grbpwr.com',
      netM2ByLine: {},
      includeMarkerLayouts: false,
      labelPlacement: '',
    });
    expect(gaps.length).toBeGreaterThan(0);

    const findings = resolveClientFindings(gapsToClientFindings(gaps), undefined);
    expect(findings.every((f) => (f.key ?? '').length > 0)).toBe(true);
    const audit = renderToStaticMarkup(
      <PdfGapsGroup
        rows={gaps.map((gap, i) => ({ gap, finding: findings[i] }))}
        showSeen={false}
        onGo={() => {}}
        renderRef={(r) => r}
      />,
    );
    const rows = [...audit.matchAll(/data-gap-row="([^"]+)"/g)].map((m) =>
      m[1].replaceAll('&amp;', '&'),
    );
    const pdf = renderToStaticMarkup(
      <TechpackDocument techCard={fixture} orient='land' revision='rev 1' />,
    );
    const listRows = [...pdf.matchAll(/data-gap-list-row="([^"]+)"/g)].map((m) =>
      m[1].replaceAll('&amp;', '&'),
    );
    const keys = gaps.map(gapKey);

    expect(rows).toEqual(keys);
    expect(listRows).toEqual(keys);
    expect(new Set(listRows).size).toBe(listRows.length);
    expect(audit).toContain('assembly</span> · seam');
    expect(pdf).toContain('op 560 · seam');
    // Every list line is a link to where the gap is fixed (the same door as the audit's Go to).
    const links = [...pdf.matchAll(/<a class="asm-gap-line"[^>]*href="([^"]+)"/g)].map((m) =>
      m[1].replaceAll('&amp;', '&'),
    );
    expect(links).toHaveLength(keys.length);
    expect(links).toContain(
      `${window.location.origin}/tech-cards/1?tab=construction&op=560&pick=560`,
    );
    expect(pdf).toContain('construction · op 560');
  });
});
