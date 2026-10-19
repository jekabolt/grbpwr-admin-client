// Print tile of the union probe as plain SVG in paper millimetres (the 28×16 mm tile of paper.ts),
// drawn with its tile frame so «no bleed» can be seen as well as measured.
import type { Prim } from '../../src/components/managers/tech-card/assembly-print/paper';

export function unitPrintSvg(prims: Prim[], w: number, h: number): string {
  const body = prims
    .map((p) =>
      p.k === 'poly'
        ? `<polygon points="${p.pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}" fill="none" stroke="#000" stroke-width="${p.sw}" stroke-linejoin="round"/>`
        : '',
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${w + 2} ${h + 2}" width="${(w + 2) * 4}" height="${(h + 2) * 4}"><rect x="0" y="0" width="${w}" height="${h}" fill="#fff" stroke="#999" stroke-width="0.1" stroke-dasharray="0.6 0.4"/>${body}</svg>`;
}
