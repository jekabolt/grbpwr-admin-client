import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

describe('PDF gap registry', () => {
  it('renders exactly the gaps collected from the same fixture inputs', () => {
    Object.assign(globalThis, {
      window: { location: { origin: 'https://admin.beta.grbpwr.com' } },
    });
    const collected = collectPdfGaps({
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
    const html = renderToStaticMarkup(
      <TechpackDocument techCard={fixture} orient='land' revision='rev 1' />,
    );
    const rendered = new Set(
      [...html.matchAll(/data-gap="([^"]+)"/g)].map((match) => match[1].replaceAll('&amp;', '&')),
    );
    const renderedMarks = [...html.matchAll(/data-gap="([^"]+)"/g)].map((match) =>
      match[1].replaceAll('&amp;', '&'),
    );
    const codes = new Set(collected.map((gap) => gap.code));
    expect(collected.every((gap) => /^(?:asm|pdf)_/.test(gap.code))).toBe(true);
    expect(codes.has('asm_edge_missing')).toBe(true);
    expect(codes.has('asm_partner_missing')).toBe(false);
    const unmarkedJoin = collected.find((gap) => gap.label === 'no seam · pick');
    expect(unmarkedJoin).toBeDefined();
    expect(renderedMarks.filter((key) => key === gapKey(unmarkedJoin!))).toHaveLength(1);
    expect(rendered).toEqual(new Set(collected.map(gapKey)));
  });

  it('has no PDF text-error renderer outside Gap', () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const files: string[] = [];
    const walk = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.tsx')) files.push(path);
      }
    };
    walk(root);
    const offenders = files
      .filter((path) => !path.endsWith('/gaps.ts'))
      .filter((path) => readFileSync(path, 'utf8').includes('text-error'));
    expect(offenders).toEqual([]);
  });
});
