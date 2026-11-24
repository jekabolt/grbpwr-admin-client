import assert from 'node:assert/strict';
import { OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
// Resolve every active clip in the original page coordinate system. A clip takes effect
// after the paint/end-path operator. Reject other coordinate systems on this pinned page.
export function sourceFills(ops, selected) {
  const fills = new Map(),
    saved = [];
  let matrix = [1, 0, 0, 1, 0, 0],
    clips = [],
    path,
    pendingClip;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const op = ops.fnArray[i],
      args = ops.argsArray[i];
    if (op === OPS.save) saved.push([matrix, clips]);
    else if (op === OPS.restore) [matrix, clips] = saved.pop();
    else if (op === OPS.transform) matrix = Util.transform(matrix, args);
    else if (op === OPS.constructPath) path = { ops: args[0], xy: args[1], matrix, id: i };
    else if (op === OPS.clip || op === OPS.eoClip)
      pendingClip = { ...path, rule: op === OPS.clip ? 'nonzero' : 'evenodd' };
    else if (
      [
        OPS.endPath,
        OPS.fill,
        OPS.eoFill,
        OPS.stroke,
        OPS.closeStroke,
        OPS.fillStroke,
        OPS.eoFillStroke,
        OPS.closeFillStroke,
        OPS.closeEOFillStroke,
      ].includes(op)
    ) {
      if (selected.has(i)) {
        assert.equal(op, OPS.fill);
        fills.set(i, { path, clips });
      }
      if (pendingClip) {
        clips = [...clips, pendingClip];
        pendingClip = undefined;
      }
    } else if ([OPS.paintFormXObjectBegin, OPS.beginAnnotation].includes(op))
      throw Error('Unexpected nested PDF transform');
  }
  return fills;
}

export function draw(ctx, path) {
  ctx.beginPath();
  let at = 0,
    last,
    first;
  const take = () => Util.applyTransform([path.xy[at++], path.xy[at++]], path.matrix);
  for (const op of path.ops) {
    if (op === OPS.moveTo) {
      last = first = take();
      ctx.moveTo(...last);
    } else if (op === OPS.lineTo) {
      last = take();
      ctx.lineTo(...last);
    } else if (op === OPS.closePath) {
      ctx.closePath();
      last = first;
    } else if (op === OPS.rectangle) {
      const [x, y, w, h] = path.xy.slice(at, at + 4);
      at += 4;
      const corners = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ].map((p) => Util.applyTransform(p, path.matrix));
      ctx.moveTo(...corners[0]);
      for (const p of corners.slice(1)) ctx.lineTo(...p);
      ctx.closePath();
      last = first = corners[0];
    } else {
      assert([OPS.curveTo, OPS.curveTo2, OPS.curveTo3].includes(op), 'Unsupported path operation');
      const a = op === OPS.curveTo2 ? last : take(),
        b = take(),
        c = op === OPS.curveTo3 ? b : take();
      ctx.bezierCurveTo(...a, ...b, ...c);
      last = c;
    }
  }
}
