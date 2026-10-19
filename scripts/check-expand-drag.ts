import assert from 'node:assert/strict';

import {
  dragHandle,
  dragPhoto,
  nudgeHandle,
  snapAxis,
  type DragOpts,
  type HandleDir,
} from '../src/components/managers/media/utils/expandDrag.ts';
import type { Margins } from '../src/components/managers/media/utils/getExpanded.ts';

const presets = [2, 16 / 9, 3 / 2, 4 / 3, 5 / 4, 1, 4 / 5, 3 / 4, 2 / 3, 9 / 16];
const baseOpts: DragOpts = {
  mirror: false,
  snap: true,
  presets,
  srcW: 821,
  srcH: 821,
};
const zero: Margins = { top: 0, right: 0, bottom: 0, left: 0 };
const directions: HandleDir[] = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];

function size(margins: Margins, srcW = 821, srcH = 821) {
  return {
    width: srcW + margins.left + margins.right,
    height: srcH + margins.top + margins.bottom,
  };
}

function assertMargins(margins: Margins, message: string) {
  for (const [side, value] of Object.entries(margins)) {
    assert.equal(Number.isInteger(value), true, `${message}: ${side} must be an integer`);
    assert.equal(value >= 0, true, `${message}: ${side} must not be negative`);
  }
}

// Deterministic fuzz: every handle, arbitrary start margins/deltas, mirror and snapping combinations.
let seed = 0x5eed1234;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x1_0000_0000;
};
for (let i = 0; i < 2_000; i += 1) {
  const start: Margins = {
    top: Math.round(random() * 1_000),
    right: Math.round(random() * 1_000),
    bottom: Math.round(random() * 1_000),
    left: Math.round(random() * 1_000),
  };
  const result = dragHandle(
    start,
    directions[Math.floor(random() * directions.length)],
    (random() - 0.5) * 8_000,
    (random() - 0.5) * 8_000,
    {
      ...baseOpts,
      mirror: random() < 0.5,
      snap: random() < 0.5,
      maxMegapixels: 40,
    },
  );
  assertMargins(result, `fuzz case ${i}`);
}

const mirrored = dragHandle(zero, 'e', 240, 0, { ...baseOpts, mirror: true, snap: false });
assert.deepEqual(mirrored, { top: 0, right: 240, bottom: 0, left: 240 });
const mirroredSnap = dragHandle(zero, 'e', 315, 0, { ...baseOpts, mirror: true });
assert.deepEqual(mirroredSnap, { top: 0, right: 320, bottom: 0, left: 319 });

const wide = dragHandle(zero, 'e', 630, 0, baseOpts);
assert.deepEqual(size(wide), { width: 1460, height: 821 });
assert.equal(wide.right, 639);

const tall = dragHandle(zero, 's', 0, 198, baseOpts);
assert.deepEqual(size(tall), { width: 821, height: 1026 });
assert.equal(tall.bottom, 205);

const freeWide = dragHandle(zero, 'e', 630, 0, { ...baseOpts, snap: false });
assert.deepEqual(size(freeWide), { width: 1451, height: 821 });

const moved = dragPhoto({ top: 40, right: 70, bottom: 61, left: 30 }, 20, 8, 0);
assert.deepEqual(moved, { top: 48, right: 50, bottom: 53, left: 50 });
assert.equal(moved.left + moved.right, 100);
assert.equal(moved.top + moved.bottom, 101);
assert.deepEqual(dragPhoto(moved, 10_000, -10_000, 0), {
  top: 0,
  right: 0,
  bottom: 101,
  left: 100,
});
assert.deepEqual(dragPhoto({ top: 49, right: 51, bottom: 52, left: 50 }, 0, 1, 2), {
  top: 50,
  right: 51,
  bottom: 51,
  left: 50,
});

const capped = dragHandle(zero, 'e', 5_000, 0, {
  ...baseOpts,
  snap: false,
  srcW: 4_000,
  srcH: 3_000,
  maxMegapixels: 13,
});
const cappedSize = size(capped, 4_000, 3_000);
assert.equal((cappedSize.width * cappedSize.height) / 1_000_000 <= 13, true);
assert.equal(cappedSize.width, 4_333);

const cappedCorner = dragHandle(zero, 'se', 8_000, 8_000, {
  ...baseOpts,
  snap: false,
  srcW: 4_000,
  srcH: 3_000,
  maxMegapixels: 20,
});
const cappedCornerSize = size(cappedCorner, 4_000, 3_000);
assert.equal((cappedCornerSize.width * cappedCornerSize.height) / 1_000_000 <= 20, true);

assert.equal(snapAxis('x', 1_451, 821, 821, [16 / 9], 0.012), 1_460);
assert.deepEqual(nudgeHandle(zero, 'nw', 10, { ...baseOpts, snap: false }), {
  top: 10,
  right: 0,
  bottom: 0,
  left: 10,
});

console.log('check-expand-drag: 2000 fuzz cases and directed checks passed');
