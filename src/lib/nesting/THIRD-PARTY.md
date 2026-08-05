# Third-party notices — lib/nesting

- **SVGnest** (Jack Qiao, MIT, https://github.com/Jack000/SVGnest): the nesting *algorithm*
  lineage — no-fit-polygon placement with an inner-fit rectangle, bottom-left scoring by
  resulting strip length, and the seeded order+rotation genetic search (OX crossover,
  adjacent-swap mutation, rank selection, elitism). No SVGnest code is vendored; the
  implementation in `nest/` is written from scratch in TypeScript.
- **clipper2-js** (BSL-1.0, port of Angus Johnson's Clipper2): boolean union/difference
  and Ramer-Douglas-Peucker only. Source-notice license; no source is redistributed here.
- **dxf-parser** (MIT): DXF tokenizer. Geometry interpretation (tessellation, block
  expansion, loop chaining) is local code in `dxf/`.

Empirical notes for clipper2-js@1.2.4 this code relies on (verified by harness tests):
- `Clipper.Union(subject, clip, fillRule)` — fill rule is the THIRD positional arg;
  passing it second throws "paths is not iterable".
- `Clipper.MinkowskiDiff` and `Clipper.InflatePaths` are numerically BROKEN in this port
  on real polygons: the NFP came back with phantom interior holes (pieces then overlap),
  offsets came back asymmetric (60×40 rect → maxX 60.0 instead of 60.25). The NFP is
  therefore built by convex decomposition (ear-clip triangles × convex Minkowski hulls ×
  circumscribed gap octagon, `geom/triangulate.ts` + `geom/convex.ts`) and Clipper handles
  only its well-conditioned cases: union of convex parts, rect-minus-paths difference.
- `Clipper.getBounds` is reliable only on a single `Path64`.
