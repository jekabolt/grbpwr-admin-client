import { describe, expect, it } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { segmentPiece } from 'lib/assembly-skeleton/geometry/segment';

import { card83StoredSeamsFixture } from '../../techpack/assembly-inference.fixture';
import { deriveAssembly } from '../../techpack/derive-assembly';
import { derivePatternsMarkerPage } from '../../techpack/derive-patterns';
import { derivePieces } from '../../techpack/derive-pieces';
import { techpackFixture, techpackGeometry } from '../../techpack/techpack-document.fixture';
import { dollOwnerSeamsOf } from '../assembly-doll/use-doll-card';
import { garmentAssemblyOfCard, seamGraphOfCard, seamRowsOfCard } from '../card-seam-graph';
import type { SceneOp } from '../step-seams/step-picture-view';
import { suggestStepPairs } from '../step-seams/step-seams-model';
import {
  bomLinesOfStep,
  cutStripsOfCard,
  drawnSizeToken,
  rowTouchesStrip,
  stripDrawingsOf,
  stripFoundPiece,
  stripMarkOf,
  stripQtyInStep,
  stripRefsOf,
  withoutStripPieces,
  withStripPieces,
  type CutStripLike,
} from './strip-pieces';
import {
  fromSeamStrip,
  oneLengthStrip,
  RUBBER,
  STRIP,
  STRIP_SIZE_NAMES,
  WAISTBAND,
  waistbandCard,
} from './strip.fixture';

const BOM = [{ lineKey: RUBBER, name: 'rubber' }];
const DRAW = { sizeToken: 'M', sizeNames: STRIP_SIZE_NAMES, baseSizeId: 2 };

describe('the read view', () => {
  const card = {
    techCard: { pieces: [{ lineKey: 'A', name: 'band' }], bomItems: BOM },
    cutStrips: [fromSeamStrip()],
  } as unknown as common_TechCard;

  it('adds one row per strip, named by the BOM line, and leaves the raw card alone', () => {
    const raw = JSON.stringify(card);
    const view = withStripPieces(card);
    expect(view.techCard?.pieces?.map((piece) => [piece.lineKey, piece.name])).toEqual([
      ['A', 'band'],
      [STRIP, 'rubber'],
    ]);
    expect(view.techCard?.pieces?.[1].materials).toEqual([]);
    expect(JSON.stringify(card)).toBe(raw);
  });

  it('is idempotent, and the same object when the card has no strips', () => {
    const view = withStripPieces(card);
    expect(withStripPieces(view)).toBe(view);
    const plain = { techCard: { pieces: [] } } as unknown as common_TechCard;
    expect(withStripPieces(plain)).toBe(plain);
    expect(cutStripsOfCard(plain)).toBe(cutStripsOfCard({} as common_TechCard));
  });

  it('never reaches the form: a strip inside the insert is read but never written back', () => {
    const live = { techCard: { pieces: [], cutStrips: [fromSeamStrip()] } };
    expect(cutStripsOfCard(live as unknown as common_TechCard)).toHaveLength(1);
    expect(stripRefsOf([fromSeamStrip()], BOM)).toEqual([
      { lineKey: STRIP, name: 'rubber', strip: { qty: 1 } },
    ]);
  });
});

describe('the rectangle', () => {
  it.each([10, 25, 40, 60])('%d mm wide gets four good edges from segmentPiece', (widthMm) => {
    const mark = stripMarkOf(fromSeamStrip({ widthMm: { value: String(widthMm) } }), BOM, DRAW)!;
    const { piece } = stripFoundPiece(STRIP, mark, 'M');
    const geom = segmentPiece({
      pieceKey: STRIP,
      name: 'rubber',
      piece,
      piecesPerGarment: 1,
      cutSymmetry: null,
      cloth: null,
      fused: false,
    });
    expect(geom.edges).toHaveLength(4);
    const lengths = geom.edges.map((edge) => edge.lenMm).sort((a, b) => b - a);
    expect(lengths[0]).toBeCloseTo(672, 0);
    expect(lengths[1]).toBeCloseTo(672, 0);
    expect(lengths[2]).toBeCloseTo(widthMm, 0);
    expect(resolveEdge(geom.edges[0].id, new Map([[STRIP, geom]]))?.pts.length).toBeGreaterThan(1);
  });

  it('draws the sewn length: the fixture is the mockup, 790 at 85% plus 30 is cut 702, sewn 672', () => {
    expect(stripMarkOf(fromSeamStrip(), BOM, DRAW)).toMatchObject({
      label: 'rubber',
      sewnMm: 672,
      seamMm: 790,
      sizeName: 'M',
      widthMm: 40,
    });
  });

  it('draws at the size the pieces were read at, and at no size when it knows none', () => {
    expect(stripMarkOf(fromSeamStrip(), BOM, { ...DRAW, sizeToken: 'L' })?.sewnMm).toBe(
      Math.round(830 * 0.85 + 30) - 30,
    );
    const none = fromSeamStrip({ sizes: [] } as never);
    expect(stripMarkOf(none, BOM, DRAW)).toBeNull();
    expect(stripDrawingsOf([none], BOM, DRAW)).toEqual([]);
  });

  it('has one length at every size', () => {
    expect(stripMarkOf(oneLengthStrip(700), BOM, DRAW)).toMatchObject({
      mode: 'one_length',
      sewnMm: 700,
    });
    expect(stripMarkOf(oneLengthStrip(700), BOM, DRAW)?.sizeName).toBeUndefined();
  });

  it('has no width, no shape', () => {
    expect(stripMarkOf(fromSeamStrip({ widthMm: { value: '' } }), BOM, DRAW)).toBeNull();
  });

  it('reads the size most found pieces were read at', () => {
    expect(drawnSizeToken([{ size: 'M' }, { size: 'S' }, { size: 'M' }, null])).toBe('M');
    expect(drawnSizeToken([])).toBe('');
  });
});

describe('the garment read stays blind to strips', () => {
  const real = card83StoredSeamsFixture();
  const graphOf = (card: common_TechCard) =>
    JSON.stringify(seamGraphOfCard(card, real.pieces).chosen);

  // A rectangle the length of the back's neckline, in the step that joins the collar to the base.
  const withStrip = (): common_TechCard => {
    const ins = real.techCard.techCard!;
    return {
      ...real.techCard,
      cutStrips: [fromSeamStrip()],
      techCard: {
        ...ins,
        bomItems: [...(ins.bomItems ?? []), { lineKey: RUBBER, name: 'rubber' }],
        operations: (ins.operations ?? []).map((operation) =>
          operation.operationNumber === 400
            ? { ...operation, inputKeys: [...(operation.inputKeys ?? []), STRIP] }
            : operation,
        ),
      },
    } as unknown as common_TechCard;
  };

  it('reads the same seams with and without a strip in a step and in the geometry', () => {
    const mine = waistbandCard();
    const pieces = new Map([...real.pieces, [STRIP, mine.pieces.get(STRIP)!]]);
    const without = JSON.stringify(seamGraphOfCard(real.techCard, real.pieces).chosen);
    const within = JSON.stringify(seamGraphOfCard(withStrip(), pieces).chosen);
    expect(within).toBe(without);
    expect(within.length).toBeGreaterThan(10);
  });

  it('does not let the strip into the garment model', () => {
    const mine = waistbandCard();
    const pieces = new Map([...real.pieces, [STRIP, mine.pieces.get(STRIP)!]]);
    const garment = garmentAssemblyOfCard(withStrip(), pieces);
    expect(JSON.stringify(garment.graph)).not.toContain(STRIP);
    expect(graphOf(real.techCard).length).toBeGreaterThan(10);
  });

  it('takes a strip out of a seam row on either shape of the row', () => {
    const keys = new Set([STRIP]);
    expect(rowTouchesStrip({ sideA: [{ piece: STRIP }], sideB: [] }, keys)).toBe(true);
    expect(rowTouchesStrip({ sideA: { parts: [{ pieceLineKey: STRIP }] } }, keys)).toBe(true);
    expect(rowTouchesStrip({ sideA: [{ piece: 'X' }] }, keys)).toBe(false);
    const mine = waistbandCard();
    const clean = withoutStripPieces(withStripPieces(mine.techCard));
    expect(clean.seams).toEqual([]);
    expect(clean.techCard?.pieces?.some((piece) => piece.lineKey === STRIP)).toBe(false);
    expect(clean.techCard?.operations?.[0].inputKeys).not.toContain(STRIP);
    expect(clean.techCard?.operations?.[0].seamKeys).toEqual([]);
  });

  it('prints the real steps of the card and no gap about a strip that has geometry', () => {
    const mine = waistbandCard();
    const pieces = new Map([...real.pieces, [STRIP, mine.pieces.get(STRIP)!]]);
    const plain = deriveAssembly({
      techCard: real.techCard,
      pieces: real.pieces,
      grainDeg: real.grainDeg,
    });
    const strip = deriveAssembly({ techCard: withStrip(), pieces, grainDeg: real.grainDeg });
    expect(strip.rows.map((row) => row.n)).toEqual(plain.rows.map((row) => row.n));
    const codes = (model: typeof plain) => model.gaps.map((gap) => gap.code).sort();
    expect(codes(strip)).toEqual(codes(plain));
  });
});

describe('the cut sheet and the marker do not see strips', () => {
  const plain = techpackFixture;
  const withStrips = {
    ...plain,
    techCard: plain.techCard,
    cutStrips: [fromSeamStrip({ bomLineKey: plain.techCard?.bomItems?.[0]?.lineKey ?? RUBBER })],
  } as unknown as common_TechCard;
  const markerInput = (techCard: common_TechCard) => ({
    techCard,
    pieceGeometry: techpackGeometry.shapes,
    patternViewerToken: 'token',
    patternOrigin: 'https://example.test',
    markerOrigin: 'https://example.test',
  });

  it('gives a byte-identical cut sheet, norm and marker page', () => {
    const a = derivePieces(plain, techpackGeometry.shapes);
    const b = derivePieces(withStrips, techpackGeometry.shapes);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a.groups.length).toBeGreaterThan(0);
    expect(JSON.stringify(derivePatternsMarkerPage(markerInput(withStrips) as never))).toBe(
      JSON.stringify(derivePatternsMarkerPage(markerInput(plain) as never)),
    );
  });

  it('would change if a strip row reached them: the guard is real', () => {
    const a = derivePieces(plain, techpackGeometry.shapes);
    const leaked = derivePieces(withStripPieces(withStrips), techpackGeometry.shapes);
    expect(JSON.stringify(leaked)).not.toBe(JSON.stringify(a));
  });
});

describe('the doll sews cloth only', () => {
  const input = waistbandCard();
  const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
  const args = {
    rows: [...seamRowsOfCard(input.techCard).values()],
    poses: new Map(),
    operations: (input.techCard.techCard?.operations ?? []) as SceneOp[],
    geoms,
    innerLines: new Map(),
    stepResults: [{ stacked: [[WAISTBAND, STRIP]] as [string, string][] }],
    pieceKeys: new Set(geoms.keys()),
  };

  it('would sew the strip without the guard', () => {
    expect(dollOwnerSeamsOf(args)?.candidates).toHaveLength(1);
  });

  it('leaves a strip, its seam and its layer out of the solve', () => {
    expect(dollOwnerSeamsOf({ ...args, stripKeys: new Set([STRIP]) })).toBeNull();
  });

  it('sews a real row of the same step and names no strip', () => {
    const real = { ...args.rows[0], seamKey: 'real', sideB: args.rows[0].sideA };
    const owner = dollOwnerSeamsOf({
      ...args,
      rows: [...args.rows, real],
      stripKeys: new Set([STRIP]),
    });
    expect(owner?.rows.map((row) => row.seamKey)).toEqual(['real']);
    expect(owner?.layers).toEqual([]);
    expect(JSON.stringify(owner?.candidates)).not.toContain(STRIP);
  });
});

describe('a step with a strip and no seam yet', () => {
  it('proposes the waistband, in the same gesture as a piece', () => {
    const input = waistbandCard(fromSeamStrip(), { seam: false });
    const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
    const operations = (input.techCard.techCard?.operations ?? []) as SceneOp[];
    const proposals = suggestStepPairs(
      operations,
      0,
      new Set(geoms.keys()),
      geoms,
      new Set(),
      null,
    );
    expect(proposals).toHaveLength(1);
    const long = (key: string) =>
      [...(geoms.get(key)?.edges ?? [])].sort((x, y) => y.lenMm - x.lenMm)[0].lenMm;
    const lengths = [...proposals[0].a, ...proposals[0].b].map(
      (edge) => resolveEdge(edge, geoms)?.len ?? 0,
    );
    expect(lengths).toEqual([long(WAISTBAND), long(STRIP)]);
  });
});

describe('the words of a step with a strip', () => {
  it('numbers the cloth and not the strip, which would read as a count', () => {
    const [row] = deriveAssembly(waistbandCard()).rows;
    expect(row.words.ins).toEqual(['1 waistband', 'rubber']);
  });
});

describe('a strip that cannot be drawn yet', () => {
  it('leaves the card undowngraded and says nothing about geometry', () => {
    const drawn = deriveAssembly(waistbandCard(fromSeamStrip(), { seam: false }));
    const blank = deriveAssembly(
      waistbandCard(fromSeamStrip({ widthMm: { value: '' } } as Partial<CutStripLike>), {
        seam: false,
      }),
    );
    expect(blank.pieces.has(STRIP)).toBe(false);
    expect(blank.gaps.map((gap) => gap.code)).toEqual(drawn.gaps.map((gap) => gap.code));
    expect(blank.rows.length).toBe(drawn.rows.length);
  });

  it('survives the operation aliases: the top-level strips stay on the read view', () => {
    const model = deriveAssembly(waistbandCard());
    expect(cutStripsOfCard(model.techCard)).toHaveLength(1);
  });
});

describe('a step that sews a strip consumes its BOM line', () => {
  const strip = { lineKey: 'S1', bomLineKey: 'RUBBER', qty: 2 };

  it('adds the line to the ones linked by hand', () => {
    expect(bomLinesOfStep({ bomLineKeys: ['THREAD'], inputKeys: ['BLT', 'S1'] }, [strip])).toEqual([
      'THREAD',
      'RUBBER',
    ]);
  });
  it('leaves a step without the strip alone', () => {
    expect(bomLinesOfStep({ bomLineKeys: ['THREAD'], inputKeys: ['BLT'] }, [strip])).toEqual([
      'THREAD',
    ]);
  });
  it('takes the quantity from the strip', () => {
    expect(stripQtyInStep({ inputKeys: ['S1'] }, [strip], 'RUBBER')).toBe(2);
    expect(stripQtyInStep({ inputKeys: ['BLT'] }, [strip], 'RUBBER')).toBeNull();
  });
});

describe('the size on a strip mark', () => {
  it('reads as the rest of the screen writes it, not as the dictionary stores it', () => {
    const sizeNames = new Map([[2, 'm_32bo_m']]);
    const mark = stripMarkOf(fromSeamStrip(), BOM, { sizeNames, baseSizeId: 2 });
    expect(mark?.sizeName).toBe('m [32]');
  });
});
