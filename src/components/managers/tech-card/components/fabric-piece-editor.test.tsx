import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { FabricPieceEditor } from './fabric-piece-editor';
import type { FormGarmentLabel } from './labels-schema';

const row = {
  key: 'composition',
  lineKey: 'label-1',
  attachment: 'on_fabric_piece',
  widthMm: '30',
  heightMm: '50',
  pieceBomItemId: 17,
  pieceWidthMm: '40',
  pieceHeightMm: '70',
  pieceSeamMm: '8',
  labelXMm: '5',
  labelYMm: '12',
  labelOnPiece: '4_sides',
  fold: 'flat',
  prints: [
    {
      id: 1,
      name: 'logo.svg',
      libraryFileId: 101,
      method: 'screen',
      colour: 'black',
      widthMm: '20',
      heightMm: '6',
      xMm: '5',
      yMm: '4',
    },
  ],
} as FormGarmentLabel;

describe('FabricPieceEditor', () => {
  it('server-renders the piece, seam, print and two approved tiles', () => {
    const html = renderToStaticMarkup(
      <FabricPieceEditor
        row={row}
        fabricLines={[
          { id: 17, name: 'self · cotton jersey 220', section: 'TECH_CARD_BOM_SECTION_FABRIC' },
        ]}
        selectedPrintIndex={0}
        disabled={false}
        onSelectPrint={vi.fn()}
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain('aria-label="fabric piece editor"');
    expect(html).toContain('piece fabric');
    expect(html).toContain('LOGO.SVG');
    expect(html).toContain('side');
    expect(html).toContain('on garment');
  });
});
