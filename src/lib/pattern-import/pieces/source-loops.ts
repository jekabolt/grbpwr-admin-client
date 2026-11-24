import type {ChainSet,PieceCandidate,Seed,Sheet,SizeRun,PtMm} from 'lib/pattern-import/types';
import {bboxOf,pointInPoly,signedArea,dist} from './geom';

/** A face-seeded family may have every size already drawn as a single closed PDF stroke.
 * The fill identifies the face; preserve the source vertices where snapping switched walls. */
export function restoreSourceLoops(sheet:Sheet,set:ChainSet,run:SizeRun,seeds:Seed[],cands:Map<number,PieceCandidate[]>,excluded:ReadonlySet<number>,along:(p:PtMm[],q:PtMm[],tol:number)=>number){
 const faces=seeds.filter(s=>s.origin==='face'&&cands.get(s.id)?.length===run.sizes.length);
 if(!faces.length)return;
 const paths=new Map(sheet.paths.map(p=>[p.id,p]));
 const ranked=run.sizes.map(s=>set.classes.filter(g=>g.role==='size'&&g.sizeLabel===s.label&&g.evidence.some(e=>e.kind==='legend-sample')).flatMap(g=>g.chains).map(id=>set.chains[id]).filter(c=>{
  if(!c?.closed||c.ranges.length!==1||excluded.has(c.id))return false;
  const r=c.ranges[0],p=paths.get(r.path);
  return p?.closed&&!p.background&&!sheet.styles[p.style]?.fill&&r.from===0&&r.to===p.pts.length;
 }));
 if(ranked.some(cs=>!cs.length))return;
 for(const seed of faces){
  const replacements=[];
  for(const c of cands.get(seed.id)!){
   if(c.outcome!=='closed'||c.rankFrom!=='class'||c.derived?.length)break;
   const matches=ranked[c.rank].filter(ch=>pointInPoly(seed.at,ch.pts));
   if(matches.length!==1)break;
   const ch=matches[0];if(seeds.some(s=>s.id!==seed.id&&pointInPoly(s.at,ch.pts)))break;
   const path=paths.get(ch.ranges[0].path)!;
   let outer=path.pts;
   if(dist(outer[0],outer[outer.length-1])<.001)outer=outer.slice(0,-1);
   const area=signedArea(outer);
   if(area<0)outer=outer.slice().reverse();
   if(along([...outer,outer[0]],c.outer,2.5)<1||along([...c.outer,c.outer[0]],outer,2.5)<1)break;
   replacements.push({c,outer,wall:ch.id,area:Math.abs(area)});
  }
  if(replacements.length!==run.sizes.length)continue;
  for(const {c,outer,wall,area} of replacements){
   c.outer=outer;c.areaMm2=area;c.bbox=bboxOf(outer);c.walls=[wall];c.sourceCoverage=1;c.p95Mm=0;
  }
 }
}
