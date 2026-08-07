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
  therefore built by convex decomposition (ear-clip + greedy Hertel–Mehlhorn merge to
  convex parts × convex Minkowski hulls × circumscribed gap octagon,
  `geom/triangulate.ts` + `geom/convex.ts`) and Clipper handles only its
  well-conditioned cases: union of convex parts, rect-minus-paths difference.
- `Clipper.Union` degrades CATASTROPHICALLY with many overlapping inputs: 64 paths union
  in ~3 ms, ~100 paths exhaust a 4 GB heap. Never hand it an unbatched pairwise
  decomposition — `nest/nfp.ts` merges triangles into convex parts first (~6-25 per
  piece) AND unions hierarchically in batches of 32 (`unionBatched`).
- `Clipper.stripDuplicates` compares points by REFERENCE (`lastPt !== path[i]`) — a no-op
  on freshly built paths; `geom/clipper.ts` carries its own coordinate-comparing dedupe.
- `Clipper.getBounds` is reliable only on a single `Path64`.

## clipper2-js: Union and Difference agree on a WRONG region (verified 2026-08-06)

The union of convex Minkowski parts can come back with bays bitten out of it — measured
up to **1.09 cm deep on 25 of 32 pair-rotations** of the benchmark set. `Clipper.Difference`
of the same inputs against that result reports **no residual**, so any coverage self-check
built on this library is structurally blind to its own defect.

Consequences baked into the engine:

- the union NFP **generates candidate positions only** (it is compact and cheap to walk);
- the raw convex Minkowski parts are kept alongside it and decide **acceptance**
  (point-in-part by exact integer winding) — they never touch a boolean op;
- and because even the parts are built from *simplified* contours (RDP + convex
  decomposition), the position finally chosen is verified against the **true contours**
  at the promised gap. Measured: parts-only acceptance still let pairs land at 0.0000 cm
  true clearance (the accepted point sat on a part boundary while the simplified contours
  themselves touched); with true-contour verification the 7600-pair sweep reports zero
  violations in both grain modes.

The rule of thumb this leaves: never let a derived model of the geometry decide a promise
the marker makes. Verify the promise.
