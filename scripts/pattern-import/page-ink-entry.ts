// PATTERN-IMPORT · page-ink diag — what the line work on a page set aside is.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Session } from 'lib/pattern-import/worker/session';
import { pageChains } from 'lib/pattern-import/clean/page-chains';
import { PATIMPORT } from 'lib/pattern-import/types';
import type { IRPage, SourceDoc } from 'lib/pattern-import/types';
import './e2e-entry';

const ctx = { checkCancel: () => {}, progress: () => {} };

function area(q: { x: number; y: number }[]) {
  let a = 0;
  for (let k = 0, j = q.length - 1; k < q.length; j = k++)
    a += (q[j].x + q[k].x) * (q[j].y - q[k].y);
  return Math.abs(a) / 2;
}
function axisShare(q: { x: number; y: number }[], closed: boolean) {
  let ax = 0;
  let all = 0;
  const n = closed ? q.length : q.length - 1;
  for (let k = 0; k < n; k++) {
    const a = q[k];
    const b = q[(k + 1) % q.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    all += l;
    const ang = (Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) * 180) / Math.PI;
    const d = Math.min(ang % 90, 90 - (ang % 90));
    if (d <= 1.5) ax += l;
  }
  return all ? ax / all : 0;
}

async function dump(files: string[]) {
  for (const f of files) {
    const b = readFileSync(f);
    const s = new Session(1, [
      {
        name: basename(f),
        bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
      },
    ]);
    await s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx);
    const cl = await s.runStage('clean', { edits: [] }, ctx);
    const docs = (s as unknown as { docs: SourceDoc[] }).docs;
    const penOf = (pg: IRPage, style: number) => {
      const st = pg.styles.find((x) => x.id === style);
      return st
        ? `${st.widthMm.toFixed(2)}|${st.strokeRgb}|${st.dash ? st.dash.map((x) => x.toFixed(1)).join(',') : '-'}|${st.fill}`
        : '?';
    };
    const tilePens = new Map<string, number>();
    for (const c of cl.classes) {
      if (c.cls !== 'tile') continue;
      const pg = docs[0].pages.find((p) => p.page === c.page)!;
      const pc = pageChains(pg);
      for (const ch of pc.chains)
        if (ch.lengthMm >= 100) {
          const k = penOf(pg, ch.style);
          if (process.env.INK_PEN && k.startsWith(process.env.INK_PEN) && !tilePens.has(k)) {
            const b = pc.box[pc.chains.indexOf(ch)];
            console.log(
              `   tile p${pg.page + 1} pen ${k}: len ${Math.round(ch.lengthMm)} box ${Math.round(b.minX)},${Math.round(b.minY)} ${Math.round(b.maxX - b.minX)}x${Math.round(b.maxY - b.minY)} closed ${ch.closed}`,
            );
          }
          tilePens.set(k, (tilePens.get(k) ?? 0) + 1);
        }
    }
    console.log(
      `\n=== ${basename(f)}: ${cl.classes.length} pages · tile pens ${JSON.stringify([...tilePens].sort((a, b) => b[1] - a[1]).slice(0, 8))}`,
    );
    for (const d of cl.dropped) {
      if (d.status !== 'suggest') continue;
      const c = cl.classes.find((x) => x.page === d.page)!;
      const pg = docs[0].pages.find((p) => p.page === d.page) as IRPage;
      const pc = pageChains(pg);
      const styles = new Map(pg.styles.map((x) => [x.id, x]));
      console.log(
        `p${d.page + 1} ${c.cls} ${c.confidence.toFixed(2)} ${Math.round(pg.widthMm)}x${Math.round(pg.heightMm)} ink=${JSON.stringify(c.ink)} chains=${pc.chains.length} texts=${pg.texts.length} rasters=${pg.rasters.length} face=${!!d.face} copy=${JSON.stringify(d.reducedCopy ?? null)} | ${d.drawing}`,
      );
      console.log(
        `   INK ${d.ink?.explained ? 'EXPLAINED ' + d.ink.explained : 'UNEXPLAINED ' + (d.ink?.unexplained ?? '(no tiles)')}`,
      );
      if (!process.env.INK_CHAINS) continue;
      let shown = 0;
      pc.chains.forEach((ch, i) => {
        const bx = pc.box[i];
        const ar = ch.closed ? area(ch.pts) : 0;
        if (ch.lengthMm < 100 && ar < PATIMPORT.minPieceAreaMm2) return;
        if (shown++ > 25) return;
        const st = styles.get(ch.style);
        const pen = penOf(pg, ch.style);
        const inside = pg.texts.filter(
          (t) =>
            t.anchor.x > bx.minX &&
            t.anchor.x < bx.maxX &&
            t.anchor.y > bx.minY &&
            t.anchor.y < bx.maxY,
        ).length;
        console.log(
          `   ${tilePens.has(pen) ? 'TILEPEN' : '       '} txt${inside} len ${Math.round(ch.lengthMm)} ${ch.closed ? `closed ${Math.round(ar)}mm²` : 'open'} box ${Math.round(bx.minX)},${Math.round(bx.minY)} ${Math.round(bx.maxX - bx.minX)}x${Math.round(bx.maxY - bx.minY)} pts ${ch.pts.length} axis ${axisShare(ch.pts, ch.closed).toFixed(2)} w ${st?.widthMm.toFixed(2)} rgb ${st?.strokeRgb} dash ${st?.dash ?? ch.motif ?? '-'} fill ${st?.fill}`,
        );
      });
      if (shown > 26) console.log(`   … ${shown} pattern-like chains`);
    }
    s.close();
  }
}

export async function main(args: string[]): Promise<number> {
  await dump(args);
  return 0;
}
