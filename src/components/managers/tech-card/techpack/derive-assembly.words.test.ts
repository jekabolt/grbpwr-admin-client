import type { common_TechCard } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';

import { compactInputNames, deriveAssembly } from './derive-assembly';

describe('compactInputNames', () => {
  it('drops the tail every input shares and step numbers that tell nothing apart', () => {
    expect(
      compactInputNames([
        { name: 'Front upper right with pocket detail', step: 610 },
        { name: 'Front right with pocket detail', step: 630 },
      ]),
    ).toEqual(['Front upper right', 'Front right']);
  });

  it('keeps the step number between equally named inputs', () => {
    expect(
      compactInputNames([
        { name: 'Sleeve', step: 10 },
        { name: 'Sleeve', step: 20 },
      ]),
    ).toEqual(['Sleeve (10)', 'Sleeve (20)']);
  });

  it('folds consecutively numbered pieces into one range', () => {
    const pieces = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      name: `outer_trapezoid_${n}_OS`,
      pieceNumber: n,
    }));
    expect(compactInputNames(pieces)).toEqual(['outer_trapezoid_1–8_OS']);
  });

  it('leaves two numbered pieces and gapped numbers as they are', () => {
    expect(compactInputNames([{ name: 'part_1' }, { name: 'part_2' }])).toEqual([
      'part_1',
      'part_2',
    ]);
    expect(compactInputNames([{ name: 'part_1' }, { name: 'part_2' }, { name: 'part_5' }])).toEqual(
      ['part_1', 'part_2', 'part_5'],
    );
  });

  it('formats a button composition before printing it in the operation line', () => {
    const techCard = {
      techCard: {
        bomItems: [
          {
            lineKey: 'BTN',
            section: 'TECH_CARD_BOM_SECTION_HARDWARE',
            name: 'Button',
            composition: '{"fibre":[{"code":"POL","percent":100}]}',
          },
        ],
        operations: [
          {
            operationNumber: 10,
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
            work: 'button_attach',
            bomLineKeys: ['BTN'],
          },
        ],
      },
    } as unknown as common_TechCard;

    const model = deriveAssembly({ techCard, pieces: new Map(), grainDeg: new Map() });
    expect(model.rows[0].words.line.map((segment) => segment.t)).toContain(
      'Button · 100% Polyester',
    );
  });
});
