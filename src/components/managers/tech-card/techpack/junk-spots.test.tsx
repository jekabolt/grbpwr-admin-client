import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { common_TechCard, common_TechCardPiece } from 'api/proto-http/admin';
import { bomRefs, materialForPiece } from './derive-shared';
import { PdfLangProvider } from './i18n';
import { Delta } from './pages/assembly';
import { PiecesPage } from './pages/pieces';

const MAIN = {
  lineKey: 'FAB_MAIN',
  name: 'Cotton shell',
  section: 'TECH_CARD_BOM_SECTION_FABRIC',
  purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
};

describe('piece material fallbacks', () => {
  it('resolves a piece through the pattern BOM binding', () => {
    const piece = {
      lineKey: '01KZVT1QZWB5DX4YDRW3W4QNW1',
      name: 'BP',
      materials: [],
    } as unknown as common_TechCardPiece;
    const card = {
      techCard: {
        bomItems: [MAIN],
        patterns: [{ lineKey: 'DXF_MAIN', bomLineKey: 'FAB_MAIN' }],
        pieces: [piece],
      },
      colorways: [],
      pieceAreaScopes: [],
    } as unknown as common_TechCard;

    expect(materialForPiece(bomRefs(card), undefined, piece, 0, card)?.key).toBe('FAB_MAIN');
  });

  it('uses a piece-area scope to disambiguate multiple pattern materials', () => {
    const piece = {
      lineKey: '01KZVT1QZWB5DX4YDRW3W4QNW1',
      name: 'BP',
      materials: [],
    } as unknown as common_TechCardPiece;
    const card = {
      techCard: {
        bomItems: [
          MAIN,
          {
            lineKey: 'FAB_LINING',
            name: 'Lining',
            section: 'TECH_CARD_BOM_SECTION_LINING',
            purpose: 'TECH_CARD_BOM_PURPOSE_LINING',
          },
        ],
        patterns: [{ bomLineKey: 'FAB_MAIN' }, { bomLineKey: 'FAB_LINING' }],
        pieces: [piece],
      },
      colorways: [],
      pieceAreaScopes: [{ scopeKey: 'FAB_MAIN', areas: [{ pieceLineKey: piece.lineKey }] }],
    } as unknown as common_TechCard;

    expect(materialForPiece(bomRefs(card), undefined, piece, 0, card)?.key).toBe('FAB_MAIN');
  });
});

describe('cut-piece missing material', () => {
  it('collapses per-piece material gaps into one line and omits the warning tile suffix', () => {
    const card = {
      id: 83,
      techCard: {
        bomItems: [],
        patterns: [],
        pieces: [
          {
            lineKey: '01KZVT1QZWB5DX4YDRW3W4QNW1',
            name: 'BP',
            piecesPerGarment: 1,
            materials: [],
          },
          {
            lineKey: '01KZVT1QZWB5DX4YDRW3W4QNW2',
            name: 'CLR',
            piecesPerGarment: 1,
            materials: [],
          },
        ],
      },
      colorways: [],
      pieceAreaScopes: [],
    } as unknown as common_TechCard;
    const markup = renderToStaticMarkup(
      <PiecesPage techCard={card} orient='land' docline='test' n='02' />,
    );

    expect(markup.match(/no material:/g)).toHaveLength(1);
    expect(markup).toContain('no material: 2 pieces (BP, CLR) — assign in BOM');
    expect(markup.match(/data-missing/g)).toHaveLength(1);
    expect(markup).not.toContain(' · !');
  });
});

describe('assembly length delta', () => {
  it('renders rounded named sides without a seam circle or arrow', () => {
    const markup = renderToStaticMarkup(
      <PdfLangProvider lang='en'>
        <Delta
          metrics={[
            {
              letter: '1',
              left: 579.3,
              leftName: 'neckline',
              right: 439.2,
              rightName: 'collar',
              delta: 140.1,
              bad: true,
            },
          ]}
        />
      </PdfLangProvider>,
    );

    expect(markup).toContain('−140 mm');
    expect(markup).toContain('collar 439');
    expect(markup).toContain('neckline 579');
    expect(markup).not.toContain('asm-letter');
    expect(markup).not.toContain('↔');
  });
});
