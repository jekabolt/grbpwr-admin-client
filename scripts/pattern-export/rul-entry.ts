import assert from 'node:assert/strict';

import { buildAst } from 'lib/pattern-import/adapters/dxf/ast';
import { loadDxf } from 'lib/pattern-import/adapters/dxf/tags';
import { expandRul, parseRul, zipRulPair } from 'lib/pattern-import/adapters/rul';
import { pieceBlocks } from 'lib/pattern-import/adapters/rul/model';
import { exportDxfRulArchive, writeDxfRulArchive } from 'lib/pattern-export/rul';

type Point = { x: number; y: number };

const enc = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;

const gradedDxf = (): string => {
  const tags: [number, string][] = [];
  const E = (code: number, value: string | number) => tags.push([code, String(value)]);
  const text = (value: string) => {
    E(0, 'TEXT');
    E(8, 1);
    E(10, 20);
    E(20, 20);
    E(40, 3);
    E(1, value);
  };
  const sizes = [
    { name: 'S', right: 90, top: 90, drillX: 40, notchAngle: 0, extra: true },
    { name: 'M', right: 100, top: 100, drillX: 50, notchAngle: 10 },
    { name: 'L', right: 110, top: 110, drillX: 60, notchAngle: 20, extra: true },
  ];

  E(0, 'SECTION');
  E(2, 'HEADER');
  E(9, '$ACADVER');
  E(1, 'AC1015');
  E(9, '$INSUNITS');
  E(70, 4);
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'BLOCKS');
  for (const size of sizes) {
    const name = `FRONT_${size.name}`;
    E(0, 'BLOCK');
    E(8, 0);
    E(2, name);
    E(70, 0);
    E(10, 0);
    E(20, 0);
    E(30, 0);
    E(3, name);
    // The tech-card's current all-size writer uses R2000 LWPOLYLINEs.
    E(0, 'LWPOLYLINE');
    E(8, 1);
    E(100, 'AcDbPolyline');
    E(90, size.extra ? 5 : 4);
    E(70, 1);
    for (const p of [
      { x: 0, y: 0 },
      { x: size.right, y: 0 },
      ...(size.extra ? [{ x: size.right, y: size.top / 2 }] : []),
      { x: size.right, y: size.top },
      { x: 0, y: size.top },
    ]) {
      E(10, p.x);
      E(20, p.y);
    }
    // This point has the same delta row as the second outline vertex, so they share a rule id.
    E(0, 'POINT');
    E(8, 13);
    E(10, size.drillX);
    E(20, 50);
    E(30, 0);
    // A POINT notch's angle is fixed entity metadata and cannot vary through a RUL. The writer
    // emits its equivalent layer-4 line and grades both endpoints instead.
    E(0, 'POINT');
    E(8, 4);
    E(10, 20);
    E(20, 0);
    E(30, 4);
    E(50, size.notchAngle);
    text('PIECE NAME: FRONT');
    text(`SIZE: ${size.name}`);
    E(0, 'ENDBLK');
    E(8, 0);
  }
  E(0, 'ENDSEC');
  E(0, 'SECTION');
  E(2, 'ENTITIES');
  for (const size of sizes) {
    E(0, 'INSERT');
    E(8, 0);
    E(2, `FRONT_${size.name}`);
    E(10, 0);
    E(20, 0);
    E(30, 0);
  }
  E(0, 'ENDSEC');
  E(0, 'EOF');
  return tags.map(([code, value]) => `${String(code).padStart(3)}\r\n${value}\r\n`).join('');
};

const near = (actual: Point, expected: Point, message: string) => {
  assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) <= 0.1, message);
};

export async function main(): Promise<void> {
  const source = gradedDxf();
  const out = writeDxfRulArchive(source, {
    stem: 'Style 42',
    sizes: ['S', 'M', 'L'],
    base: 'M',
    tableName: 'Style 42',
    now: new Date('2026-01-02T03:04:05Z'),
  });

  assert.equal(out.fileName, 'Style 42.zip');
  assert.equal(out.dxfFileName, 'Style 42.dxf');
  assert.equal(out.rulFileName, 'Style 42.rul');
  assert.equal(out.base, 'M');
  assert.deepEqual(out.sizes, ['S', 'M', 'L']);
  assert.ok(out.rules >= 4, 'stationary and moving delta rows were written');
  assert.ok(out.maxErrMm <= 0.1);

  const pair = zipRulPair(await out.blob.arrayBuffer());
  assert.ok(pair, 'the importer recognises the emitted ZIP as one DXF + RUL pair');
  assert.equal(pair.dxf.name, 'Style 42.dxf');
  assert.equal(pair.rul.name, 'Style 42.rul');

  const table = parseRul(pair.rul.bytes, pair.rul.name);
  assert.match(table.version, /D6673-04/i);
  assert.equal(table.units, 'metric');
  assert.equal(table.name, 'Style 42');
  assert.deepEqual(table.sizes, ['S', 'M', 'L']);
  assert.equal(table.sample, 'M');
  assert.deepEqual(table.rules.get(0), [
    { dx: 0, dy: 0 },
    { dx: 0, dy: 0 },
    { dx: 0, dy: 0 },
  ]);

  const baseText = new TextDecoder().decode(pair.dxf.bytes);
  assert.match(baseText, /AC1009/);
  assert.doesNotMatch(baseText, /LWPOLYLINE/);
  const base = pieceBlocks(buildAst(loadDxf(pair.dxf.bytes).tok.tags))[0];
  const rulesAt = new Map(
    base.entities
      .filter((entity) => entity.kind === 'rule')
      .map((entity) => [`${entity.slots[0].x},${entity.slots[0].y}`, entity.rule]),
  );
  assert.equal(rulesAt.get('0,0'), 0, 'a stationary point uses rule 0');
  assert.ok((rulesAt.get('100,0') ?? 0) > 0);
  assert.equal(
    rulesAt.get('100,0'),
    rulesAt.get('50,50'),
    'points with identical delta vectors share one rule id',
  );

  const inferred = await exportDxfRulArchive(enc(source), 'Style 42.dxf');
  assert.deepEqual(inferred.sizes, ['S', 'M', 'L']);
  assert.equal(inferred.base, 'M');

  const expanded = expandRul({
    dxf: pair.dxf.bytes,
    dxfName: pair.dxf.name,
    rul: table,
    rulName: pair.rul.name,
  });
  const blocks = new Map(
    pieceBlocks(buildAst(loadDxf(enc(expanded.text)).tok.tags)).map((piece) => [
      piece.block.name,
      piece,
    ]),
  );
  for (const expected of [
    { size: 'S', right: 90, top: 90, drillX: 40, notchAngle: 0 },
    { size: 'M', right: 100, top: 100, drillX: 50, notchAngle: 10 },
    { size: 'L', right: 110, top: 110, drillX: 60, notchAngle: 20 },
  ]) {
    const piece = blocks.get(`FRONT_${expected.size}`);
    assert.ok(piece, `round trip contains FRONT_${expected.size}`);
    const cut = piece.entities.find((entity) => entity.kind === 'chain' && entity.layer === '1');
    const drill = piece.entities.find((entity) => entity.kind === 'point' && entity.layer === '13');
    const notch = piece.entities.find((entity) => entity.kind === 'chain' && entity.layer === '4');
    assert.ok(cut && drill && notch);
    near(cut.slots[1], { x: expected.right, y: 0 }, `${expected.size} right corner`);
    const top = cut.slots.find(
      (point) =>
        Math.abs(point.x - expected.right) < 1e-6 && Math.abs(point.y - expected.top) < 1e-6,
    );
    assert.ok(top);
    near(top, { x: expected.right, y: expected.top }, `${expected.size} top corner`);
    near(drill.slots[0], { x: expected.drillX, y: 50 }, `${expected.size} drill`);
    near(notch.slots[0], { x: 20, y: 0 }, `${expected.size} notch position`);
    const angle = (expected.notchAngle * Math.PI) / 180;
    near(
      notch.slots[1],
      { x: 20 + 4 * Math.cos(angle), y: 4 * Math.sin(angle) },
      `${expected.size} notch direction`,
    );
  }

  console.log('PASS  RUL writer: header, rule 0, shared rules, R12 base, matching ZIP names');
  console.log('PASS  DXF + RUL export -> importer: all graded points return within 0.1 mm');
}
