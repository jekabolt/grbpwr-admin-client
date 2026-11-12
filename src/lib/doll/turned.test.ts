import type { EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import type { SkeletonFacts, SkeletonPieceInput } from 'lib/assembly-skeleton/types';
import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type { PieceDTO } from 'lib/nesting/types';
import { seamFromCandidate } from 'lib/seams';
import { describe, expect, it } from 'vitest';

import { solveDoll } from './doll';
import { turnedSeamsOf, type TurnedOperation } from './turned';
import type { DollOwnerCandidate } from './types';

const rect = (pieceKey: string, w = 100, h = 40): PieceGeom => {
  const rs: Pt2[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const edges = rs.map((point, k) => {
    const next = rs[(k + 1) % rs.length];
    return {
      id: `${pieceKey}#${k}` as EdgeId,
      k,
      kind: 'edge' as const,
      pts: [point, next],
      s: k,
      e: (k + 1) % rs.length,
      lenMm: Math.hypot(next[0] - point[0], next[1] - point[1]),
      chordMm: Math.hypot(next[0] - point[0], next[1] - point[1]),
      notchesMm: [],
    };
  });
  return {
    pieceKey,
    name: pieceKey,
    rs,
    edges,
    perimMm: 2 * (w + h),
    areaMm2: w * h,
    corners: [0, 1, 2, 3],
  } as unknown as PieceGeom;
};

const seam = (seamKey: string, a: EdgeId, b: EdgeId): DollOwnerCandidate => ({
  seamKey,
  inStep: true,
  candidate: { a, b, kind: 'edge', score: 1, evidence: {} } as SeamCandidate,
});

const fixture = (join: Partial<TurnedOperation> = {}, later: TurnedOperation[] = []) => {
  const geoms = new Map([
    ['PLY', rect('PLY')],
    ['PLY_1', rect('PLY_1')],
    ['BODY', rect('BODY', 160, 200)],
  ]);
  const turn = seam('turn', 'PLY#1+2', 'PLY_1#1+2');
  const attach = seam('attach', 'PLY#3', 'BODY#1');
  const operations: TurnedOperation[] = [
    {
      operationNumber: 170,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      work: 'join_lockstitch',
      inputKeys: ['PLY', 'PLY_1'],
      outputUnitKey: 'PAIR',
      seamKeys: ['turn'],
      ...join,
    },
    ...later,
    {
      operationNumber: 660,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      work: 'join_lockstitch',
      inputKeys: ['PAIR', 'BODY'],
      outputUnitKey: 'GARMENT',
      seamKeys: ['attach'],
    },
  ];
  return { geoms, operations, candidates: [turn, attach] };
};

const turned = (f: ReturnType<typeof fixture>) =>
  turnedSeamsOf({
    ...f,
    layers: [['PLY', 'PLY_1']],
  }).find((candidate) => candidate.seamKey === 'turn')?.turned;

describe('derived turned seams', () => {
  it('marks the 104-style band pair structurally and holds it at the attachment', () => {
    expect(turned(fixture())).toEqual({
      step: 170,
      run: ['PLY_1#1', 'PLY_1#2'],
      by: 'structure',
      heldBy: { step: 660, topstitch: false },
    });
  });

  it('marks the 98-style cuff and uses the join step topstitch', () => {
    expect(
      turned(
        fixture({
          operationNumber: 250,
          topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_EDGE',
        }),
      ),
    ).toMatchObject({ step: 250, heldBy: { step: 250, topstitch: true } });
  });

  it('uses the first descendant-unit topstitch even after attachment', () => {
    const f = fixture();
    f.operations.push({
      operationNumber: 680,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      inputKeys: ['GARMENT'],
      outputUnitKey: 'GARMENT',
      topstitchMode: 'TECH_CARD_TOPSTITCH_MODE_EDGE',
    });
    expect(turned(f)?.heldBy).toEqual({ step: 680, topstitch: true });
  });

  it('recognises congruent plies whose contours start at different corners', () => {
    const f = fixture();
    const rotated = rect('PLY_1');
    rotated.edges = rotated.edges
      .map((edge) => {
        const k = (edge.k + 1) % rotated.edges.length;
        return { ...edge, k, id: `PLY_1#${k}` as EdgeId };
      })
      .sort((a, b) => a.k - b.k);
    f.geoms.set('PLY_1', rotated);
    expect(turned(f)).toMatchObject({ step: 170, by: 'structure' });
  });

  it.each(['faced_split', 'faced_kant'])('accepts explicit %s evidence', (seamKind) => {
    expect(turned(fixture({ seamKind }))?.by).toBe('kind');
  });

  it('does not use the broad faced class as explicit evidence', () => {
    expect(turned(fixture({ seamClass: 'EF_FACED' }))?.by).toBe('structure');
  });

  it('accepts turn-and-shape before attachment as explicit evidence', () => {
    const trim: TurnedOperation = {
      operationNumber: 180,
      operationType: 'TECH_CARD_OPERATION_TYPE_TRIM',
      inputKeys: ['PAIR'],
      outputUnitKey: 'PAIR',
      trimAction: 'TECH_CARD_TRIM_ACTION_TURN_AND_SHAPE',
    };
    expect(turned(fixture({}, [trim]))?.by).toBe('kind');
  });

  it.each(['faced_bias_closed', 'faced_bias_double'])(
    'does not treat bias binding %s as a turned ply',
    (seamKind) => expect(turned(fixture({ seamKind }))).toBeUndefined(),
  );

  it('does not turn a whole-outline join', () => {
    const f = fixture();
    f.candidates[0] = seam('turn', 'PLY#0+1+2+3', 'PLY_1#0+1+2+3');
    expect(turned(f)).toBeUndefined();
  });

  it('does not turn a short centre-back join', () => {
    const f = fixture();
    f.candidates[0] = seam('turn', 'PLY#1', 'PLY_1#1');
    expect(turned(f)).toBeUndefined();
  });

  it('does not turn a double-yoke sandwich whose second input is a unit', () => {
    const f = fixture();
    f.operations.unshift({
      operationNumber: 100,
      operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
      inputKeys: ['PLY_1'],
      outputUnitKey: 'YOKE_UNIT',
    });
    f.operations[1] = { ...f.operations[1], inputKeys: ['PLY', 'YOKE_UNIT'] };
    expect(turned(f)).toBeUndefined();
  });

  it('does not count fusing as the pair join', () => {
    expect(turned(fixture({ work: 'fusing' }))).toBeUndefined();
  });

  it('leaves a bagged surface flap to surface geometry', () => {
    const f = fixture();
    f.candidates[0].candidate = {
      ...f.candidates[0].candidate,
      surface: { host: 'FRONT', part: 'FLAP', mark: '', T: [1, 0, 0, 1, 0, 0] as never, fit: 0 },
    };
    expect(turned(f)).toBeUndefined();
  });

  it('does not turn a unit that is never attached', () => {
    const f = fixture();
    f.operations.pop();
    expect(turned(f)).toBeUndefined();
  });

  it('requires congruent plies', () => {
    const f = fixture();
    f.geoms.set('PLY_1', rect('PLY_1', 130, 40));
    expect(turned(f)).toBeUndefined();
  });
});

const patternPiece = (
  pieceKey: string,
  name: string,
  id: number,
  widthCm: number,
  heightCm: number,
): SkeletonPieceInput => {
  const poly = [
    { x: 0, y: 0 },
    { x: widthCm, y: 0 },
    { x: widthCm, y: heightCm },
    { x: 0, y: heightCm },
  ];
  const piece: PieceDTO = {
    id,
    name,
    blockName: pieceKey,
    source: 'turned-test',
    poly,
    bboxW: widthCm,
    bboxH: heightCm,
    areaCm2: widthCm * heightCm,
  };
  return {
    pieceKey,
    name,
    piece,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  };
};

describe('post-solve turned-ply geometry', () => {
  it('appends an inward follower without changing solved vertices, seams or stretch', () => {
    const facts: SkeletonFacts = {
      pieces: [
        patternPiece('INNER', 'WST_L', 1, 10, 4),
        patternPiece('OUTER', 'WST_L_1', 2, 10, 4),
        patternPiece('BODY', 'front', 3, 16, 20),
      ],
      category: 'trousers',
      bom: {
        zipper: 0,
        buttons: 0,
        snaps: 0,
        tape: 0,
        elastic: 0,
        drawcord: 0,
        interlining: 0,
      },
      defaultMachineType: null,
    };
    const read = readSeamGraph(facts);
    const evidence = {
      dLenMm: 0,
      relLen: 0,
      notchScore: null,
      curvature: 'flat' as const,
      hand: 'neutral' as const,
      twin: 'identical' as const,
      self: false,
      aLenMm: 140,
      bLenMm: 140,
    };
    const provenance = {
      seamKey: 'turn',
      status: 'confirmed' as const,
      source: 'manual' as const,
      direction: 'unknown' as const,
      by: 'owner',
      at: '',
      how: 'hint' as const,
    };
    const turn = {
      a: 'INNER#0+1',
      b: 'OUTER#0+1',
      kind: 'edge' as const,
      score: 1,
      evidence,
      provenance,
    } as SeamCandidate;
    const attach = {
      a: 'OUTER#2',
      b: 'BODY#0',
      kind: 'edge' as const,
      score: 1,
      evidence: { ...evidence, twin: 'none' as const },
      provenance: { ...provenance, seamKey: 'attach' },
    } as SeamCandidate;
    const graph = {
      ...read,
      chosen: [turn, attach],
      rejected: [],
      components: [['INNER', 'OUTER', 'BODY']],
    };
    const candidates: DollOwnerCandidate[] = [
      {
        seamKey: 'turn',
        candidate: turn,
        inStep: true,
        turned: {
          step: 170,
          run: ['OUTER#0', 'OUTER#1'],
          by: 'structure',
          heldBy: { step: 660, topstitch: false },
        },
      },
      { seamKey: 'attach', candidate: attach, inStep: true },
    ];
    const request = (withTurn: boolean) => ({
      graph,
      facts,
      options: {
        targetVertices: 160,
        maxPasses: 0,
        settlePasses: 0,
        proposeComposite: false,
        seams: {
          mode: 'owner' as const,
          rows: [],
          size: 'M',
          candidates: withTurn
            ? candidates
            : candidates.map((candidate) => {
                const unmarked = { ...candidate };
                delete unmarked.turned;
                return unmarked;
              }),
          inStepKeys: ['turn', 'attach'],
          layers: [['INNER', 'OUTER']] as const,
        },
      },
    });
    const plain = solveDoll(request(false));
    const marked = solveDoll(request(true));

    expect(Array.from(marked.positions.subarray(0, plain.positions.length))).toEqual(
      Array.from(plain.positions),
    );
    expect(marked.stats.stretchP99Pct).toBe(plain.stats.stretchP99Pct);
    expect(marked.contradictions).toEqual(plain.contradictions);
    expect(
      marked.seams.map(({ state, residualP95Mm, stretchPct }) => ({
        state,
        residualP95Mm,
        stretchPct,
      })),
    ).toEqual(
      plain.seams.map(({ state, residualP95Mm, stretchPct }) => ({
        state,
        residualP95Mm,
        stretchPct,
      })),
    );

    const leader = marked.panels.find((panel) => panel.pieceKey === 'OUTER');
    const inner = marked.panels.find((panel) => panel.pieceKey === 'INNER' && panel.drawnOnly);
    expect(inner).toBeDefined();
    expect(marked.turned).toEqual([
      expect.objectContaining({
        piece: 'INNER',
        onto: 'OUTER',
        run: ['OUTER#0', 'OUTER#1'],
        by: 'structure',
        heldBy: { step: 660, topstitch: false },
      }),
    ]);
    if (!leader || !inner) throw new Error('turned-ply fixture did not draw both layers');
    const point = (panel: typeof leader, local: number) => {
      const offset = 3 * (panel.offset + local);
      return marked.positions.slice(offset, offset + 3);
    };
    const gaps = Array.from({ length: leader.count }, (_, index) => {
      const a = point(leader, index);
      const b = point(inner, index);
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    });
    expect(Math.min(...gaps)).toBeLessThan(1e-6);
    expect(Math.max(...gaps)).toBeGreaterThan(1.5);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(2.001);
    const runGaps = gaps.filter((_, index) => {
      const u = leader.uv[2 * index];
      const v = leader.uv[2 * index + 1];
      return Math.abs(v) < 1e-6 || Math.abs(u - 100) < 1e-6;
    });
    expect(runGaps.length).toBeGreaterThan(2);
    expect(Math.max(...runGaps)).toBeLessThan(1e-6);

    const normal = (panel: typeof leader) => {
      const [a, b, c] = panel.tris;
      const A = point(panel, a);
      const B = point(panel, b);
      const C = point(panel, c);
      const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      return [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
    };
    const outerNormal = normal(leader);
    const innerNormal = normal(inner);
    expect(
      outerNormal[0] * innerNormal[0] +
        outerNormal[1] * innerNormal[1] +
        outerNormal[2] * innerNormal[2],
    ).toBeLessThan(0);
  });

  it('keeps a rolled collar copy inside half the stand contact gap', () => {
    const facts: SkeletonFacts = {
      pieces: [
        patternPiece('LEFT', 'front left', 11, 25, 70),
        patternPiece('RIGHT', 'front right', 12, 25, 70),
        patternPiece('BACK', 'back', 13, 50, 70),
        patternPiece('COLLAR_IN', 'collar', 14, 100, 8),
        patternPiece('COLLAR_OUT', 'collar', 15, 100, 8),
      ],
      category: 'shirt',
      bom: {
        zipper: 0,
        buttons: 0,
        snaps: 0,
        tape: 0,
        elastic: 0,
        drawcord: 0,
        interlining: 0,
      },
      defaultMachineType: null,
    };
    const read = readSeamGraph(facts);
    const evidence = {
      dLenMm: 0,
      relLen: 0,
      notchScore: null,
      curvature: 'flat' as const,
      hand: 'neutral' as const,
      twin: 'none' as const,
      self: false,
      aLenMm: 1000,
      bLenMm: 1000,
    };
    const edge = (a: EdgeId, b: EdgeId): SeamCandidate => ({
      a,
      b,
      kind: 'edge',
      score: 1,
      evidence,
    });
    const turn = edge('COLLAR_IN#1+2+3', 'COLLAR_OUT#1+2+3');
    const neck: SeamCandidate = {
      a: 'COLLAR_OUT#0',
      b: 'LEFT#2+BACK#2+RIGHT#2',
      aParts: ['COLLAR_OUT#0'],
      bParts: ['LEFT#2', 'BACK#2', 'RIGHT#2'],
      kind: 'composite',
      score: 1,
      evidence,
    };
    const chosen = [edge('LEFT#3', 'BACK#1'), edge('RIGHT#1', 'BACK#3'), turn, neck];
    const graph = {
      ...read,
      chosen,
      rejected: [],
      components: [['LEFT', 'RIGHT', 'BACK', 'COLLAR_IN', 'COLLAR_OUT']],
    };
    const resolved = chosen.map((candidate, index) => {
      const row = seamFromCandidate(candidate, graph.pieces, {
        seamKey: `collar-${index}`,
        status: 'confirmed',
        source: 'manual',
        anchoredSize: 'M',
      });
      if (!row) throw new Error(`collar row ${index} did not resolve`);
      return { candidate, row };
    });
    const candidates: DollOwnerCandidate[] = resolved.map(({ candidate, row }) => ({
      seamKey: row.seamKey,
      candidate,
      inStep: true,
      ...(candidate === turn
        ? {
            turned: {
              step: 50,
              run: ['COLLAR_OUT#1', 'COLLAR_OUT#2', 'COLLAR_OUT#3'] as EdgeId[],
              by: 'structure' as const,
              heldBy: { step: 70, topstitch: true },
            },
          }
        : {}),
    }));
    const report = solveDoll({
      graph,
      facts,
      options: {
        targetVertices: 420,
        maxPasses: 0,
        settlePasses: 0,
        proposeComposite: false,
        seams: {
          mode: 'owner',
          rows: resolved.map(({ row }) => row),
          size: 'M',
          candidates,
          inStepKeys: candidates.map((candidate) => candidate.seamKey),
          layers: [['COLLAR_IN', 'COLLAR_OUT']],
        },
      },
    });
    const leader = report.panels.find((panel) => panel.pieceKey === 'COLLAR_OUT');
    const inner = report.panels.find((panel) => panel.pieceKey === 'COLLAR_IN' && panel.drawnOnly);
    expect(report.collar?.units).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'collar' })]),
    );
    expect(leader).toBeDefined();
    expect(inner).toBeDefined();
    if (!leader || !inner) throw new Error('rolled collar fixture did not draw both plies');
    const gaps = Array.from({ length: leader.count }, (_, index) => {
      const a = 3 * (leader.offset + index);
      const b = 3 * (inner.offset + index);
      return Math.hypot(
        report.positions[a] - report.positions[b],
        report.positions[a + 1] - report.positions[b + 1],
        report.positions[a + 2] - report.positions[b + 2],
      );
    });
    // Rolled collars use a 1.5 mm one-sided stand contact; the copy stays within half of it.
    expect(Math.max(...gaps)).toBeLessThanOrEqual(0.751);
  });
});
