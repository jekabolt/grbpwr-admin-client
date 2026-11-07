// docs/pattern-pdf-etalon.md — a PDF with no curves is junk (Skirt-Pocket.pdf).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pdfHasNoCurves } from '../../src/lib/pattern-import/etalon/junk.ts';

test('a picture page with no paths is junk', () => {
  assert.equal(pdfHasNoCurves([{ paths: [] }]), true);
});

test('one curve on any page is not junk', () => {
  assert.equal(pdfHasNoCurves([{ paths: [] }, { paths: [1] }]), false);
});

test('a PDF that opened with no pages is junk', () => {
  assert.equal(pdfHasNoCurves([]), true);
});
