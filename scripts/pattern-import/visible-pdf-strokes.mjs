import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function readPdfDrawing(bytes, sheet, wantedFill) {
  const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const mul = Util.transform,
    apply = Util.applyTransform,
    mm = 25.4 / 72;
  const pose = new Map(sheet.poses.map((p) => [p.page, p]));
  const toSheet = (p, page) => {
    const { a, b, c, d, e, f } = pose.get(page).toSheet;
    return { x: mm * (a * p[0] + c * p[1]) + e, y: mm * (b * p[0] + d * p[1]) + f };
  };
  const toPage = (p, page) => {
    const { a, b, c, d, e, f } = pose.get(page).toSheet,
      det = a * d - b * c;
    return [
      (d * (p.x - e) - c * (p.y - f)) / det / mm,
      (-b * (p.x - e) + a * (p.y - f)) / det / mm,
    ];
  };
  const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const pages = new Map();
  function pagePaint(page, ops, view) {
    const strokes = new Map(),
      fills = new Map();
    let gs = {
        matrix: [1, 0, 0, 1, 0, 0],
        clip: view,
        dash: [],
        rgb: [0, 0, 0],
        width: 1,
        strokeOpacity: 1,
        fillOpacity: 1,
        masked: false,
      },
      path,
      stack = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i],
        a = ops.argsArray[i];
      if (fn === OPS.save) stack.push({ ...gs });
      else if (fn === OPS.restore) gs = stack.pop();
      else if (fn === OPS.transform) gs.matrix = mul(gs.matrix, a);
      else if (fn === OPS.setDash) gs.dash = a[0];
      else if (fn === OPS.setStrokeRGBColor) gs.rgb = Array.from(a);
      else if (fn === OPS.setLineWidth) gs.width = a[0];
      else if (fn === OPS.setGState) {
        for (const [key, v] of a[0] ?? []) {
          if (key === 'ca') gs.fillOpacity = v;
          if (key === 'CA') gs.strokeOpacity = v;
          if (key === 'SMask') gs.masked = v !== false && v !== null;
        }
      } else if (fn === OPS.constructPath) path = { cmd: a[0], xy: a[1], matrix: gs.matrix };
      else if (fn === OPS.clip || fn === OPS.eoClip) {
        if (!path || path.cmd.length !== 1 || path.cmd[0] !== OPS.rectangle) {
          gs.clip = null;
          continue;
        }
        const [x, y, w, h] = path.xy;
        const box = [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ].map((p) => apply(p, path.matrix));
        if (
          !gs.clip ||
          box.some((p, i) => p[0] !== box[(i + 1) % 4][0] && p[1] !== box[(i + 1) % 4][1])
        ) {
          gs.clip = null;
          continue;
        }
        gs.clip = [
          Math.max(gs.clip[0], Math.min(...box.map((p) => p[0]))),
          Math.max(gs.clip[1], Math.min(...box.map((p) => p[1]))),
          Math.min(gs.clip[2], Math.max(...box.map((p) => p[0]))),
          Math.min(gs.clip[3], Math.max(...box.map((p) => p[1]))),
        ];
      } else if (
        fn === OPS.fill &&
        wantedFill?.(page, i) &&
        gs.fillOpacity === 1 &&
        !gs.masked &&
        path
      ) {
        fills.set(i, { ...path, clip: gs.clip, page });
      } else if (
        [OPS.stroke, OPS.closeStroke].includes(fn) &&
        gs.strokeOpacity === 1 &&
        !gs.masked &&
        path
      ) {
        strokes.set(i, {
          ...path,
          dash: gs.dash,
          pen: JSON.stringify([gs.rgb, gs.width]),
          clip: gs.clip,
          closed: fn === OPS.closeStroke || path.cmd.includes(OPS.closePath),
          id: i,
          page,
        });
      }
    }
    return { strokes, fills };
  }
  async function load(page) {
    if (!pages.has(page)) {
      const p = await doc.getPage(page + 1);
      const data = pagePaint(page, await p.getOperatorList(), p.view);
      data.labels = (await p.getTextContent()).items
        .filter((t) => t.str)
        .map((t) => ({ text: t.str.trim(), p: toSheet(t.transform.slice(4, 6), page) }));
      pages.set(page, data);
      p.cleanup();
    }
    return pages.get(page);
  }
  const eligible = (xy, clip) =>
    clip &&
    xy[0] >= clip[0] - 0.001 &&
    xy[1] >= clip[1] - 0.001 &&
    xy[0] <= clip[2] + 0.001 &&
    xy[1] <= clip[3] + 0.001;
  // Tiled copies can start at a different vertex or split their paint operations.
  // Match the visible original ink in physical coordinates, inside the active page clip.
  function rawPieces(stroke) {
    const result = [];
    let run = [],
      k = 0,
      last,
      first;
    const take = () => toSheet(apply([stroke.xy[k++], stroke.xy[k++]], stroke.matrix), stroke.page);
    const finish = () => {
      if (run.length > 1) result.push(run);
      run = [];
    };
    for (const op of stroke.cmd) {
      if (op === OPS.moveTo) {
        finish();
        last = first = take();
        run.push(last);
      } else if (op === OPS.lineTo) {
        last = take();
        run.push(last);
      } else if (op === OPS.closePath) {
        if (first) {
          run.push(first);
          last = first;
        }
      } else if ([OPS.curveTo, OPS.curveTo2, OPS.curveTo3].includes(op)) {
        const a = last,
          c1 = op === OPS.curveTo2 ? a : take(),
          c2 = take(),
          b = op === OPS.curveTo3 ? c2 : take();
        const n = Math.max(
          2,
          Math.ceil((distance(a, c1) + distance(c1, c2) + distance(c2, b)) / 1.5),
        );
        for (let j = 1; j <= n; j++) {
          const t = j / n,
            u = 1 - t;
          run.push({
            x: u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x,
            y: u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y,
          });
        }
        last = b;
      } else if (op === OPS.rectangle) {
        finish();
        const [x, y, w, h] = stroke.xy.slice(k, k + 4);
        k += 4;
        result.push(
          [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
            [x, y],
          ].map((p) => toSheet(apply(p, stroke.matrix), stroke.page)),
        );
      } else throw new Error('Unsupported original path operation ' + op);
    }
    finish();
    return result;
  }
  return { doc, apply, pose, pages, load, eligible, toSheet, toPage, rawPieces, distance };
}
