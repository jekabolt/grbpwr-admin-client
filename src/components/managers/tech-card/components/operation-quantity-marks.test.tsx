import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ButtonAttachCheckLine,
  OperationMaterialStepQty,
  buttonAttachChecks,
} from './operation-quantity-marks';

describe('operation material quantities', () => {
  it('renders the tile badge and the checks with semantic glyph colours', () => {
    const checks = buttonAttachChecks(
      [
        {
          operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
          machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
          zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
          placementCount: 6,
        },
        {
          operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
          machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
          zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
          placementCount: 6,
          buttonHoles: 2,
        },
      ],
      1,
      4,
    );
    const markup = renderToStaticMarkup(
      <>
        <OperationMaterialStepQty qty={6} />
        <ButtonAttachCheckLine checks={checks} />
      </>,
    );

    expect(markup).toContain('bg-textColor');
    expect(markup).toContain('×6');
    expect(markup).toContain('buttonholes 6');
    expect(markup).toContain('text-success');
    expect(markup).toContain('article holes 4');
    expect(markup).toContain('text-error');
  });

  it('hides checks that cannot be made', () => {
    expect(
      buttonAttachChecks(
        [
          {
            operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
            machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
            zone: 'TECH_CARD_GARMENT_ZONE_UNKNOWN',
            placementCount: 4,
          },
        ],
        0,
      ),
    ).toEqual([]);
  });
});
