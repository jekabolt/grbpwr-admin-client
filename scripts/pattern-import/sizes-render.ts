// PATTERN-IMPORT · F3 probe — SVG → PNG overlays (rsvg-convert). Probe-only, not a module API.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import type { BoxMm, PtMm } from 'lib/pattern-import/types';

export type Stroke = {
  pts: PtMm[];
  color: string;
  width?: number;
  dash?: string;
  closed?: boolean;
};
export type Label = { at: PtMm; text: string; color: string; size?: number };

export const PALETTE = [
  '#e41a1c',
  '#377eb8',
  '#4daf4a',
  '#984ea3',
  '#ff7f00',
  '#a65628',
  '#f781bf',
  '#17becf',
  '#bcbd22',
  '#1b9e77',
  '#7570b3',
  '#e7298a',
  '#66a61e',
  '#e6ab02',
];

export function renderPng(
  file: string,
  box: BoxMm,
  strokes: Stroke[],
  labels: Label[],
  pxPerMm: number,
  legend: { color: string; text: string }[] = [],
) {
  const W = Math.ceil((box.maxX - box.minX) * pxPerMm);
  const H = Math.ceil((box.maxY - box.minY) * pxPerMm);
  const X = (x: number) => ((x - box.minX) * pxPerMm).toFixed(1);
  const Y = (y: number) => ((box.maxY - y) * pxPerMm).toFixed(1);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="white"/>`,
  ];
  const inBox = (pts: PtMm[]) =>
    pts.some(
      (p) =>
        p.x >= box.minX - 5 && p.x <= box.maxX + 5 && p.y >= box.minY - 5 && p.y <= box.maxY + 5,
    );
  for (const s of strokes) {
    if (s.pts.length < 2 || !inBox(s.pts)) continue;
    const d =
      s.pts.map((p, k) => `${k ? 'L' : 'M'}${X(p.x)} ${Y(p.y)}`).join('') + (s.closed ? 'Z' : '');
    parts.push(
      `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? 1}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} stroke-linecap="round"/>`,
    );
  }
  for (const l of labels) {
    if (l.at.x < box.minX || l.at.x > box.maxX || l.at.y < box.minY || l.at.y > box.maxY) continue;
    const t = l.text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    parts.push(
      `<text x="${X(l.at.x)}" y="${Y(l.at.y)}" font-size="${l.size ?? 12}" font-family="monospace" fill="${l.color}" stroke="white" stroke-width="3" paint-order="stroke">${t}</text>`,
    );
  }
  legend.forEach((g, i) => {
    parts.push(`<rect x="8" y="${8 + i * 18}" width="14" height="10" fill="${g.color}"/>`);
    parts.push(
      `<text x="28" y="${17 + i * 18}" font-size="13" font-family="monospace" fill="#000" stroke="white" stroke-width="3" paint-order="stroke">${g.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`,
    );
  });
  parts.push('</svg>');
  const svg = file.replace(/\.png$/, '.svg');
  writeFileSync(svg, parts.join(''));
  execFileSync('rsvg-convert', ['-o', file, svg]);
}
